#!/usr/bin/env python3
"""ETL Geofabrik -> OsmTileCache.

Extrait ronds-points, stops et limites de vitesse d'extraits OpenStreetMap
Geofabrik, agrege le resultat en cellules de 0.01 deg et pousse le tout vers
les fonctions Base44 de l'application.

Choix structurants :

- Extraits regionaux plutot que la France entiere. Les regions Geofabrik qui
  intersectent les bbox des departements pending sont selectionnees via
  l'index Geofabrik (index-v1.json), ce qui evite de telecharger et parser
  ~5 Go quand un ou deux departements sont demandes. Repli automatique sur
  france-latest si l'index est indisponible ou la couverture incomplete.
- Index de localisations partiel (sparse). Seuls les nœuds situes dans les
  bbox pending (+ marge) sont gardes en memoire : `locations=True` indexerait
  la France entiere et ferait sauter les 7 Go de RAM d'un runner GitHub.
- Rejet O(1) hors zone via une grille grossiere (voir BBoxIndex). Le callback
  `node` est appele des centaines de millions de fois, donc le chemin de rejet
  est le seul vrai point chaud du script.
- `is_final` n'est envoye que si tous les batches du departement sont passes.
  Sinon le backend marquerait un departement incomplet comme termine.
"""

from __future__ import annotations

import json
import math
import os
import re
import threading
import time
import urllib.error
import urllib.request

import osmium

CELL = 0.01
MARGIN = 0.05  # marge ~5 km autour des bbox, pour les ways qui sortent du departement
COARSE = 0.5  # maille de la grille de rejet rapide

GEOFABRIK_INDEX = 'https://download.geofabrik.de/index-v1.json'
FRANCE_PBF = 'https://download.geofabrik.de/europe/france-latest.osm.pbf'
# Au-dela, telecharger la France entiere coute moins cher que N extraits.
MAX_REGIONS = 8
MIN_PBF_BYTES = 1_000_000  # un extrait plausible fait au moins ~1 Mo

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
    'residential': 30, 'living_street': 20, 'road': 50,
}
HIGHWAY_KINDS = {
    'motorway': 'highway', 'motorway_link': 'highway',
    'trunk': 'highway', 'trunk_link': 'highway',
    'primary': 'periurban', 'primary_link': 'periurban',
    'secondary': 'periurban', 'secondary_link': 'periurban',
    'tertiary': 'periurban', 'tertiary_link': 'periurban',
    'unclassified': 'periurban',
}


class Config:
    """Configuration issue de l'environnement.

    Lue a l'appel et pas a l'import, pour que le module reste importable
    (et testable) sans GEOSERVICE_KEY.
    """

    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.key = env['GEOSERVICE_KEY']
        self.base = env.get('APP_BASE', 'https://feel-good-drive.base44.app')
        self.cache_dir = env.get('PBF_CACHE_DIR', '/tmp/geofabrik')
        self.user_agent = env.get('ETL_USER_AGENT', 'feelgood-etl/2.0')
        self.batch_cells = int(env.get('ETL_BATCH_CELLS', '200'))
        # Mesure : 200 cellules corses pesaient 4,4 Mo de JSON, au-dela de ce
        # qu'une passerelle serverless accepte. 1 Mo garde de la marge.
        self.batch_bytes = int(env.get('ETL_BATCH_BYTES', '1000000'))
        self.force_france = env.get('ETL_FORCE_FRANCE', '').strip().lower() in ('1', 'true', 'yes')
        self.only = {c.strip() for c in env.get('ETL_DEPARTEMENTS', '').split(',') if c.strip()}
        # PBF_PATH court-circuite le telechargement (tests, runner persistant).
        self.pbf_path = env.get('PBF_PATH', '').strip()

    def headers(self, extra=None):
        h = {'X-Service-Key': self.key, 'User-Agent': self.user_agent}
        if extra:
            h.update(extra)
        return h


def log(msg):
    print(msg, flush=True)


# ---------- Geometrie ----------

