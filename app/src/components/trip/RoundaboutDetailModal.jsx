import React, { useMemo } from 'react';
import { haversineDistance, formatRoundaboutRating } from '@/lib/gpsEngine';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_CLASS, TILE_URL } from '@/lib/mapTiles';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X, MapPin, Gauge, TrendingDown, Navigation, AlertTriangle, CheckCircle2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const ZONE_CONFIG = [
  { key: 'z150', min: 100, max: 170, label: '150–100 m', color: '#C8F230', desc: 'Approche lointaine' },
  { key: 'z100', min: 50,  max: 100, label: '100–50 m',  color: '#F2C230', desc: 'Approche intermédiaire' },
  { key: 'z50',  min: 0,   max: 50,  label: '50 m–entrée', color: '#ef4444', desc: 'Approche immédiate' },
];

function generateConclusion(d, decelStartPt) {
  if (!d) return null;
  const { anticipation_zone, decel_start_dist, progressive_decel, speed_at_150m, speed_at_entry,
    progress_penalty, speed_limit_penalty, entry_speed_penalty, max_excess_last100m, roundabout_score } = d;

  let sentences = [];

  if (decel_start_dist != null) {
    sentences.push(`Le conducteur a commencé à ralentir à ${decel_start_dist} m du rond-point.`);
  } else if (decelStartPt) {
    sentences.push(`Le conducteur a commencé à ralentir à ${Math.round(decelStartPt.dist)} m du rond-point.`);
  }

  if (speed_at_150m != null && speed_at_entry != null) {
    sentences.push(`La vitesse est passée de ${speed_at_150m} km/h à 150 m à ${speed_at_entry} km/h à l'entrée.`);
  }

  if (anticipation_zone === 'zone1') {
    sentences.push(progressive_decel
      ? "L'anticipation est excellente : la décélération a été amorcée dès 100–150 m du rond-point, permettant une approche progressive et sécurisée."
      : "La décélération a bien débuté tôt, mais elle n'était pas parfaitement progressive — quelques irrégularités ont été détectées.");
  } else if (anticipation_zone === 'zone2') {
    sentences.push("L'anticipation est correcte : la décélération a commencé entre 60 et 100 m du rond-point, ce qui est suffisant mais pourrait être anticipé plus tôt.");
  } else if (anticipation_zone === 'zone3') {
    sentences.push("L'anticipation est insuffisante : le freinage n'a été amorcé qu'à moins de 60 m du rond-point, ce qui est tardif et potentiellement dangereux.");
  }

  if (!progressive_decel && (progress_penalty ?? 0) > 0) {
    sentences.push(`Un freinage irrégulier ou brusque a été détecté lors de l'approche (-${progress_penalty} pts).`);
  }
  if ((max_excess_last100m ?? 0) > 0) {
    sentences.push(max_excess_last100m > 20
      ? `Un excès de vitesse majeur (+${Math.round(max_excess_last100m)} km/h au-delà de la limite) a été constaté dans les 100 derniers mètres (-${speed_limit_penalty} pts).`
      : `Un dépassement de la limitation de vitesse de +${Math.round(max_excess_last100m)} km/h a été relevé dans les 100 derniers mètres (-${speed_limit_penalty} pts).`);
  }
  if ((entry_speed_penalty ?? 0) > 0) {
    sentences.push(`La vitesse d'entrée de ${speed_at_entry} km/h dépasse le seuil recommandé de 34 km/h (-${entry_speed_penalty} pts).`);
  }

  return sentences.join(' ') || null;
}

