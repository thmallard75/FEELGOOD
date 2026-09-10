import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Shield, Plus, Trash2, Mail, RefreshCw, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { syncParentStats } from '@/lib/parentStats';

const STATUS_CONFIG = {
  pending: { label: 'En attente', icon: Clock, color: 'text-yellow-400' },
  active:  { label: 'Actif',       icon: CheckCircle, color: 'text-primary' },
  revoked: { label: 'Révoqué',     icon: XCircle, color: 'text-muted-foreground' },
};

export default function ParentSection({ user, trips }) {
  const [links, setLinks] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(null);

  useEffect(() => {
    if (!user) return;
    base44.entities.ParentLink.filter({ young_driver_email: user.email }).then(setLinks);
  }, [user]);

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error('Adresse email invalide');
      return;
    }
    const existing = links.find(l => l.parent_email === email.trim() && l.status !== 'revoked');
    if (existing) {
      toast.error('Ce parent est déjà invité');
      return;
    }
    setLoading(true);
    const link = await base44.entities.ParentLink.create({
      young_driver_email: user.email,
      young_driver_name: user.full_name || user.email.split('@')[0],
      parent_email: email.trim().toLowerCase(),
      status: 'pending',
    });

    try {
      await base44.integrations.Core.SendEmail({
        parentLinkId: link.id,
        to: link.parent_email,
      });
    } catch (err) {
      console.warn('Invitation e-mail:', err.message);
    }

    setLinks(prev => [...prev, link]);
    setEmail('');
    setLoading(false);
    toast.success(`Invitation enregistrée pour ${email.trim()}`);
  };

  const handleRevoke = async (link) => {
    await base44.entities.ParentLink.update(link.id, { status: 'revoked' });
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, status: 'revoked' } : l));
    toast.success('Accès révoqué');
  };

  const handleSync = async (link) => {
    setSyncing(link.id);
    await syncParentStats(link.id, trips);
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, last_sync: new Date().toISOString() } : l));
    setSyncing(null);
    toast.success('Statistiques synchronisées');
  };

  const activeLinks = links.filter(l => l.status !== 'revoked');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Espace parent / tuteur</h3>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Invitez un parent ou tuteur à suivre votre progression. Il verra uniquement vos scores globaux et statistiques — jamais vos trajets individuels, vos lieux ou vos heures.
      </p>

      {/* Invite form */}
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="email@parent.fr"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleInvite()}
          className="flex-1"
        />
        <Button
          onClick={handleInvite}
          disabled={loading || !email.trim()}
          size="sm"
          className="min-h-[44px] px-3"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {/* Active links */}
      {activeLinks.length > 0 && (
        <div className="space-y-2">
          {activeLinks.map(link => {
            const cfg = STATUS_CONFIG[link.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            return (
              <motion.div
                key={link.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border"
              >
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{link.parent_email}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusIcon className={`w-3 h-3 ${cfg.color}`} />
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    {link.last_sync && (
                      <span className="text-xs text-muted-foreground">
                        · Synchro {new Date(link.last_sync).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {link.status === 'active' && (
                    <button
                      onClick={() => handleSync(link)}
                      disabled={syncing === link.id}
                      className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Synchroniser les statistiques"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing === link.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Révoquer l'accès ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {link.parent_email} ne pourra plus voir votre progression. Vous pouvez le réinviter à tout moment.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRevoke(link)}
                          className="bg-destructive text-destructive-foreground"
                        >
                          Révoquer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {activeLinks.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-2">
          Aucun parent invité pour l'instant
        </p>
      )}

      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
        <p className="text-xs text-primary font-medium">🔒 Vie privée garantie</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Les parents ne voient jamais vos trajets, lieux, heures ou événements détaillés. Seulement vos scores globaux.
        </p>
      </div>
    </div>
  );
}