def ckey(lat, lon):
    return f"{math.floor(lat / CELL)}_{math.floor(lon / CELL)}"


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def boxes_intersect(a, b):
    amnlat, amnlng, amxlat, amxlng = a
    bmnlat, bmnlng, bmxlat, bmxlng = b
    return amnlat <= bmxlat and bmnlat <= amxlat and amnlng <= bmxlng and bmnlng <= amxlng


class BBoxIndex:
    """Test d'appartenance a une union de bbox, en O(1) dans le cas courant.

    Les bbox sont rangees dans une grille de COARSE deg. Un point dont la
    maille est absente est rejete sur un seul lookup de dict, ce qui compte
    quand on evalue chaque nœud de la France. Les mailles integralement
    couvertes par une bbox sont acceptees sans comparaison de flottants.
    """

    def __init__(self, boxes, coarse=COARSE):
        self.coarse = coarse
        self.buckets = {}
        self.full = set()
        for box in boxes:
            mnlat, mnlng, mxlat, mxlng = box
            for i in range(math.floor(mnlat / coarse), math.floor(mxlat / coarse) + 1):
                for j in range(math.floor(mnlng / coarse), math.floor(mxlng / coarse) + 1):
                    key = (i, j)
                    self.buckets.setdefault(key, []).append(box)
                    cell = (i * coarse, j * coarse, (i + 1) * coarse, (j + 1) * coarse)
                    if (mnlat <= cell[0] and mnlng <= cell[1]
                            and mxlat >= cell[2] and mxlng >= cell[3]):
                        self.full.add(key)

    def __bool__(self):
        return bool(self.buckets)

    def contains(self, lat, lon):
        coarse = self.coarse
        key = (math.floor(lat / coarse), math.floor(lon / coarse))
        if key in self.full:
            return True
        bucket = self.buckets.get(key)
        if not bucket:
            return False
        for mnlat, mnlng, mxlat, mxlng in bucket:
            if mnlat <= lat <= mxlat and mnlng <= lon <= mxlng:
                return True
        return False


def parse_maxspeed(raw):
    """Convertit un tag OSM `maxspeed` en km/h, ou None si non exploitable."""
    if not raw:
        return None
    s = raw.strip()
    low = s.lower()
    # Les mph sont testes avant la valeur nue : "50 mph" vaut 80 km/h, pas 50.
    if 'mph' in low:
        m = re.search(r'\d+', low)
        return round(int(m.group()) * 1.609) if m else None
    try:
        v = int(s.split()[0])
    except ValueError:
        pass
    else:
        return v if v > 0 else None
    if 'urban' in low:
        return 50
    if 'rural' in low:
        return 80
    if 'motorway' in low:
        return 130
    if 'walk' in low or 'living_street' in low:
        return 20
    return None


# ---------- API application ----------

def _request_json(req, timeout):
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def normalize_departements(raw, only=None):
    """Valide la charge utile de getPendingDepartements.

    Un departement sans bbox exploitable est ecarte avec un message plutot que
    de faire tomber le run sur un KeyError.
    """
    out = []
    for d in raw or []:
        code = str(d.get('code') or '').strip()
        bb = d.get('bbox') or {}
        if not code:
            log('[etl] departement sans code ignore')
            continue
        if only and code not in only:
            continue
        try:
            box = (
                float(bb['minLat']), float(bb['minLng']),
                float(bb['maxLat']), float(bb['maxLng']),
            )
        except (KeyError, TypeError, ValueError):
            log(f'[etl] {code}: bbox absente ou invalide — departement ignore')
            continue
        if not (-90 <= box[0] < box[2] <= 90 and -180 <= box[1] < box[3] <= 180):
            log(f'[etl] {code}: bbox incoherente {box} — departement ignore')
            continue
        out.append({'code': code, 'box': box})
    return out


def fetch_pending(cfg):
    req = urllib.request.Request(
        f'{cfg.base}/functions/getPendingDepartements', headers=cfg.headers())
    payload = _request_json(req, timeout=60)
    return normalize_departements(payload.get('pending', []), cfg.only)


