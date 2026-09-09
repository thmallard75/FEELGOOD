import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Search, SlidersHorizontal, Route } from 'lucide-react';
import { Input } from '@/components/ui/input';
import TripCard from '../components/dashboard/TripCard';
import MobileSelect from '@/components/ui/MobileSelect';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';

export default function Trips() {
  const [search, setSearch] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');

  const { data: trips = [], isLoading, refetch } = useQuery({
    queryKey: ['trips'],
    queryFn: () => base44.entities.Trip.list('-start_time', 50),
  });

  const { pullDistance, isRefreshing } = usePullToRefresh(refetch);

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = !search || 
      trip.start_address?.toLowerCase().includes(search.toLowerCase()) ||
      trip.end_address?.toLowerCase().includes(search.toLowerCase());
    
    const matchesScore = scoreFilter === 'all' || 
      (scoreFilter === 'excellent' && trip.overall_score >= 80) ||
      (scoreFilter === 'good' && trip.overall_score >= 60 && trip.overall_score < 80) ||
      (scoreFilter === 'average' && trip.overall_score >= 40 && trip.overall_score < 60) ||
      (scoreFilter === 'poor' && trip.overall_score < 40);

    return matchesSearch && matchesScore;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Historique des trajets</h1>
        <p className="text-sm text-muted-foreground mt-1">{trips.length} trajet{trips.length !== 1 ? 's' : ''} enregistré{trips.length !== 1 ? 's' : ''}</p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un trajet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <MobileSelect
            value={scoreFilter}
            onValueChange={setScoreFilter}
            placeholder="Tous les scores"
            label="Filtrer par score"
            triggerClassName="w-40 bg-card border-border"
            options={[
              { value: 'all', label: 'Tous les scores' },
              { value: 'excellent', label: 'Excellent (80+)' },
              { value: 'good', label: 'Bon (60-79)' },
              { value: 'average', label: 'Moyen (40-59)' },
              { value: 'poor', label: 'À améliorer (<40)' },
            ]}
          />
        </div>
      </div>

      {/* Trip List */}
      {filteredTrips.length > 0 ? (
        <div className="space-y-3">
          {filteredTrips.map((trip, i) => (
            <TripCard key={trip.id} trip={trip} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-2xl bg-card border border-border">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Route className="w-8 h-8 text-primary" />
          </div>
          <p className="text-foreground font-medium">Aucun trajet trouvé</p>
          <p className="text-sm text-muted-foreground mt-1">Modifiez vos filtres ou commencez un nouveau trajet</p>
        </div>
      )}
    </div>
  );
}