import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import PeriodSelector from '@/components/statistics/PeriodSelector';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';
import ProgressionHero from '@/components/statistics/ProgressionHero';
import RadarAxes from '@/components/statistics/RadarAxes';
import ScoreHistory from '@/components/statistics/ScoreHistory';
import MomentsBreakdown from '@/components/statistics/MomentsBreakdown';
import PeriodResume from '@/components/statistics/PeriodResume';
import AxesToProgress from '@/components/statistics/AxesToProgress';

const PERIOD_DAYS = { '7': 7, '30': 30, '90': 90, all: null };

export default function Statistics() {
  const [periodKey, setPeriodKey] = useState('30');
  const days = PERIOD_DAYS[periodKey];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['coaching-aggregate', periodKey],
    queryFn: () => base44.functions.invoke('computeCoaching', { days }),
  });

  const { pullDistance, isRefreshing } = usePullToRefresh(refetch);

  const review = data?.data?.review;
  const delta = data?.data?.delta;
  const kpis = review?.kpis;
  const hasTrips = (kpis?.period?.trips ?? 0) > 0;

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
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Ma progression</h1>
        <p className="text-sm text-muted-foreground mt-1">Un regard sur tes axes de conduite</p>
      </motion.div>

      <PeriodSelector value={periodKey} onChange={setPeriodKey} />

      {!hasTrips ? (
        <div className="p-10 rounded-2xl bg-card border border-border text-center">
          <p className="text-sm text-muted-foreground">Pas encore assez de trajets sur cette période. Lance une première sortie pour voir ta progression.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <ProgressionHero kpis={kpis} delta={delta} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RadarAxes mastery={kpis.mastery} />
            <ScoreHistory weeks={kpis.weeks} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MomentsBreakdown kpis={kpis} />
            <PeriodResume kpis={kpis} />
          </div>

          <AxesToProgress review={review} />
        </div>
      )}
    </div>
  );
}