def post_batch(cfg, dep_code, batch, is_final, cells_total, max_attempts=5, sleep=time.sleep):
    body = json.dumps({
        'departement_code': dep_code,
        'batch': batch,
        'is_final': bool(is_final),
        'cells_total': cells_total,
    }).encode()
    url = f'{cfg.base}/functions/importGeofabrikTiles'
    headers = cfg.headers({'Content-Type': 'application/json'})
    last_err = None
    for attempt in range(1, max_attempts + 1):
        req = urllib.request.Request(url, data=body, headers=headers, method='POST')
        try:
            return _request_json(req, timeout=120)
        except urllib.error.HTTPError as e:
            last_err = e
            # 4xx hors 429 = definitif, retenter ne fera que perdre du temps.
            if 400 <= e.code < 500 and e.code != 429:
                log(f'[post] HTTP {e.code} irreparable (dep={dep_code}, n={len(batch)})')
                raise
            wait = min(30 * attempt, 120)
            log(f'[post] HTTP {e.code} (tentative {attempt}/{max_attempts}) — retry dans {wait}s')
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            wait = min(30 * attempt, 120)
            log(f'[post] reseau {type(e).__name__}: {e} — '
                f'retry {attempt}/{max_attempts} dans {wait}s')
        if attempt < max_attempts:
            sleep(wait)
    raise RuntimeError(f'post_batch echoue apres {max_attempts} tentatives: {last_err}')


# ---------- Selection et telechargement des extraits ----------

def geometry_bbox(geometry):
    lats, lngs = [], []

    def walk(coords):
        if coords and isinstance(coords[0], (int, float)):
            lngs.append(coords[0])
            lats.append(coords[1])
            return
        for part in coords:
            walk(part)

    walk((geometry or {}).get('coordinates') or [])
    if not lats:
        return None
    return (min(lats), min(lngs), max(lats), max(lngs))


def france_regions(index):
    """bbox par region Geofabrik fille de `france`, calculee depuis l'index."""
    regions = {}
    for feat in (index or {}).get('features', []):
        props = feat.get('properties') or {}
        if props.get('parent') != 'france':
            continue
        url = (props.get('urls') or {}).get('pbf')
        box = geometry_bbox(feat.get('geometry'))
        if url and box:
            regions[props['id']] = {'url': url, 'box': box}
    return regions


def select_regions(regions, deps, max_regions=MAX_REGIONS):
    """Regions couvrant les departements pending.

    Renvoie None (= prendre france-latest) si l'index est vide, si un
    departement n'est couvert par aucune region, ou si la selection est si
    large qu'un seul gros fichier revient moins cher.
    """
    if not regions:
        return None
    selected = {}
    for dep in deps:
        box = expand(dep['box'])
        hits = {rid: r for rid, r in regions.items() if boxes_intersect(box, r['box'])}
        if not hits:
            log(f"[etl] {dep['code']}: aucune region Geofabrik correspondante — "
                f'repli sur la France entiere')
            return None
        selected.update(hits)
    if len(selected) > max_regions:
        log(f'[etl] {len(selected)} regions selectionnees (> {max_regions}) — '
            f'repli sur la France entiere')
        return None
    return dict(sorted(selected.items()))


def expand(box, margin=MARGIN):
    mnlat, mnlng, mxlat, mxlng = box
    return (mnlat - margin, mnlng - margin, mxlat + margin, mxlng + margin)


def fetch_index(cfg):
    req = urllib.request.Request(GEOFABRIK_INDEX, headers={'User-Agent': cfg.user_agent})
    try:
        return _request_json(req, timeout=120)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        log(f'[etl] index Geofabrik indisponible ({type(e).__name__}: {e}) — '
            f'repli sur la France entiere')
        return None


def looks_like_pbf(path):
    """Un PBF commence par un BlobHeader contenant le type "OSMHeader".

    Le garde-fou vient d'un incident reel : une mauvaise URL Geofabrik renvoie
    une page d'erreur HTML en HTTP 200, que le parser ne sait pas expliquer.
    """
    try:
        with open(path, 'rb') as f:
            return b'OSMHeader' in f.read(64)
    except OSError:
        return False


def _is_usable_pbf(path):
    try:
        return os.path.getsize(path) >= MIN_PBF_BYTES and looks_like_pbf(path)
    except OSError:
        return False


