#!/usr/bin/env python3
# ETL Geofabrik -> OsmTileCache.
#
# 1. GET getPendingDepartements (cle service) -> [{code, name, bbox, cells_total}]
# 2. Download (si absent) le PBF France Geofabrik.
# 3. Stream pyosmium : emet ronds-points / STOP / limitations par cellule 0.01deg,
#    au format compact attendu par l'app (cf osmCore.ts).
# 4. Assigne chaque cellule au departement pending dont la bbox contient le
#    milieu de la cellule, puis POST par batches vers importGeofabrikTiles.
#
# La cle service (GEOSERVICE_KEY) doit correspondre au secret GEOFABRIK_SERVICE_KEY
# defini cote app Base44.

import os, sys, json, math, re, urllib.request, urllib.error
import osmium

CELL = 0.01

# Routes carrossables uniquement (identique a osmCore.buildCorridorQuery)
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


class Handler(osmium.SimpleHandler):
    def __init__(self, deps):
        super().__init__()
        self.deps = deps
        self.cells = {}  # ckey -> record

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
        tags = {t.k: t.v for t in n.tags}
        hw = tags.get('highway')
        if hw == 'mini_roundabout':
            self._add_roundabout(n.location.lat, n.location.lon, 20, f'mini_{n.id}')
        if hw == 'stop' or tags.get('traffic_sign') == 'stop':
            self._add_stop(n.location.lat, n.location.lon, f'stop_{n.id}')

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        hw = tags.get('highway')
        if not hw or hw in NON_MOTOR:
            return

        if tags.get('junction') == 'roundabout':
            try:
                pts = [(n.location.lat, n.location.lon) for n in w.nodes]
            except RuntimeError:
                return
            if len(pts) < 3:
                return
            lat = sum(p[0] for p in pts) / len(pts)
            lon = sum(p[1] for p in pts) / len(pts)
            cnt = min(len(pts), 12)
            radius = sum(haversine_m(lat, lon, p[0], p[1]) for p in pts[:cnt]) / cnt
            if radius < 8:
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
            try:
                pts = [(n.location.lat, n.location.lon) for n in w.nodes]
            except RuntimeError:
                return
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
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

    if not os.path.exists(PBF):
        print(f"[etl] PBF introuvable ({PBF}) — telechargement...")
        urllib.request.urlretrieve(
            'https://download.geofabrik.de/europe/france/france-latest.osm.pbf', PBF)

    print('[etl] Parsing PBF (peut durer plusieurs minutes)...')
    h = Handler(deps)
    h.apply_file(PBF, locations=True)
    print(f"[etl] {len(h.cells)} cellules produites")

    # Groupement par departement
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

    total_created = 0
    for code, cells in by_dep.items():
        cells_total = len(cells)
        print(f"[etl] {code}: {cells_total} cellules a pousser")
        done = 0
        for i in range(0, cells_total, 1000):
            batch = cells[i:i + 1000]
            is_final = (i + 1000) >= cells_total
            resp = post_batch(code, batch, is_final, cells_total)
            done += resp.get('created', 0)
            print(f"[etl]   batch {i//1000 + 1}: created={resp.get('created')} done={resp.get('cells_done')} status={resp.get('status')}")
        total_created += done
        print(f"[etl] {code} complete: {done}/{cells_total} cellules")

    print(f"[etl] Termine. Total cellules:poussees={total_created}")


if __name__ == '__main__':
    main()
