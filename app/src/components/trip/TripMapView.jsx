import React, { useMemo, useState, useEffect } from 'react';
import { getSpeedColor, formatRoundaboutRating, formatStopRating, getRoundaboutExplanation, getStopExplanation } from '@/lib/gpsEngine';
import 'leaflet/dist/leaflet.css';

const popupStyle = {
  background: '#161616',
  color: '#f2f2f2',
  borderRadius: 10,
  padding: '8px 10px',
  minWidth: 180,
  fontSize: 12,
};

function RoundaboutPopup({ event, onDetailClick }) {
  const d = event.roundabout_detail;
  const rating = formatRoundaboutRating(d?.rating);
  const explanation = getRoundaboutExplanation(d);
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{rating.emoji} Rond-point — {rating.text}</div>
      {d && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
          <tbody>
            {d.speed_at_150m != null && <tr><td style={{ color: '#888' }}>150m</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{Math.round(d.speed_at_150m)} km/h</td></tr>}
            {d.speed_at_100m != null && <tr><td style={{ color: '#888' }}>100m</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{Math.round(d.speed_at_100m)} km/h</td></tr>}
            {d.speed_at_65m != null && <tr><td style={{ color: '#888' }}>65m</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{Math.round(d.speed_at_65m)} km/h</td></tr>}
            {d.speed_at_entry != null && <tr><td style={{ color: '#888' }}>Entrée</td><td style={{ fontWeight: 700, textAlign: 'right', color: d.speed_at_entry > 34 ? '#ef4444' : '#C8F230' }}>{Math.round(d.speed_at_entry)} km/h</td></tr>}
            {d.speed_at_exit != null && (
              <tr>
                <td style={{ color: '#888', borderTop: '1px solid #333', paddingTop: 4 }}>Sortie</td>
                <td style={{ fontWeight: 700, textAlign: 'right', borderTop: '1px solid #333', paddingTop: 4, color: d.exit_rating === 'stall' ? '#ef4444' : d.exit_rating === 'slow' ? '#F2C230' : '#C8F230' }}>
                  {Math.round(d.speed_at_exit)} km/h
                  {d.exit_rating === 'stall' && ' ⚠️'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {explanation && <div style={{ color: '#aaa', fontStyle: 'italic' }}>{explanation}</div>}
      {onDetailClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
          style={{ marginTop: 8, width: '100%', padding: '5px 8px', background: 'hsl(72 89% 58% / 0.15)', border: '1px solid hsl(72 89% 58% / 0.3)', borderRadius: 6, color: 'hsl(72 89% 58%)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
        >
          📊 Voir le détail complet →
        </button>
      )}
    </div>
  );
}

function StopPopup({ event }) {
  const d = event.stop_detail;
  const rating = formatStopRating(d?.rating);
  const explanation = getStopExplanation(d);
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{rating.emoji} STOP — {rating.text}</div>
      {d && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
          <tbody>
            {d.speed_at_30m != null && <tr><td style={{ color: '#888' }}>À 30m</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{Math.round(d.speed_at_30m)} km/h</td></tr>}
            {d.speed_at_10m != null && <tr><td style={{ color: '#888' }}>À 10m</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{Math.round(d.speed_at_10m)} km/h</td></tr>}
            {d.min_speed_kmh != null && <tr><td style={{ color: '#888' }}>Au stop</td><td style={{ fontWeight: 700, textAlign: 'right', color: d.min_speed_kmh <= 3 ? '#C8F230' : d.min_speed_kmh <= 8 ? '#F2C230' : '#ef4444' }}>{Math.round(d.min_speed_kmh)} km/h</td></tr>}
          </tbody>
        </table>
      )}
      {explanation && <div style={{ color: '#aaa', fontStyle: 'italic' }}>{explanation}</div>}
    </div>
  );
}

function SpeedingPopup({ event }) {
  const d = event.speeding_detail;
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>🚨 Excès de vitesse</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><td style={{ color: '#888' }}>Vitesse max</td><td style={{ fontWeight: 700, textAlign: 'right', color: '#ef4444' }}>{Math.round(d?.max_speed_kmh || event.speed_kmh || 0)} km/h</td></tr>
          <tr><td style={{ color: '#888' }}>Limitation</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{d?.limit_kmh || event.speed_limit_kmh || '?'} km/h</td></tr>
          {d?.start_time && <tr><td style={{ color: '#888' }}>Heure</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{new Date(d.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function TripMapView({ trip, events, onRoundaboutClick }) {
  const [leaflet, setLeaflet] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import('react-leaflet'), import('leaflet')]).then(([rl, l]) => {
      if (!cancelled) {
        setLeaflet({
          MapContainer: rl.MapContainer,
          TileLayer: rl.TileLayer,
          CircleMarker: rl.CircleMarker,
          Marker: rl.Marker,
          Popup: rl.Popup,
          Polyline: rl.Polyline,
          divIcon: l.divIcon,
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const gpsTrack = trip?.gps_track || [];

  const mapCenter = useMemo(() => {
    if (gpsTrack.length > 0) {
      const mid = gpsTrack[Math.floor(gpsTrack.length / 2)];
      return [mid.lat, mid.lng];
    }
    if (trip?.start_latitude) return [trip.start_latitude, trip.start_longitude];
    return [48.8566, 2.3522];
  }, [gpsTrack, trip]);

  const coloredSegments = useMemo(() =>
    gpsTrack.length >= 2
      ? gpsTrack.slice(0, -1).map((p, i) => ({
          positions: [[p.lat, p.lng], [gpsTrack[i + 1].lat, gpsTrack[i + 1].lng]],
          color: getSpeedColor(p.speed_kmh || 0, p.speed_limit || 50),
        }))
      : [],
    [gpsTrack]
  );

  const roundaboutEvents = useMemo(() =>
    events.filter(e => e.event_type?.startsWith('roundabout') && e.latitude),
    [events]
  );
  const stopEvents = useMemo(() =>
    events.filter(e => e.event_type?.startsWith('stop') && e.latitude),
    [events]
  );
  const speedingEvents = useMemo(() =>
    events.filter(e => e.event_type === 'speeding' && e.latitude),
    [events]
  );
  const otherEvents = useMemo(() =>
    events.filter(e => !['roundabout_good','roundabout_poor','roundabout_dangerous','stop_respected','stop_violated','speeding','gps_lost','gps_resumed'].includes(e.event_type) && e.latitude),
    [events]
  );

  if (!leaflet) {
    return (
      <div className="flex items-center justify-center h-full bg-secondary/30 rounded-xl">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Marker, Popup, Polyline, divIcon } = leaflet;

  const makeStopIcon = (color) => divIcon({
    className: 'stop-sign-marker',
    html: `<div style="
      width:26px;height:26px;background:${color};
      clip-path:polygon(30% 0%,70% 0%,100% 30%,100% 70%,70% 100%,30% 100%,0% 70%,0% 30%);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 0 0 2px #fff inset,0 1px 4px rgba(0,0,0,.5);
    "><span style="color:#1a1a1a;font-size:8px;font-weight:900;letter-spacing:-.5px">STOP</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  if (gpsTrack.length === 0 && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-secondary/30 rounded-xl">
        <p className="text-muted-foreground text-sm">Aucun tracé GPS disponible</p>
      </div>
    );
  }

  return (
    <MapContainer center={mapCenter} zoom={14} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* Tracé GPS coloré par vitesse */}
      {coloredSegments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          pathOptions={{ color: seg.color, weight: 4, opacity: 0.85 }}
        />
      ))}

      {/* Départ */}
      {gpsTrack.length > 0 && (
        <CircleMarker
          center={[gpsTrack[0].lat, gpsTrack[0].lng]}
          radius={9}
          pathOptions={{ color: '#C8F230', fillColor: '#C8F230', fillOpacity: 1, weight: 2 }}
        >
          <Popup><div style={popupStyle}><b>🚦 Départ</b></div></Popup>
        </CircleMarker>
      )}

      {/* Arrivée */}
      {gpsTrack.length > 1 && (
        <CircleMarker
          center={[gpsTrack[gpsTrack.length - 1].lat, gpsTrack[gpsTrack.length - 1].lng]}
          radius={9}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
        >
          <Popup><div style={popupStyle}><b>🏁 Arrivée</b></div></Popup>
        </CircleMarker>
      )}

      {/* Ronds-points (grand cercle cliquable) */}
      {roundaboutEvents.map((e) => {
        const rating = formatRoundaboutRating(e.roundabout_detail?.rating);
        const color = e.event_type === 'roundabout_dangerous' ? '#ef4444'
          : e.event_type === 'roundabout_poor' ? '#f97316' : '#C8F230';
        return (
          <CircleMarker
            key={e.id}
            center={[e.latitude, e.longitude]}
            radius={11}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 3 }}
          >
            <Popup maxWidth={220}><RoundaboutPopup event={e} onDetailClick={onRoundaboutClick ? () => onRoundaboutClick(e) : null} /></Popup>
          </CircleMarker>
        );
      })}

      {/* STOP — panneau octogonal */}
      {stopEvents.map((e) => {
        const color = e.event_type === 'stop_respected' ? '#C8F230'
          : e.stop_detail?.rating === 'glisse' ? '#F2C230' : '#ef4444';
        return (
          <Marker
            key={e.id}
            position={[e.latitude, e.longitude]}
            icon={makeStopIcon(color)}
          >
            <Popup maxWidth={200}><StopPopup event={e} /></Popup>
          </Marker>
        );
      })}

      {/* Excès de vitesse */}
      {speedingEvents.map((e) => (
        <CircleMarker
          key={e.id}
          center={[e.latitude, e.longitude]}
          radius={8}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.85, weight: 2 }}
        >
          <Popup maxWidth={200}><SpeedingPopup event={e} /></Popup>
        </CircleMarker>
      ))}

      {/* Autres événements */}
      {otherEvents.map((e) => {
        const EVENT_COLORS = {
          harsh_braking: '#ef4444',
          harsh_acceleration: '#f97316',
          speeding: '#ef4444',
          stop_respected: '#C8F230',
          stop_violated: '#ef4444',
          roundabout_good: '#C8F230',
          roundabout_poor: '#f97316',
          roundabout_dangerous: '#ef4444',
          phone_usage: '#ef4444',
        };
        return (
          <CircleMarker
            key={e.id}
            center={[e.latitude, e.longitude]}
            radius={6}
            pathOptions={{
              color: EVENT_COLORS[e.event_type] || '#888',
              fillColor: EVENT_COLORS[e.event_type] || '#888',
              fillOpacity: 0.7,
              weight: 2,
            }}
          >
            <Popup><div style={popupStyle}>{e.description || e.event_type}</div></Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}