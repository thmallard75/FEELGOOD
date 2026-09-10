import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Map as MapIcon, Download, RefreshCw, CheckCircle2, AlertCircle, Loader2, HardDrive } from 'lucide-react';
import { REGIONS, SIZE_LABEL, GRAND_EST_DEPT_CODES } from '@/lib/regionCatalog';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function RegionDownloader() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [optimistic, setOptimistic] = useState({});

  const { data: downloads = [], refetch } = useQuery({
    queryKey: ['region-downloads'],
    queryFn: () => base44.entities.RegionDownload.list('-updated_date', 100),
    refetchInterval: (query) => {
      const anyDownloading = query.state.data?.some((d) => d.status === 'downloading');
      return anyDownloading ? 5000 : false;
    },
  });

  const { data: preloads = [] } = useQuery({
    queryKey: ['departement-preload'],
    queryFn: async () => {
      try {
        return (await base44.entities.DepartementPreload.list('-updated_date', 200)) || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 15000,
  });

  const geoStats = React.useMemo(() => {
    const byCode = {};
    for (const d of preloads) byCode[d.code] = d;
    const rows = GRAND_EST_DEPT_CODES.map((code) => byCode[code]).filter(Boolean);
    const complete = rows.filter((d) => d.status === 'complete' || d.status === 'done').length;
    const downloading = rows.filter((d) => d.status === 'downloading').length;
    const pending = rows.filter((d) => d.status === 'pending').length;
    const cellsDone = rows.reduce((s, d) => s + (d.cells_done || 0), 0);
    return { rows, complete, downloading, pending, cellsDone, total: GRAND_EST_DEPT_CODES.length };
  }, [preloads]);

  const byCode = React.useMemo(() => {
    const map = {};
    for (const d of downloads) map[d.region_code] = d;
    return map;
  }, [downloads]);

  const handleDownload = async (code) => {
    setBusy(code);
    setOptimistic((prev) => ({ ...prev, [code]: 'downloading' }));
    try {
      const res = await base44.functions.invoke('prefetchRegion', { regionCode: code });
      if (res.data?.ok) {
        const { cells_done, cells_total, complete } = res.data;
        if (complete) toast.success('Carte régionale téléchargée — tes trajets dans cette zone seront analysés instantanément.');
        else toast.message(`Téléchargement en cours… ${cells_done}/${cells_total} cellules`);
      } else if (res.data?.error) {
        toast.error(res.data.error);
      }
    } catch (e) {
      toast.error("Téléchargement interrompu — relance pour reprendre là où il s'est arrêté.");
    } finally {
      setBusy(null);
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      refetch();
      queryClient.invalidateQueries(['region-downloads']);
    }
  };

  const statusChips = {
    none: { label: 'Non téléchargé', cls: 'bg-secondary text-muted-foreground', icon: HardDrive },
    downloading: { label: 'En cours', cls: 'bg-primary/15 text-primary', icon: Loader2 },
    complete: { label: 'Prêt', cls: 'bg-primary/15 text-primary', icon: CheckCircle2 },
    failed: { label: 'À reprendre', cls: 'bg-orange-500/15 text-orange-400', icon: AlertCircle },
    stale: { label: 'À actualiser', cls: 'bg-orange-500/15 text-orange-400', icon: AlertCircle },
  };

  const getChip = (rec, code) => {
    if (code && optimistic[code]) return statusChips.downloading;
    if (!rec) return statusChips.none;
    if (rec.status === 'downloading') return statusChips.downloading;
    if (rec.status === 'failed') return statusChips.failed;
    if (rec.status === 'complete') {
      const stale = rec.last_sync && Date.now() - new Date(rec.last_sync).getTime() > 30 * 24 * 3600 * 1000;
      return stale ? statusChips.stale : statusChips.complete;
    }
    return statusChips.none;
  };

  const pct = (rec) => {
    if (!rec || !rec.cells_total) return 0;
    return Math.min(100, Math.round((rec.cells_done / rec.cells_total) * 100));
  };

  return (
    <Card className="p-5 bg-card border-border space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <MapIcon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Carte serveur Geofabrik</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            C’est cette carte (limites, stops, giratoires) que le serveur utilise pour calculer tes KPI.
            Elle se charge toute seule, tu n’as rien à télécharger ici.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-border/60 bg-secondary/20 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">Grand Est</p>
          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
            geoStats.complete === geoStats.total
              ? 'bg-primary/15 text-primary'
              : geoStats.downloading || geoStats.complete
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-muted-foreground'
          }`}>
            {geoStats.complete === geoStats.total
              ? 'Prêt'
              : geoStats.downloading
                ? 'En cours'
                : geoStats.pending
                  ? 'En file'
                  : 'Pas encore chargé'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {geoStats.complete}/{geoStats.total} départements
          {geoStats.cellsDone > 0 ? ` · ${geoStats.cellsDone} blocs routiers` : ''}
        </p>
        {geoStats.rows.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {geoStats.rows.map((d) => (
              <span key={d.code} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {d.code} {d.status === 'complete' || d.status === 'done' ? '✓' : d.status === 'downloading' ? '…' : '○'}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 pt-2">
        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Complément Overpass</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Optionnel. Un clic ne charge pas tout le Grand Est et n’est pas Geofabrik.
            Utile seulement si une zone manque encore après un trajet.
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {REGIONS.map((r) => {
          const rec = byCode[r.code];
          const chip = getChip(rec, r.code);
          const ChipIcon = chip.icon;
          const isBusy = busy === r.code;
          const isDownloading = rec?.status === 'downloading' || optimistic[r.code] === 'downloading';
          return (
            <div key={r.code} className="p-3 rounded-xl border border-border/60 bg-secondary/20">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${chip.cls}`}>
                      <ChipIcon className={`w-2.5 h-2.5 ${isDownloading ? 'animate-spin' : ''}`} />
                      {chip.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{SIZE_LABEL[r.size]}</span>
                    {rec?.last_sync && (
                      <span className="text-xs text-muted-foreground">
                        · {format(new Date(rec.last_sync), "d MMM yyyy", { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={rec ? 'outline' : 'default'}
                  className="h-8 text-xs px-2.5 flex-shrink-0"
                  disabled={isBusy || isDownloading}
                  onClick={() => handleDownload(r.code)}
                >
                  {isBusy || isDownloading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : rec ? (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  ) : (
                    <Download className="w-3 h-3 mr-1" />
                  )}
                  {rec ? (isDownloading ? 'En cours' : 'Recharger') : 'Télécharger'}
                </Button>
              </div>
              {rec && rec.cells_total > 0 && (
                <div className="mt-2">
                  <Progress value={pct(rec)} className="h-1" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {rec.cells_done}/{rec.cells_total} blocs {pct(rec) >= 100 ? '— couverture complète' : `(${pct(rec)}%)`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        Geofabrik alimente le moteur de scores sur le serveur. Le complément Overpass ci-dessus est un filet de sécurité, pas la source principale.
      </p>
    </Card>
  );
}