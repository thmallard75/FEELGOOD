#!/usr/bin/env python3
# ETL Geofabrik -> OsmTileCache.
#
# - Index de localisations PARTIEL (sparse) : on ne stocke en memoire que les
#   nœuds dans les bbox des departements pending (+ marge). Anti-OOM sur les
#   runners GitHub a 7 Go de RAM (vs locations=True qui indexe la France entiere).
# - Vision d'avancement : % d'octets du PBF deja lus (sonde /proc/self/fdinfo),
#   compts de nœuds/ways et phase courante rafraichis toutes les 5 s,
#   puis % pousse lors de l'envoi des batches.

import os, sys, time, json, math, re, threading, urllib.request, urllib.error
import osmium

CELL = 0.01
MARGIN = 0.05  # marge (~5 km)

MOTOR = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'unclassified',
    'residential', 'living_street', 'road',
}
NON_MOTOR = {'footway', 'cycleway', 'path', 'pedestrian', 'steps', 'track', 'bridleway'}
DEFAULTS = {
    'motorway': 130, 'motorway_link': 110, 'trunk': 110, 'trunk_link': 90,
    'primary': 80, 'primary_link': 80, 'secondary': 80, 'secondary_link': 80,
    'tertiary': 80, 'tertiary_link': 80, 'unclassified': 80,
    'residential': 30, 'living_street': 20, 'service': 30, 'road': 50,
}

KEY = os.environ['GEOSERVICE_KEY']
BASE = os.environ.get('APP_BASE', 'https://feel-good-drive.base44.app')
PBF = os.environ.get('PBF_PATH', '/tmp/france-latest.osm.pbf')
UA = 'feelgood-etl/1.0'


def ckey(lat, lon):
    return f"{math.floor(lat / CELL)}_{math.floor(lon / CELL)}"


def parse_maxspeed(t):
    if not t:
        return None
    s = t.strip()
    try:
        v = int(s.split()[0])
        if v > 0:
            return v
    except ValueError:
        pass
    low = s.lower()
    if 'urban' in low:
        return 50
    if 'rural' in low:
        return 80
    if 'motorway' in low:
        return 130
    if 'walk' in low or 'living_street' in low:
        return 20
    if 'mph' in low:
        m = re.search(r'\d+', low)
        return round(int(m.group()) * 1.609) if m else None
    return None


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_pending():
    req = urllib.request.Request(
        f"{BASE}/functions/getPendingDepartements",
        headers={'X-Service-Key': KEY, 'User-Agent': UA})
    with urllib.request.urlopen(req) as r:
        return json.load(r).get('pending', [])


def build_bbox_filters(deps):
    boxes = []
    for d in deps:
        bb = d['bbox']
        boxes.append((
            bb['minLat'] - MARGIN, bb['minLng'] - MARGIN,
            bb['maxLat'] + MARGIN, bb['maxLng'] + MARGIN,
        ))
    return boxes


def in_filter(lat, lon, boxes):
    for (mnlat, mnlng, mxlat, mxlng) in boxes:
        if mnlat <= lat <= mxlat and mnlng <= lon <= mxlng:
            return True
    return False


def dep_for_cell(a, b, deps):
    mid_lat = (a + 0.5) * CELL
    mid_lng = (b + 0.5) * CELL
    for d in deps:
        bb = d['bbox']
        if bb['minLat'] <= mid_lat < bb['maxLat'] and bb['minLng'] <= mid_lng < bb['maxLng']:
            return d['code']
    return None


