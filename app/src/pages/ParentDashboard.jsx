import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Shield, Car, TrendingUp, MapPin, Phone, AlertTriangle, Smile, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { syncParentStats } from '@/lib/parentStats';
import TrustPact from '@/components/feelgood/TrustPact';

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-muted-foreground text-lg font-bold">—</span>;
  const cls = score >= 70 ? 'bg-primary/15 text-primary' : score >= 50 ? 'bg-yellow-400/15 text-yellow-400' : 'bg-orange-400/15 text-orange-400';
  return (
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl ${cls}`}>
      {score}
    </div>
  );
}

function CategoryBar({ label, score, emoji }) {
  if (score == null) return null;
  const barColor = score >= 70 ? 'bg-primary' : score >= 50 ? 'bg-yellow-400' : 'bg-orange-400';
  const text = score >= 70 ? 'text-primary' : score >= 50 ? 'text-yellow-400' : 'text-orange-400';
  return (
    <div className="flex items-center gap-3">
      <span className="text-base w-6 flex-shrink-0">{emoji}</span>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">{label}</span>
          <span className={`font-bold ${text}`}>{score}</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}

function YoungDriverCard({ link, onSync, syncing }) {
  const [expanded, setExpanded] = useState(true);

  const cats = link.category_scores || {};
  const trend = link.weekly_trend || [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <Card className="p-5 border-border bg-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Car className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{link.young_driver_name || link.young_driver_email}</h2>
              <p className="text-xs text-muted-foreground">Jeune conducteur</p>
            </div>
          </div>
          <button
            onClick={() => onSync(link)}
            disabled={syncing}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Message encourageant */}
        {link.encouraging_message && (
          <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/15">
            <p className="text-sm text-foreground font-medium">💬 {link.encouraging_message}</p>
          </div>
        )}
      </Card>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 border-border bg-card">
          <p className="text-xs text-muted-foreground mb-2">Indice de sérénité — semaine</p>
          <div className="flex items-end gap-2">
            <ScoreBadge score={link.weekly_score} />
            <div>
              <p className="text-xs text-muted-foreground">{link.trips_count_week || 0} trajet{(link.trips_count_week || 0) !== 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground/60">cette semaine</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-border bg-card">
          <p className="text-xs text-muted-foreground mb-2">Indice de sérénité — mois</p>
          <div className="flex items-end gap-2">
            <ScoreBadge score={link.monthly_score} />
            <div>
              <p className="text-xs text-muted-foreground">{link.trips_count_month || 0} trajet{(link.trips_count_month || 0) !== 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground/60">ce mois</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Lieux & destination non affichée */}
      <Card className="p-4 border-border bg-card flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <MapPin className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Destination : non affichée</p>
          <p className="text-xs text-muted-foreground">La confidentialité du trajet est préservée — aucune carte, aucun itinéraire, aucune heure précise.</p>
        </div>
      </Card>

      {/* Progression hebdo */}
      {trend.length > 0 && trend.some(w => w.score > 0) && (
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Progression sur 6 semaines</h3>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(72,89%,58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(72,89%,58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="week_label" tick={{ fill: 'hsl(0,0%,55%)', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'hsl(0,0%,55%)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'hsl(0,0%,8.5%)', border: '1px solid hsl(0,0%,14%)', borderRadius: 8 }}
                labelStyle={{ color: 'hsl(0,0%,95%)', fontSize: 11 }}
                itemStyle={{ color: 'hsl(72,89%,58%)' }}
                formatter={(v) => [v > 0 ? `${v}/100` : '—', 'Score']}
              />
              <Area type="monotone" dataKey="score" stroke="hsl(72,89%,58%)" fill="url(#scoreGrad)" strokeWidth={2} dot={{ fill: 'hsl(72,89%,58%)', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Catégories */}
      <Card className="p-4 border-border bg-card">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between mb-3"
        >
          <h3 className="text-sm font-semibold text-foreground">Détail du bilan</h3>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expanded && (
          <div className="space-y-3">
            <CategoryBar label="Anticipation ronds-points" score={cats.anticipation} emoji="👁️" />
            <CategoryBar label="Respect des arrêts" score={cats.stop} emoji="🛑" />
            <CategoryBar label="Vitesse" score={cats.speed} emoji="🚗" />
            <CategoryBar label="Douceur de conduite" score={cats.smoothness} emoji="🪶" />
            <CategoryBar label="Attention & Fatigue" score={cats.attention} emoji="📵" />
          </div>
        )}
      </Card>

      {/* Points à accompagner */}
      {(link.alerts || []).length > 0 && (
        <Card className="p-4 border-orange-500/20 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-orange-400">Points à accompagner</h3>
          </div>
          <div className="space-y-2">
            {link.alerts.map((alert, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <span className="text-base flex-shrink-0">{alert.type === 'fatigue' ? '😴' : '📵'}</span>
                <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-2 italic">
            Événements à observer — sans localisation ni heure précise. Les informations restent indicatives.
          </p>
        </Card>
      )}

      {/* Pacte de confiance */}
      <TrustPact asParent />

      {link.last_sync && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Dernière mise à jour : {new Date(link.last_sync).toLocaleString('fr-FR')}
        </p>
      )}
    </motion.div>
  );
}

export default function ParentDashboard() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [codes, setCodes] = useState({});
  const [activating, setActivating] = useState(null);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      const myLinks = await base44.entities.ParentLink.filter({ parent_email: me.email });
      setLinks(myLinks.filter(l => l.status === 'active' || l.status === 'pending'));
      setLoading(false);
    });
  }, []);

  const handleActivate = async (link) => {
    const code = (codes[link.id] || '').trim();
    if (!code) {
      toast.error('Saisissez le code donné par le conducteur');
      return;
    }
    setActivating(link.id);
    try {
      const updated = await base44.entities.ParentLink.update(link.id, {
        status: 'active',
        invite_code: code,
      });
      setLinks(prev => prev.map(l => l.id === link.id ? updated : l));
      toast.success('Lien activé');
    } catch {
      toast.error('Code incorrect ou invitation expirée');
    } finally {
      setActivating(null);
    }
  };

  const handleSync = async (link) => {
    setSyncing(link.id);
    // Le parent ne peut pas sync lui-même (pas accès aux Trip)
    // Il voit juste les dernières stats enregistrées par le jeune
    const fresh = await base44.entities.ParentLink.filter({ id: link.id });
    if (fresh[0]) setLinks(prev => prev.map(l => l.id === link.id ? fresh[0] : l));
    setSyncing(null);
    toast.success('Données actualisées');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Espace Parent</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Un regard sur la conduite, pas sur la destination.
        </p>
      </motion.div>

      {links.length === 0 ? (
        <Card className="p-10 text-center border-border bg-card">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Smile className="w-8 h-8 text-primary" />
          </div>
          <p className="text-foreground font-medium">Aucun lien actif</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
            Demandez au jeune conducteur de vous inviter depuis son Profil → Espace parent, puis saisissez le code qu'il vous transmet.
          </p>
        </Card>
      ) : (
        links.map(link => (
          link.status === 'pending' ? (
            <Card key={link.id} className="p-5 border-border bg-card space-y-3">
              <p className="text-sm font-medium text-foreground">
                Une invitation est en attente
              </p>
              <p className="text-xs text-muted-foreground">
                Saisissez le code que le conducteur vous a montré (ou envoyé par e-mail) pour voir ses scores.
              </p>
              <div className="flex gap-2">
                <Input
                  value={codes[link.id] || ''}
                  onChange={(e) => setCodes((prev) => ({ ...prev, [link.id]: e.target.value }))}
                  placeholder="ABCD-EFGH"
                  autoComplete="one-time-code"
                  className="font-mono tracking-widest uppercase"
                />
                <Button
                  onClick={() => handleActivate(link)}
                  disabled={activating === link.id}
                  className="min-h-[44px]"
                >
                  {activating === link.id ? '…' : 'Activer'}
                </Button>
              </div>
            </Card>
          ) : (
            <YoungDriverCard key={link.id} link={link} onSync={handleSync} syncing={syncing === link.id} />
          )
        ))
      )}
    </div>
  );
}