def download_pbf(cfg, url, dest, attempts=4, sleep=time.sleep):
    """Telecharge `url` vers `dest`, avec reprise sur coupure reseau.

    Les extraits pesent de dizaines a des milliers de Mo : une coupure en
    cours de route doit reprendre la ou elle s'est arretee, pas repartir de
    zero. L'ecriture se fait dans un `.part` renomme seulement apres
    validation, pour ne jamais laisser un PBF tronque en place.
    """
    if _is_usable_pbf(dest):
        # Sans effet sur un runner GitHub (disque jetable), utile sur un
        # runner persistant ou quand PBF_CACHE_DIR pointe un volume monte.
        log(f'[dl] {os.path.basename(dest)}: deja en cache — reutilisation')
        return dest

    part = dest + '.part'
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    last_err = None
    for attempt in range(1, attempts + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        headers = {'User-Agent': cfg.user_agent, 'Accept-Encoding': 'identity'}
        if have:
            headers['Range'] = f'bytes={have}-'
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                # Un serveur qui ignore Range repond 200 : on repart de zero.
                append = bool(have) and r.status == 206
                if not append:
                    have = 0
                remaining = r.headers.get('Content-Length')
                total = (int(remaining) + have) if remaining else None
                start = f'reprise a {have:,} octets' if have else 'demarrage'
                target = f' / {total:,} octets' if total else ''
                log(f'[dl] {os.path.basename(dest)}: {start}{target}')
                with open(part, 'ab' if append else 'wb') as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
            size = os.path.getsize(part)
            if total and size < total:
                raise OSError(f'telechargement tronque ({size:,}/{total:,} octets)')
            if not _is_usable_pbf(part):
                os.remove(part)
                raise OSError(f'contenu invalide ({size:,} octets, en-tete PBF absente) — '
                              f'URL Geofabrik suspecte: {url}')
            os.replace(part, dest)
            log(f'[dl] {os.path.basename(dest)}: {size:,} octets')
            return dest
        except urllib.error.HTTPError as e:
            last_err = e
            # 416 : le .part couvre deja tout le fichier, ou il est corrompu.
            if e.code == 416:
                if _is_usable_pbf(part):
                    os.replace(part, dest)
                    log(f'[dl] {os.path.basename(dest)}: deja complet')
                    return dest
                if os.path.exists(part):
                    os.remove(part)
            log(f'[dl] echec {attempt}/{attempts}: HTTP {e.code}')
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            log(f'[dl] echec {attempt}/{attempts}: {type(e).__name__}: {e}')
        if attempt < attempts:
            sleep(min(10 * attempt, 60))
    raise RuntimeError(f'telechargement de {url} echoue: {last_err}')


def resolve_sources(cfg, deps):
    """Liste des PBF locaux a parser pour couvrir `deps`."""
    if cfg.pbf_path:
        if not looks_like_pbf(cfg.pbf_path):
            raise RuntimeError(f'PBF_PATH={cfg.pbf_path} absent ou non reconnu comme PBF')
        log(f'[etl] PBF impose: {cfg.pbf_path}')
        return [cfg.pbf_path]

    regions = None
    if not cfg.force_france:
        regions = select_regions(france_regions(fetch_index(cfg)), deps)

    if not regions:
        dest = os.path.join(cfg.cache_dir, 'france-latest.osm.pbf')
        return [download_pbf(cfg, FRANCE_PBF, dest)]

    log(f'[etl] regions retenues: {", ".join(regions)}')
    paths = []
    for rid, region in regions.items():
        dest = os.path.join(cfg.cache_dir, f'{rid}-latest.osm.pbf')
        paths.append(download_pbf(cfg, region['url'], dest))
    return paths


# ---------- Suivi d'avancement ----------

class Progress:
    """Journal d'avancement toutes les 5 s.

    Le parse peut durer des heures sans rien afficher : la position de lecture
    est sondee via /proc/self/fdinfo, seul moyen de connaitre l'avancement
    reel d'osmium depuis Python. Linux uniquement, ce qui suffit pour un
    runner GitHub, et l'absence de /proc degrade juste l'affichage.
    """

    def __init__(self, paths):
        self.sizes = {p: os.path.getsize(p) for p in paths}
        self.total = max(sum(self.sizes.values()), 1)
        self.done_bytes = 0
        self.current = None
        self.handler = None
        self.phase = 'parse'
        self.push_done = 0
        self.push_total = 0
        self.start = time.time()
        self.stop_evt = threading.Event()
        # Sans ce verrou, un rendu de la phase parse peut s'entrelacer avec la
        # bascule en phase push et afficher un etat deja demantele.
        self.lock = threading.Lock()

    @property
    def elapsed(self):
        return int(time.time() - self.start)

    def file_started(self, path):
        self.current = path

    def file_done(self, path):
        self.done_bytes += self.sizes.get(path, 0)
        self.current = None

    def _fd_pos(self):
        if not self.current:
            return None
        target = os.path.realpath(self.current)
        try:
            names = os.listdir('/proc/self/fd')
        except OSError:
            return None
        for name in names:
            try:
                if os.path.realpath(os.readlink(f'/proc/self/fd/{name}')) != target:
                    continue
                with open(f'/proc/self/fdinfo/{name}') as f:
                    for line in f:
                        if line.startswith('pos:'):
                            return int(line.split()[1])
            except OSError:
                continue
        return None

    def _render_parse(self):
        pos = self._fd_pos()
        read = self.done_bytes + (pos or 0)
        extra = ''
        if self.handler is not None:
            extra = (f' | nodes={self.handler.n_nodes:,} ways={self.handler.n_ways:,}'
                     f' cells={len(self.handler.cells):,}')
        if pos is None and self.current:
            extra += ' (position fd indisponible)'
        pct = min(read / self.total * 100, 100.0)
        return (f'[progress] {pct:5.1f}% ({read:,}/{self.total:,} octets) '
                f'elapsed={self.elapsed}s{extra}')

    def _render_push(self):
        pct = (self.push_done / self.push_total * 100) if self.push_total else 0.0
        return (f'[progress] PUSH {pct:5.1f}% ({self.push_done}/{self.push_total} cellules) '
                f'elapsed={self.elapsed}s')

    def set_phase(self, phase):
        with self.lock:
            self.phase = phase

    def _loop(self):
        while not self.stop_evt.wait(5):
            with self.lock:
                line = self._render_parse() if self.phase == 'parse' else self._render_push()
            log(line)

    def start_thread(self):
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()
        return t

    def finish(self):
        self.stop_evt.set()


# ---------- Parsing ----------

class Handler(osmium.SimpleHandler):
    """Collecte les elements routiers des bbox pending, cellule par cellule.

    Les compteurs `seen_*` servent au parsing multi-fichiers : les extraits
    Geofabrik se chevauchent (les ways coupant une frontiere sont inclus en
    entier), donc un meme way peut se presenter deux fois.
    """

    def __init__(self, deps):
        super().__init__()
        self.deps = deps
        self.index = BBoxIndex([expand(d['box']) for d in deps])
        self.node_locs = {}
        self.cells = {}
        self.seen_ways = set()
        self.seen_nodes = set()
        self.n_nodes = 0
        self.n_ways = 0

    def reset_locations(self):
        """Libere l'index de nœuds entre deux fichiers (les extraits sont autonomes)."""
        self.node_locs = {}

    def _rec(self, key):
        rec = self.cells.get(key)
        if rec is None:
            a, b = (int(x) for x in key.split('_'))
            rec = self.cells[key] = {
                'cell_key': key,
                'min_lat': a * CELL, 'min_lng': b * CELL,
                'max_lat': (a + 1) * CELL, 'max_lng': (b + 1) * CELL,
                'road_data': {'roundabouts': [], 'speedLimits': [], 'stops': []},
                'element_count': 0,
                '_dep': dep_for_cell(a, b, self.deps),
            }
        return rec

    def node(self, n):
        self.n_nodes += 1
        loc = n.location
        if not loc.valid():
            return
        lat, lon = loc.lat, loc.lon
        if not self.index.contains(lat, lon):
            return
        self.node_locs[n.id] = (lat, lon)
        # Les tags ne sont lus qu'ici : construire un dict pour chacun des
        # centaines de millions de nœuds du fichier coutait tres cher.
        tags = n.tags
        if not tags:
            return
        if n.id in self.seen_nodes:
            return
        hw = tags.get('highway')
        if hw == 'mini_roundabout':
            self.seen_nodes.add(n.id)
            self._add_roundabout(lat, lon, 20, f'mini_{n.id}')
        elif hw == 'stop' or tags.get('traffic_sign') == 'stop':
            self.seen_nodes.add(n.id)
            self._add_stop(lat, lon, f'stop_{n.id}')

    def way(self, w):
        self.n_ways += 1
        hw = w.tags.get('highway')
        if not hw or hw in NON_MOTOR:
            return
        is_roundabout = w.tags.get('junction') == 'roundabout'
        if not is_roundabout and hw not in MOTOR:
            return
        if w.id in self.seen_ways:
            return
        self.seen_ways.add(w.id)
        if is_roundabout:
            self._add_roundabout_way(w)
        else:
            self._add_segments(w, hw)

    def _add_roundabout_way(self, w):
        pts = [self.node_locs[nd.ref] for nd in w.nodes if nd.ref in self.node_locs]
        if len(pts) < 3:
            return
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        cnt = min(len(pts), 12)
        radius = sum(haversine_m(lat, lon, p[0], p[1]) for p in pts[:cnt]) / cnt
        if radius < 8 or not self.index.contains(lat, lon):
            return
        self._add_roundabout(lat, lon, parse_maxspeed(w.tags.get('maxspeed')) or 30, f'rb_{w.id}')

    def _add_segments(self, w, hw):
        speed = parse_maxspeed(w.tags.get('maxspeed'))
        explicit = speed is not None
        if speed is None:
            speed = DEFAULTS.get(hw, 50)
        kind = HIGHWAY_KINDS.get(hw, 'urban')
        name = w.tags.get('name') or None
        osm_id = int(w.id)
        locs = self.node_locs
        prev = None
        for nd in w.nodes:
            cur = locs.get(nd.ref)
            if prev is not None and cur is not None:
                mid_lat = (prev[0] + cur[0]) / 2
                mid_lon = (prev[1] + cur[1]) / 2
                if self.index.contains(mid_lat, mid_lon):
                    rec = self._rec(ckey(mid_lat, mid_lon))
                    rec['road_data']['speedLimits'].append({
                        'lat_start': round(prev[0], 7), 'lon_start': round(prev[1], 7),
                        'lat_end': round(cur[0], 7), 'lon_end': round(cur[1], 7),
                        'speed': speed, 'type': kind, 'highway': hw, 'name': name,
                        'osm_id': osm_id, 'explicit': explicit,
                    })
            prev = cur

    def _add_roundabout(self, lat, lon, maxspeed, id_):
        rec = self._rec(ckey(lat, lon))
        rec['road_data']['roundabouts'].append(
            {'lat': round(lat, 7), 'lon': round(lon, 7), 'maxspeed': maxspeed, 'id': id_})

    def _add_stop(self, lat, lon, id_):
        rec = self._rec(ckey(lat, lon))
        rec['road_data']['stops'].append(
            {'lat': round(lat, 7), 'lon': round(lon, 7), 'id': id_})


def dep_for_cell(a, b, deps):
    """Departement d'une cellule, d'apres son centre.

    Volontairement sans marge : la marge sert a capter les nœuds des ways
    frontaliers, pas a attribuer des cellules hors departement.
    """
    mid_lat = (a + 0.5) * CELL
    mid_lng = (b + 0.5) * CELL
    for d in deps:
        mnlat, mnlng, mxlat, mxlng = d['box']
        if mnlat <= mid_lat < mxlat and mnlng <= mid_lng < mxlng:
            return d['code']
    return None


def group_by_departement(cells):
    """Regroupe les cellules non vides par departement."""
    by_dep = {}
    for rec in cells.values():
        code = rec.pop('_dep', None)
        if not code:
            continue
        road = rec['road_data']
        rec['element_count'] = (len(road['roundabouts']) + len(road['speedLimits'])
                                + len(road['stops']))
        if rec['element_count'] == 0:
            continue
        by_dep.setdefault(code, []).append(rec)
    return by_dep


# ---------- Envoi ----------

def rec_size(rec):
    return len(json.dumps(rec))


def iter_batches(cells, max_cells, max_bytes, sizer=rec_size):
    """Decoupe par nombre de cellules ET par taille du corps JSON.

    Une cellule urbaine dense pese cent fois une cellule rurale : plafonner
    seulement le nombre de cellules laissait passer des corps de plusieurs Mo,
    ce que la passerelle refuse en 500. Mesure plutot qu'estimation, le cout
    d'une serialisation supplementaire etant negligeable devant le parsing.

    Une cellule depassant a elle seule `max_bytes` part dans son propre
    batch : on ne sait pas la decouper.
    """
    batch, size = [], 0
    for rec in cells:
        n = sizer(rec)
        if batch and (len(batch) >= max_cells or size + n > max_bytes):
            yield batch
            batch, size = [], 0
        batch.append(rec)
        size += n
    if batch:
        yield batch


def push_departement(cfg, code, cells, post=post_batch, on_sent=None):
    """Pousse les cellules d'un departement.

    `is_final` n'est transmis que si aucun batch n'a echoue : le backend
    marquerait sinon comme termine un departement partiellement importe.
    """
    batches = list(iter_batches(cells, cfg.batch_cells, cfg.batch_bytes))
    total = len(cells)
    created = 0
    failed = 0
    for i, batch in enumerate(batches, 1):
        is_final = (i == len(batches)) and failed == 0
        try:
            resp = post(cfg, code, batch, is_final, total)
        except Exception as e:  # noqa: BLE001 - un departement en echec ne doit pas tuer le run
            failed += 1
            log(f'[etl] {code} batch {i}/{len(batches)} en echec definitif: {e} — on continue')
        else:
            created += resp.get('created', 0) or 0
            log(f'[etl]   {code} batch {i}/{len(batches)}: created={resp.get("created", 0)} '
                f'done={resp.get("cells_done")} status={resp.get("status")}')
        if on_sent:
            on_sent(len(batch))
    if failed:
        log(f'[etl] {code}: {failed}/{len(batches)} batch(es) en echec — '
            f'is_final non envoye, le departement reste pending')
    return created, failed


# ---------- Orchestration ----------

def main():
    cfg = Config()
    deps = fetch_pending(cfg)
    if not deps:
        log('[etl] Aucun departement pending — arret.')
        return 0
    log(f"[etl] {len(deps)} departement(s) pending: {[d['code'] for d in deps]}")

    paths = resolve_sources(cfg, deps)
    handler = Handler(deps)
    prog = Progress(paths)
    prog.handler = handler
    prog.start_thread()

    total_bytes = sum(prog.sizes.values())
    log(f'[etl] {len(paths)} fichier(s), {total_bytes:,} octets — parsing (index partiel)...')
    for path in paths:
        prog.file_started(path)
        log(f'[etl] parse {os.path.basename(path)} ({prog.sizes[path]:,} octets)')
        handler.apply_file(path, locations=False)
        handler.reset_locations()
        prog.file_done(path)

    prog.set_phase('push')
    log(f'[etl] Parsing termine: {len(handler.cells)} cellules produites, '
        f'{handler.n_nodes:,} nœuds / {handler.n_ways:,} ways lus.')
    handler.reset_locations()
    handler.seen_ways = set()
    handler.seen_nodes = set()

    by_dep = group_by_departement(handler.cells)
    handler.cells = {}
    prog.push_total = sum(len(v) for v in by_dep.values())
    log(f'[etl] {len(by_dep)} departement(s) a pousser, {prog.push_total} cellules au total')

    def sent(n):
        prog.push_done += n

    total_created = 0
    total_failed = 0
    for code, cells in sorted(by_dep.items()):
        log(f'[etl] {code}: {len(cells)} cellules a pousser')
        created, failed = push_departement(cfg, code, cells, on_sent=sent)
        total_created += created
        total_failed += failed
        log(f'[etl] {code} termine: {created}/{len(cells)} cellules creees')

    prog.finish()
    log(f'[etl] Termine en {prog.elapsed}s. cellules poussees={total_created}')
    if total_failed:
        log(f'[etl] {total_failed} batch(es) en echec — run marque en erreur.')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
