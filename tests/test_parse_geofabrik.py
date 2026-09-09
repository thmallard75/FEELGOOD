import random
import urllib.error

import pytest

import parse_geofabrik as pg


def make_cfg(**over):
    env = {'GEOSERVICE_KEY': 'test-key'}
    env.update(over)
    return pg.Config(env)


# ---------- Configuration ----------

def test_config_requires_key():
    with pytest.raises(KeyError):
        pg.Config({})


def test_config_defaults_and_overrides():
    cfg = make_cfg(ETL_BATCH_CELLS='7', ETL_DEPARTEMENTS='75, 77 ,', ETL_FORCE_FRANCE='true')
    assert cfg.batch_cells == 7
    assert cfg.batch_bytes == 1_000_000
    assert cfg.only == {'75', '77'}
    assert cfg.force_france is True
    assert cfg.headers()['X-Service-Key'] == 'test-key'


# ---------- parse_maxspeed ----------

@pytest.mark.parametrize('raw, expected', [
    (None, None),
    ('', None),
    ('50', 50),
    ('  90 ', 90),
    ('0', None),
    ('-10', None),
    ('none', None),
    ('signals', None),
    ('FR:urban', 50),
    ('FR:rural', 80),
    ('FR:motorway', 130),
    ('walk', 20),
    ('DE:living_street', 20),
])
def test_parse_maxspeed(raw, expected):
    assert pg.parse_maxspeed(raw) == expected


@pytest.mark.parametrize('raw, expected', [
    ('50 mph', 80),
    ('30 mph', 48),
    ('mph', None),
])
def test_parse_maxspeed_converts_mph(raw, expected):
    """Une valeur en mph doit etre convertie, pas lue comme des km/h."""
    assert pg.parse_maxspeed(raw) == expected


# ---------- Geometrie ----------

def test_ckey_handles_negative_coordinates():
    assert pg.ckey(48.8566, 2.3522) == '4885_235'
    assert pg.ckey(-0.005, -0.005) == '-1_-1'


def test_haversine_is_symmetric_and_scaled():
    d = pg.haversine_m(48.85, 2.35, 48.86, 2.35)
    assert 1100 < d < 1120
    assert pg.haversine_m(48.86, 2.35, 48.85, 2.35) == pytest.approx(d)


def test_bbox_index_matches_naive_scan():
    boxes = [(48.0, 2.0, 49.0, 3.0), (43.0, 5.0, 43.4, 5.6), (-1.0, -1.0, 0.5, 0.5)]
    index = pg.BBoxIndex(boxes)

    def naive(lat, lon):
        return any(a <= lat <= c and b <= lon <= d for a, b, c, d in boxes)

    rng = random.Random(1234)
    for _ in range(20000):
        lat = rng.uniform(-2, 51)
        lon = rng.uniform(-2, 8)
        assert index.contains(lat, lon) == naive(lat, lon), (lat, lon)


def test_bbox_index_marks_fully_covered_cells():
    index = pg.BBoxIndex([(0.0, 0.0, 10.0, 10.0)], coarse=0.5)
    assert (4, 4) in index.full
    assert index.contains(2.0, 2.0)
    assert not index.contains(2.0, 10.5)


def test_bbox_index_empty_is_falsy():
    assert not pg.BBoxIndex([])
    assert not pg.BBoxIndex([]).contains(48.0, 2.0)


def test_boxes_intersect_edges_touch():
    assert pg.boxes_intersect((0, 0, 1, 1), (1, 1, 2, 2))
    assert not pg.boxes_intersect((0, 0, 1, 1), (1.01, 1.01, 2, 2))


def test_dep_for_cell_uses_cell_centre():
    deps = [{'code': '75', 'box': (48.8, 2.2, 48.9, 2.5)}]
    a, b = 4885, 235
    assert pg.dep_for_cell(a, b, deps) == '75'
    assert pg.dep_for_cell(4700, 235, deps) is None
    assert pg.dep_for_cell(a, b, []) is None


# ---------- Validation de la charge utile ----------

def test_normalize_departements_keeps_valid_entries():
    raw = [{'code': '75', 'bbox': {'minLat': 48.8, 'minLng': 2.2,
                                   'maxLat': 48.9, 'maxLng': 2.5}}]
    assert pg.normalize_departements(raw) == [{'code': '75', 'box': (48.8, 2.2, 48.9, 2.5)}]


