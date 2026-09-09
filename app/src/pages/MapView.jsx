import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getSpeedColor } from '@/lib/gpsEngine';
import 'leaflet/dist/leaflet.css';

const EVENT_COLORS = {
  harsh_braking: '#ef4444',
  harsh_acceleration: '#f97316',
  sharp_turn: '#eab308',
  speeding: '#ef4444',
  stop_respected: '#C8F230',
  stop_violated: '#ef4444',
  roundabout_good: '#C8F230',
  roundabout_poor: '#f97316',
  roundabout_dangerous: '#ef4444',
  phone_usage: '#ef4444',
  good_anticipation: '#C8F230',
};

const EVENT_LABELS = {
  harsh_braking: 'Freinage brusque',
  harsh_acceleration: 'Accélération brusque',
  sharp_turn: 'Virage brusque',
  speeding: 'Excès de vitesse',
  stop_respected: 'STOP respecté',
  stop_violated: 'STOP non respecté',
  roundabout_good: 'Rond-point OK',
  roundabout_poor: 'Rond-point à améliorer',
  roundabout_dangerous: 'Rond-point dangereux',
  phone_usage: 'Téléphone',
  good_anticipation: 'Bonne anticipation',
};

export default function MapView() {
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [leaflet, setLeaflet] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import('react-leaflet').then((mod) => {
      if (!cancelled) setLeaflet(mod);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['trips-map'],
    queryFn: () => base44.entities.Trip.list('-start_time', 20),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events-map', selectedTrip],
    queryFn: () => selectedTrip
      ? base44.entities.DrivingEvent.filter({ trip_id: selectedTrip })
      : base44.entities.DrivingEvent.list('-timestamp', 100),
  });

  const currentTrip = selectedTrip ? trips.find(t => t.id === selectedTrip) : null;
  const gpsTrack = currentTrip?.gps_track || [];

  // Segments colorés selon vitesse
  const coloredSegments = gpsTrack.length >= 2
    ? gpsTrack.slice(0, -1).map((p, i) => ({
        positions: [[p.lat, p.lng], [gpsTrack[i + 1].lat, gpsTrack[i + 1].lng]],
        color: getSpeedColor(p.speed_kmh || 0, p.speed_limit || 50),
      }))
    : [];

  const mapCenter = gpsTrack.length > 0
    ? [gpsTrack[Math.floor(gpsTrack.length / 2)].lat, gpsTrack[Math.floor(gpsTrack.length / 2)].lng]
    : events.length > 0 && events[0].latitude
      ? [events[0].latitude, events[0].longitude]
      : trips.length > 0 && trips[0].start_latitude
        ? [trips[0].start_latitude, trips[0].start_longitude]
        : [48.8566, 2.3522];

  if (isLoading || !leaflet) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup, Polyline } = leaflet;

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Carte interactive</h1>
        <p className="text-sm text-muted-foreground mt-1">Visualisez vos trajets et événements</p>
      </motion.div>

      {/* Sélecteur trajet */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelectedTrip(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            !selectedTrip ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          Tous les trajets
        </button>
        {trips.slice(0, 6).map((trip) => (
          <button
            key={trip.id}
            onClick={() => setSelectedTrip(trip.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedTrip === trip.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {trip.start_time ? format(new Date(trip.start_time), "dd/MM HH:mm", { locale: fr }) : trip.id?.slice(0, 6)}
            {trip.overall_score ? ` · ${trip.overall_score}pts` : ''}
          </button>
        ))}
      </div>

      {/* Légende vitesse (si trajet sélectionné avec tracé) */}
      {currentTrip && gpsTrack.length > 0 && (
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <span className="text-muted-foreground">Tracé coloré par vitesse :</span>
          {[
            { color: '#C8F230', label: 'Limite respectée' },
            { color: '#F2C230', label: 'Proche limite' },
            { color: '#ef4444', label: 'Excès détecté' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Carte */}
      <div className="rounded-2xl overflow-hidden border border-border" style={{ height: 'calc(100vh - 300px)', minHeight: '400px' }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* Tracé GPS coloré */}
          {coloredSegments.map((seg, i) => (
            <Polyline
              key={i}
              positions={seg.positions}
              pathOptions={{ color: seg.color, weight: 4, opacity: 0.85 }}
            />
          ))}

          {/* Marqueur départ/arrivée */}
          {gpsTrack.length > 0 && (
            <>
              <CircleMarker
                center={[gpsTrack[0].lat, gpsTrack[0].lng]}
                radius={8}
                pathOptions={{ color: '#C8F230', fillColor: '#C8F230', fillOpacity: 1, weight: 2 }}
              >
                <Popup><p style={{ margin: 0, fontSize: 12, fontWeight: 'bold' }}>🚦 Départ</p></Popup>
              </CircleMarker>
              <CircleMarker
                center={[gpsTrack[gpsTrack.length - 1].lat, gpsTrack[gpsTrack.length - 1].lng]}
                radius={8}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
              >
                <Popup><p style={{ margin: 0, fontSize: 12, fontWeight: 'bold' }}>🏁 Arrivée</p></Popup>
              </CircleMarker>
            </>
          )}

          {/* Événements */}
          {events.map((event) => event.latitude && event.longitude && (
            <CircleMarker
              key={event.id}
              center={[event.latitude, event.longitude]}
              radius={7}
              pathOptions={{
                color: EVENT_COLORS[event.event_type] || '#C8F230',
                fillColor: EVENT_COLORS[event.event_type] || '#C8F230',
                fillOpacity: 0.8,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 140 }}>
                  <p style={{ fontWeight: 'bold', fontSize: 12, margin: '0 0 4px' }}>
                    {EVENT_LABELS[event.event_type] || event.event_type}
                  </p>
                  {event.speed_kmh && (
                    <p style={{ fontSize: 11, color: '#888', margin: '2px 0' }}>
                      Vitesse : {Math.round(event.speed_kmh)} km/h
                    </p>
                  )}
                  {event.description && (
                    <p style={{ fontSize: 11, color: '#888', margin: '2px 0' }}>{event.description}</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Légende événements */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Légende des événements</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(EVENT_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EVENT_COLORS[key] }} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}