export default function RoundaboutDetailModal({ event, trip, onClose }) {
  const rbPos = { lat: event.latitude, lng: event.longitude };
  const d = event.roundabout_detail || {};

  const approachData = useMemo(() => {
    if (!trip?.gps_track) return [];
    return trip.gps_track
      .map(p => ({ ...p, dist: haversineDistance(p.lat, p.lng, rbPos.lat, rbPos.lng) }))
      .filter(p => p.dist <= 200 && !p.low_precision)
      .sort((a, b) => b.dist - a.dist);
  }, [trip, event]);

  // Calcul des stats par zone depuis les points GPS bruts
  const zoneStats = useMemo(() => ZONE_CONFIG.map(z => {
    // Préférer les données précalculées du backend si disponibles
    const precomputed = z.key === 'z150' ? d.zone_150_100 : z.key === 'z100' ? d.zone_100_50 : d.zone_50_entry;
    if (precomputed && precomputed.count > 0) return { ...z, ...precomputed };
    const pts = approachData.filter(p => p.dist >= z.min && p.dist < z.max);
    if (!pts.length) return { ...z, count: 0, avg: null, max: null, decel: null };
    const speeds = pts.map(p => p.speed_kmh);
    return {
      ...z,
      count: pts.length,
      avg: Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length * 10) / 10,
      max: Math.round(Math.max(...speeds) * 10) / 10,
      decel: pts.length >= 2 ? Math.round((pts[0].speed_kmh - pts[pts.length - 1].speed_kmh) * 10) / 10 : null,
    };
  }), [approachData, d]);

  const decelStartPt = useMemo(() => {
    if (approachData.length < 2) return null;
    let maxSpd = approachData[0].speed_kmh;
    for (let i = 1; i < approachData.length; i++) {
      if (approachData[i - 1].speed_kmh > maxSpd) maxSpd = approachData[i - 1].speed_kmh;
      if (approachData[i].speed_kmh < maxSpd - 4) return approachData[i - 1];
    }
    return null;
  }, [approachData]);

  const chartData = useMemo(() =>
    approachData.map(p => ({ dist: Math.round(p.dist), speed: Math.round(p.speed_kmh * 10) / 10 })),
  [approachData]);

  const conclusion = useMemo(() => generateConclusion(d, decelStartPt), [d, decelStartPt]);
  const rating = formatRoundaboutRating(d.rating);
  const decelDist = d.decel_start_dist ?? (decelStartPt ? Math.round(decelStartPt.dist) : null);

  // Pénalités totales
  const penalties = [
    { key: 'progress', label: 'Décélération', value: d.progress_penalty || d.irregular_braking_penalty || 0, desc: d.progress_penalty > 0 ? 'Irrégulière / brusque' : 'Progressive ✓' },
    { key: 'limit',    label: 'Limitation',   value: d.speed_limit_penalty || 0, desc: (d.max_excess_last100m ?? 0) > 0 ? `+${Math.round(d.max_excess_last100m)} km/h dépassé` : 'Respectée ✓' },
    { key: 'entry',    label: 'Entrée',        value: d.entry_speed_penalty || 0, desc: d.speed_at_entry != null ? `${d.speed_at_entry} km/h` : '—' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">{rating.emoji}</span>
            <div>
              <p className="text-sm font-bold text-foreground">Analyse du rond-point</p>
              <p className="text-xs text-muted-foreground">
                {event.timestamp ? format(new Date(event.timestamp), "d MMM yyyy · HH:mm:ss", { locale: fr }) : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 ${
              (d.roundabout_score ?? 0) >= 80 ? 'bg-primary text-primary-foreground' :
              (d.roundabout_score ?? 0) >= 60 ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'
            }`}>
              {d.roundabout_score ?? '?'}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors ml-1">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* Vitesses clés */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Vitesses clés à l'approche</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'À 150 m',  value: d.speed_at_150m, icon: TrendingDown },
                { label: 'À 100 m',  value: d.speed_at_100m, icon: TrendingDown },
                { label: 'À 50 m',   value: d.speed_at_65m,  icon: TrendingDown },
                { label: "Entrée",   value: d.speed_at_entry, icon: Gauge, danger: (d.speed_at_entry ?? 0) > 34 },
              ].map(item => (
                <div key={item.label} className={`p-2.5 rounded-xl border ${item.danger ? 'border-red-500/40 bg-red-500/5' : 'border-border/60 bg-secondary/40'}`}>
                  <item.icon className="w-3 h-3 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${item.danger ? 'text-red-400' : 'text-foreground'}`}>
                    {item.value != null ? `${item.value} km/h` : '—'}
                    {item.danger && <span className="text-xs ml-1">⚠️</span>}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/60">
                <Navigation className="w-3 h-3 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">Début décélération</p>
                <p className="text-sm font-bold text-foreground">{decelDist != null ? `${decelDist} m` : '—'}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/60">
                <MapPin className="w-3 h-3 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">Limit. approche</p>
                <p className="text-sm font-bold text-foreground">{d.approach_speed_limit ? `${d.approach_speed_limit} km/h` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Décomposition du score */}
          <div className="p-3 rounded-xl bg-secondary/30 border border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground">Décomposition du score</p>
              <div className="flex items-center gap-1.5">
                {d.progressive_decel !== undefined && (
                  d.progressive_decel
                    ? <span className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="w-3 h-3" /> Décél. progressive</span>
                    : <span className="flex items-center gap-1 text-xs text-orange-400"><AlertTriangle className="w-3 h-3" /> Décél. irrégulière</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-card">
                <p className="text-2xl font-black text-foreground">{d.base_score ?? '—'}</p>
                <p className="text-muted-foreground font-medium text-xs">Base zone</p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">
                  {d.anticipation_zone === 'zone1' ? '150–100m' : d.anticipation_zone === 'zone2' ? '100–60m' : '<60m'}
                </p>
              </div>
              {penalties.map(pen => (
                <div key={pen.key} className={`p-2 rounded-lg bg-card ${pen.value > 0 ? 'border border-red-500/30' : ''}`}>
                  <p className={`text-2xl font-black ${pen.value > 0 ? 'text-red-400' : 'text-primary'}`}>
                    {pen.value > 0 ? `-${pen.value}` : '✓'}
                  </p>
                  <p className="text-muted-foreground font-medium text-xs">{pen.label}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">{pen.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Score final du rond-point</span>
              <span className={`text-lg font-black ${(d.roundabout_score ?? 0) >= 80 ? 'text-primary' : (d.roundabout_score ?? 0) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {d.roundabout_score ?? '—'} / 100
              </span>
            </div>
          </div>

          {/* Analyse par zones */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Analyse par zones</p>
            <div className="space-y-2">
              {zoneStats.map(z => (
                <div key={z.key} className="p-3 rounded-xl border border-border/60" style={{ background: `${z.color}0A` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: z.color }} />
                      <span className="text-xs font-semibold text-foreground">{z.label}</span>
                      <span className="text-xs text-muted-foreground">{z.desc}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{z.count} pts GPS</span>
                  </div>
                  {z.count > 0 ? (
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-1.5 rounded-lg bg-black/20">
                        <p className="font-bold text-foreground">{z.avg} km/h</p>
                        <p className="text-muted-foreground">Moy.</p>
                      </div>
                      <div className="p-1.5 rounded-lg bg-black/20">
                        <p className="font-bold text-foreground">{z.max} km/h</p>
                        <p className="text-muted-foreground">Max.</p>
                      </div>
                      <div className="p-1.5 rounded-lg bg-black/20">
                        <p className={`font-bold ${(z.decel ?? 0) > 5 ? 'text-primary' : (z.decel ?? 0) > 0 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                          {z.decel != null ? `${z.decel > 0 ? '−' : '+'}${Math.abs(z.decel)} km/h` : '—'}
                        </p>
                        <p className="text-muted-foreground">Décél.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">Aucun point GPS dans cette zone</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Courbe vitesse */}
          {chartData.length > 3 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Courbe vitesse / distance d'approche</p>
              <div className="bg-secondary/30 rounded-xl p-3 border border-border/60">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 14, right: 10, bottom: 5, left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                    <XAxis
                      dataKey="dist" type="number" domain={[170, 0]}
                      tick={{ fontSize: 10, fill: '#888' }} tickFormatter={v => `${v}m`}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                    <Tooltip
                      formatter={(v) => [`${v} km/h`, 'Vitesse']}
                      labelFormatter={(v) => `À ${v} m du rond-point`}
                      contentStyle={{ background: '#161616', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                    />
                    {/* Zones colorées */}
                    <ReferenceLine x={100} stroke="#C8F23030" strokeWidth={10} />
                    <ReferenceLine x={50}  stroke="#F2C23025" strokeWidth={10} />
                    {/* Limite 34 km/h */}
                    <ReferenceLine y={34} stroke="#ef444455" strokeDasharray="4 4"
                      label={{ value: '34 km/h', position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }} />
                    {/* Début décélération */}
                    {decelDist != null && (
                      <ReferenceLine x={decelDist} stroke="#F2C230" strokeDasharray="4 4"
                        label={{ value: '▼ Décél.', position: 'top', fontSize: 9, fill: '#F2C230' }} />
                    )}
                    <Line type="monotone" dataKey="speed" stroke="#C8F230" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1 justify-center flex-wrap">
                  <div className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm" style={{ background: '#C8F23040' }} /> 150–100m</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm" style={{ background: '#F2C23030' }} /> 100–50m</div>
                  {decelDist != null && <div className="flex items-center gap-1"><div className="w-5 h-0 border-t border-dashed border-yellow-400" /> Début décél.</div>}
                </div>
              </div>
            </div>
          )}

          {/* Mini-carte */}
          {approachData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Carte de l'approche</p>
              <div className="rounded-xl overflow-hidden border border-border" style={{ height: 220 }}>
                <MapContainer center={[event.latitude, event.longitude]} zoom={17} style={{ width: '100%', height: '100%' }}>
                  <TileLayer url={TILE_URL} className={TILE_CLASS} attribution={TILE_ATTRIBUTION} />
                  {approachData.map((p, i) => {
                    const color = p.dist >= 100 ? '#C8F230' : p.dist >= 50 ? '#F2C230' : '#ef4444';
                    return (
                      <CircleMarker key={i} center={[p.lat, p.lng]} radius={4}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 1 }} />
                    );
                  })}
                  {decelStartPt && (
                    <CircleMarker center={[decelStartPt.lat, decelStartPt.lng]} radius={9}
                      pathOptions={{ color: '#F2C230', fillColor: '#F2C230', fillOpacity: 1, weight: 2 }} />
                  )}
                  <CircleMarker center={[event.latitude, event.longitude]} radius={13}
                    pathOptions={{ color: '#C8F230', fillColor: '#C8F230', fillOpacity: 0.15, weight: 3 }} />
                </MapContainer>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground mt-1.5 justify-center flex-wrap">
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-primary" /> 150–100m</div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> 100–50m</div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-400" /> &lt;50m</div>
                {decelStartPt && <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full border-2 border-yellow-400 bg-yellow-400" /> Début décél.</div>}
              </div>
            </div>
          )}

          {/* Tableau GPS */}
          {approachData.length > 0 && (
            <details className="rounded-xl border border-border overflow-hidden">
              <summary className="px-3 py-2.5 text-xs font-semibold text-foreground bg-secondary/30 cursor-pointer select-none">
                📍 Points GPS détaillés ({approachData.length} points)
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 bg-secondary/20">
                      <th className="p-2 text-left text-muted-foreground font-medium">Heure</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Dist.</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Vitesse</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approachData.map((p, i) => {
                      const isDecelStart = decelStartPt && Math.abs(p.dist - decelStartPt.dist) < 5 && i < 5;
                      const zone = p.dist >= 100 ? '150–100m' : p.dist >= 50 ? '100–50m' : '<50m';
                      const zoneColor = p.dist >= 100 ? 'text-primary' : p.dist >= 50 ? 'text-yellow-400' : 'text-red-400';
                      return (
                        <tr key={i} className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${isDecelStart ? 'bg-yellow-400/5' : ''}`}>
                          <td className="p-2 text-muted-foreground">
                            {p.timestamp ? new Date(p.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            {isDecelStart && <span className="ml-1 text-yellow-400 font-bold">← décél.</span>}
                          </td>
                          <td className="p-2 text-right font-medium text-foreground">{Math.round(p.dist)} m</td>
                          <td className={`p-2 text-right font-bold ${p.speed_kmh > 34 && p.dist < 30 ? 'text-red-400' : 'text-foreground'}`}>
                            {p.speed_kmh} km/h
                          </td>
                          <td className={`p-2 text-right text-xs font-medium ${zoneColor}`}>{zone}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* Conclusion IA */}
          {conclusion && (
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
              <p className="text-xs font-semibold text-primary mb-2">💡 Analyse automatique</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{conclusion}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}