@pytest.mark.parametrize('entry', [
    {'code': '', 'bbox': {'minLat': 1, 'minLng': 1, 'maxLat': 2, 'maxLng': 2}},
    {'code': '75'},
    {'code': '75', 'bbox': {'minLat': 1, 'minLng': 1}},
    {'code': '75', 'bbox': {'minLat': 'x', 'minLng': 1, 'maxLat': 2, 'maxLng': 2}},
    {'code': '75', 'bbox': {'minLat': 2, 'minLng': 1, 'maxLat': 1, 'maxLng': 2}},
    {'code': '75', 'bbox': {'minLat': 1, 'minLng': 1, 'maxLat': 200, 'maxLng': 2}},
])
def test_normalize_departements_drops_invalid_entries(entry):
    assert pg.normalize_departements([entry]) == []


def test_normalize_departements_applies_filter():
    raw = [
        {'code': '75', 'bbox': {'minLat': 48.8, 'minLng': 2.2, 'maxLat': 48.9, 'maxLng': 2.5}},
        {'code': '77', 'bbox': {'minLat': 48.3, 'minLng': 2.4, 'maxLat': 49.1, 'maxLng': 3.6}},
    ]
    assert [d['code'] for d in pg.normalize_departements(raw, only={'77'})] == ['77']


# ---------- Selection des extraits Geofabrik ----------

def index_fixture():
    return {'features': [
        {'properties': {'id': 'ile-de-france', 'parent': 'france',
                        'urls': {'pbf': 'https://x/idf.osm.pbf'}},
         'geometry': {'type': 'Polygon',
                      'coordinates': [[[1.4, 48.1], [3.6, 48.1], [3.6, 49.3], [1.4, 49.3]]]}},
        {'properties': {'id': 'corse', 'parent': 'france',
                        'urls': {'pbf': 'https://x/corse.osm.pbf'}},
         'geometry': {'type': 'Polygon',
                      'coordinates': [[[8.3, 41.3], [9.8, 41.3], [9.8, 43.2], [8.3, 43.2]]]}},
        {'properties': {'id': 'bayern', 'parent': 'germany',
                        'urls': {'pbf': 'https://x/bayern.osm.pbf'}},
         'geometry': {'type': 'Polygon',
                      'coordinates': [[[9.0, 47.0], [13.0, 47.0], [13.0, 50.0], [9.0, 50.0]]]}},
    ]}


def test_geometry_bbox_walks_nested_coordinates():
    geom = {'coordinates': [[[[1.0, 40.0], [2.0, 41.0]]], [[[0.5, 39.0], [3.0, 42.0]]]]}
    assert pg.geometry_bbox(geom) == (39.0, 0.5, 42.0, 3.0)
    assert pg.geometry_bbox({}) is None
    assert pg.geometry_bbox(None) is None


def test_france_regions_ignores_other_countries():
    regions = pg.france_regions(index_fixture())
    assert set(regions) == {'ile-de-france', 'corse'}
    assert regions['corse']['box'] == (41.3, 8.3, 43.2, 9.8)


def test_select_regions_picks_only_overlapping_regions():
    regions = pg.france_regions(index_fixture())
    deps = [{'code': '75', 'box': (48.8, 2.2, 48.9, 2.5)}]
    assert list(pg.select_regions(regions, deps)) == ['ile-de-france']


def test_select_regions_falls_back_when_department_uncovered():
    regions = pg.france_regions(index_fixture())
    deps = [{'code': '99', 'box': (10.0, 10.0, 11.0, 11.0)}]
    assert pg.select_regions(regions, deps) is None


def test_select_regions_falls_back_without_index():
    assert pg.select_regions({}, [{'code': '75', 'box': (48.8, 2.2, 48.9, 2.5)}]) is None


def test_select_regions_falls_back_when_too_many_regions():
    regions = pg.france_regions(index_fixture())
    deps = [{'code': '75', 'box': (48.8, 2.2, 48.9, 2.5)}]
    assert pg.select_regions(regions, deps, max_regions=0) is None


# ---------- Decoupage en batches ----------

def cells(*counts):
    return [{'cell_key': str(i), 'element_count': c} for i, c in enumerate(counts)]


def sizer(rec):
    """Taille factice : le nombre d'elements de la cellule."""
    return rec['element_count']


def test_iter_batches_caps_cell_count():
    batches = list(pg.iter_batches(cells(1, 1, 1, 1, 1), 2, 10_000, sizer=sizer))
    assert [len(b) for b in batches] == [2, 2, 1]


def test_iter_batches_caps_body_size():
    batches = list(pg.iter_batches(cells(60, 60, 60), 100, 100, sizer=sizer))
    assert [len(b) for b in batches] == [1, 1, 1]


def test_iter_batches_keeps_oversized_cell_alone():
    batches = list(pg.iter_batches(cells(5, 500, 5), 100, 100, sizer=sizer))
    assert [[c['element_count'] for c in b] for b in batches] == [[5], [500], [5]]


def test_iter_batches_of_empty_input():
    assert list(pg.iter_batches([], 10, 10)) == []