def post_batch(dep_code, batch, is_final, cells_total):
    body = json.dumps({
        'departement_code': dep_code,
        'batch': batch,
        'is_final': bool(is_final),
        'cells_total': cells_total,
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/functions/importGeofabrikTiles",
        data=body,
        headers={'X-Service-Key': KEY,
                 'Content-Type': 'application/json',
                 'User-Agent': UA},
        method='POST')
    with urllib.request.urlopen(req) as r:
        return json.load(r)


# ---------- Suivi d'avancement ----------

class Progress:
    def __init__(self, total_bytes):
        self.total = max(total_bytes, 1)
        self.h = None            # handler (pour lire ses compteurs)
        self.phase = 'parse'     # 'parse' | 'push'
        self.push_done = 0
        self.push_total = 0
        self.start = time.time()
        self.stop_evt = threading.Event()

    def _fd_pos(self):
        # /proc/self/fd/<n> -> readlink pour trouver celui qui pointe vers le PBF
        target = os.path.realpath(PBF)
        for name in os.listdir('/proc/self/fd'):
            try:
                link = os.readlink(f'/proc/self/fd/{name}')
            except OSError:
                continue
            if os.path.realpath(link) == target:
                try:
                    with open(f'/proc/self/fdinfo/{name}') as f:
                        for line in f:
                            if line.startswith('pos:'):
                                return int(line.split()[1])
                except OSError:
                    return None
        return None

    def _loop(self):
        while not self.stop_evt.wait(5):
            if self.phase == 'parse':
                pos = self._fd_pos()
                if pos is not None:
                    pct = min(pos / self.total * 100, 100.0)
                    extra = ''
                    if self.h is not None:
                        extra = f' | nodes={self.h.n_nodes:,} ways={self.h.n_ways:,} phase={self.h.phase}'
                    print(f'[progress] {pct:5.1f}% ({pos:,}/{self.total:,} octets) '
                          f'elapsed={int(time.time()-self.start)}s{extra}', flush=True)
                else:
                    print(f'[progress] fd non localise (osmium thread-pool) '
                          f'elapsed={int(time.time()-self.start)}s', flush=True)
            else:
                pct = (self.push_done / self.push_total * 100) if self.push_total else 0
                print(f'[progress] PUSH {pct:5.1f}% ({self.push_done}/{self.push_total} cellules) '
                      f'elapsed={int(time.time()-self.start)}s', flush=True)

    def start_thread(self):
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()
        return t

    def finish(self):
        self.stop_evt.set()


class Handler(osmium.SimpleHandler):
    def __init__(self, deps):
        super().__init__()
        self.deps = deps
        self.boxes = build_bbox_filters(deps)
        self.node_locs = {}
        self.cells = {}
        # compteurs pour l'avancement
        self.n_nodes = 0
        self.n_ways = 0
        self.phase = 'nodes'

    def _rec(self, k):
        if k not in self.cells:
            a, b = (int(x) for x in k.split('_'))
            self.cells[k] = {
                'cell_key': k,
                'min_lat': a * CELL, 'min_lng': b * CELL,
                'max_lat': (a + 1) * CELL, 'max_lng': (b + 1) * CELL,
                'road_data': {'roundabouts': [], 'speedLimits': [], 'stops': []},
                'element_count': 0,
                '_dep': dep_for_cell(a, b, self.deps) if self.deps else None,
            }
        return self.cells[k]

    def node(self, n):
        self.n_nodes += 1
        lat = n.location.lat
        lon = n.location.lon
        if in_filter(lat, lon, self.boxes):
            self.node_locs[n.id] = (lat, lon)
        tags = {t.k: t.v for t in n.tags}
        hw = tags.get('highway')
        if hw == 'mini_roundabout' and in_filter(lat, lon, self.boxes):
            self._add_roundabout(lat, lon, 20, f'mini_{n.id}')
        elif (hw == 'stop' or tags.get('traffic_sign') == 'stop') and in_filter(lat, lon, self.boxes):
            self._add_stop(lat, lon, f'stop_{n.id}')

    def way(self, w):
        self.n_ways += 1
        if self.phase == 'nodes':
            self.phase = 'ways'
        tags = {t.k: t.v for t in w.tags}
        hw = tags.get('highway')
        if not hw or hw in NON_MOTOR:
            return

        if tags.get('junction') == 'roundabout':
            refs = [nd.ref for nd in w.nodes]
            pts = [self.node_locs[r] for r in refs if r in self.node_locs]
            if len(pts) < 3:
                return
            lat = sum(p[0] for p in pts) / len(pts)
            lon = sum(p[1] for p in pts) / len(pts)
            cnt = min(len(pts), 12)
            radius = sum(haversine_m(lat, lon, p[0], p[1]) for p in pts[:cnt]) / cnt
            if radius < 8 or not in_filter(lat, lon, self.boxes):
                return
            mx = parse_maxspeed(tags.get('maxspeed'))
            self._add_roundabout(lat, lon, mx if mx else 30, f'rb_{w.id}')
            return

        if hw in MOTOR:
            mx = parse_maxspeed(tags.get('maxspeed'))
            explicit = mx is not None
            if not mx:
                mx = DEFAULTS.get(hw, 50)
            if hw in ('motorway', 'trunk'):
                rt = 'highway'
            elif hw in ('primary', 'secondary', 'tertiary', 'unclassified'):
                rt = 'periurban'
            else:
                rt = 'urban'
            name = tags.get('name') or None
            refs = [nd.ref for nd in w.nodes]
            for i in range(len(refs) - 1):
                p1 = self.node_locs.get(refs[i])
                p2 = self.node_locs.get(refs[i + 1])
                if not p1 or not p2:
                    continue
                a, b = p1, p2
                mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                if not in_filter(mid[0], mid[1], self.boxes):
                    continue
                rec = self._rec(ckey(mid[0], mid[1]))
                rec['road_data']['speedLimits'].append({
                    'lat_start': round(a[0], 7), 'lon_start': round(a[1], 7),
                    'lat_end': round(b[0], 7), 'lon_end': round(b[1], 7),
                    'speed': mx, 'type': rt, 'highway': hw, 'name': name,
                    'osm_id': int(w.id), 'explicit': explicit,
                })

    def _add_roundabout(self, lat, lon, maxspeed, id_):
        rec = self._rec(ckey(lat, lon))
        rec['road_data']['roundabouts'].append(
            {'lat': round(lat, 7), 'lon': round(lon, 7), 'maxspeed': maxspeed, 'id': id_})

    def _add_stop(self, lat, lon, id_):
        rec = self._rec(ckey(lat, lon))
        rec['road_data']['stops'].append({'lat': round(lat, 7), 'lon': round(lon, 7), 'id': id_})


def main():
    deps = fetch_pending()
    if not deps:
        print('[etl] Aucun departement pending — arret.')
        return
    print(f"[etl] {len(deps)} departement(s) pending: {[d['code'] for d in deps]}")

    if not os.path.exists(PBF) or os.path.getsize(PBF) < 1_000_000_000:
        print(f"[etl] PBF absent/incomplet ({PBF}) — telechargement...")
        urllib.request.urlretrieve(
            'https://download.geofabrik.de/europe/france-latest.osm.pbf', PBF)

    total_bytes = os.path.getsize(PBF)
    print(f"[etl] PBF: {total_bytes:,} octets — parsing (index partiel) en cours...")

    prog = Progress(total_bytes)
    h = Handler(deps)
    prog.h = h
    thread = prog.start_thread()

    h.apply_file(PBF, locations=False)

    prog.phase = 'push'
    print(f"[etl] Parsing termine: {len(h.cells)} cellules produites, "
          f"{len(h.node_locs):,} nœuds indexés — libération de l'index...", flush=True)
    h.node_locs = {}

    by_dep = {}
    for rec in h.cells.values():
        code = rec.pop('_dep', None)
        if not code:
            continue
        rec['element_count'] = (
            len(rec['road_data'].get('roundabouts', []))
            + len(rec['road_data'].get('speedLimits', []))
            + len(rec['road_data'].get('stops', [])))
        if rec['element_count'] == 0:
            continue
        by_dep.setdefault(code, []).append(rec)

    prog.push_total = sum(len(v) for v in by_dep.values()) or 1
    total_created = 0
    for code, cells in by_dep.items():
        cells_total = len(cells)
        print(f"[etl] {code}: {cells_total} cellules a pousser")
        done = 0
        for i in range(0, cells_total, 1000):
            batch = cells[i:i + 1000]
            is_final = (i + 1000) >= cells_total
            resp = post_batch(code, batch, is_final, cells_total)
            c = resp.get('created', 0)
            done += c
            prog.push_done += c
            print(f"[etl]   {code} batch {i//1000 + 1}: created={c} "
                  f"done={resp.get('cells_done')} status={resp.get('status')}", flush=True)
        total_created += done
        print(f"[etl] {code} complete: {done}/{cells_total} cellules")

    prog.finish()
    print(f"[etl] Termine en {int(time.time()-prog.start)}s. cellules poussees={total_created}")


if __name__ == '__main__':
    main()
