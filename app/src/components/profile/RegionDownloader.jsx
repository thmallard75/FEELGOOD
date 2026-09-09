import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Map as MapIcon, Download, RefreshCw, CheckCircle2, AlertCircle, Loader2, HardDrive } from 'lucide-react';
import { REGIONS, SIZE_LABEL } from '@/lib/regionCatalog';
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
          <h3 className="text-sm font-semibold text-foreground">Cartes téléchargées</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Pré-charge une région pour analyser tes trajets instantanément, sans dépendre du réseau. Comme BMW Motorrad — ta carte reste dans l'app.
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
        Le téléchargement s'effectue par tronçons et reprend automatiquement en arrière-plan. La carte est partagée entre tous les utilisateurs de l'app.
      </p>
    </Card>
  );
}