def test_iter_batches_respects_measured_json_size():
    """Le plafond par defaut se mesure sur le JSON reellement envoye."""
    dense = [{'cell_key': str(i), 'road_data': {'speedLimits': [{'speed': 50}] * 50}}
             for i in range(10)]
    batches = list(pg.iter_batches(dense, max_cells=200, max_bytes=3 * pg.rec_size(dense[0])))
    assert all(sum(map(pg.rec_size, b)) <= 3 * pg.rec_size(dense[0]) for b in batches)
    assert sum(len(b) for b in batches) == 10


# ---------- Regroupement ----------

def test_group_by_departement_drops_empty_and_unassigned_cells():
    def cell(key, dep, roundabouts=0, speeds=0, stops=0):
        return {'cell_key': key, '_dep': dep, 'road_data': {
            'roundabouts': [{}] * roundabouts,
            'speedLimits': [{}] * speeds,
            'stops': [{}] * stops}}

    grouped = pg.group_by_departement({
        'a': cell('a', '75', speeds=3),
        'b': cell('b', '75', roundabouts=1, stops=2),
        'c': cell('c', None, speeds=9),
        'd': cell('d', '77'),
    })
    assert set(grouped) == {'75'}
    assert sorted(c['element_count'] for c in grouped['75']) == [3, 3]


# ---------- Envoi ----------

def test_push_departement_marks_final_on_last_batch():
    cfg = make_cfg(ETL_BATCH_CELLS='1')
    calls = []

    def post(cfg_, code, batch, is_final, total):
        calls.append(is_final)
        return {'created': len(batch)}

    created, failed = pg.push_departement(cfg, '75', cells(1, 1, 1), post=post)
    assert calls == [False, False, True]
    assert (created, failed) == (3, 0)


def test_push_departement_withholds_final_after_failure():
    """Le point critique : un departement incomplet ne doit pas etre clos."""
    cfg = make_cfg(ETL_BATCH_CELLS='1')
    calls = []

    def post(cfg_, code, batch, is_final, total):
        calls.append(is_final)
        if len(calls) == 1:
            raise RuntimeError('boom')
        return {'created': len(batch)}

    created, failed = pg.push_departement(cfg, '75', cells(1, 1, 1), post=post)
    assert True not in calls
    assert (created, failed) == (2, 1)


def test_push_departement_reports_progress_including_failures():
    cfg = make_cfg(ETL_BATCH_CELLS='1')
    seen = []

    def post(cfg_, code, batch, is_final, total):
        raise RuntimeError('boom')

    created, failed = pg.push_departement(
        cfg, '75', cells(1, 1), post=post, on_sent=seen.append)
    assert seen == [1, 1]
    assert (created, failed) == (0, 2)


def http_error(code):
    return urllib.error.HTTPError('https://x', code, 'err', {}, None)


def test_post_batch_retries_server_errors(monkeypatch):
    cfg = make_cfg()
    attempts = []

    def fake(req, timeout):
        attempts.append(1)
        if len(attempts) < 3:
            raise http_error(503)
        return {'created': 1}

    monkeypatch.setattr(pg, '_request_json', fake)
    assert pg.post_batch(cfg, '75', [], False, 1, sleep=lambda _: None) == {'created': 1}
    assert len(attempts) == 3


def test_post_batch_does_not_retry_client_errors(monkeypatch):
    cfg = make_cfg()
    attempts = []

    def fake(req, timeout):
        attempts.append(1)
        raise http_error(400)

    monkeypatch.setattr(pg, '_request_json', fake)
    with pytest.raises(urllib.error.HTTPError):
        pg.post_batch(cfg, '75', [], False, 1, sleep=lambda _: None)
    assert len(attempts) == 1


def test_post_batch_retries_rate_limit(monkeypatch):
    cfg = make_cfg()
    attempts = []

    def fake(req, timeout):
        attempts.append(1)
        raise http_error(429)

    monkeypatch.setattr(pg, '_request_json', fake)
    with pytest.raises(RuntimeError):
        pg.post_batch(cfg, '75', [], False, 1, max_attempts=2, sleep=lambda _: None)
    assert len(attempts) == 2


# ---------- Garde-fou sur le contenu telecharge ----------

def test_looks_like_pbf_rejects_html_error_page(tmp_path):
    html = tmp_path / 'france.osm.pbf'
    html.write_bytes(b'<!DOCTYPE html><html><head><title>404</title></head></html>')
    assert not pg.looks_like_pbf(html)
    assert not pg.looks_like_pbf(tmp_path / 'absent.pbf')


def test_looks_like_pbf_accepts_pbf_header(tmp_path):
    pbf = tmp_path / 'ok.osm.pbf'
    pbf.write_bytes(b'\x00\x00\x00\x0d\x0a\x09OSMHeader' + b'\x00' * 40)
    assert pg.looks_like_pbf(pbf)
