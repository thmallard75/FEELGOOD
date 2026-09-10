import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { User, Shield, Car, Building2, GraduationCap, LogOut, Trash2, FileText, Bell, Eye, Smartphone, RefreshCw, Mail } from 'lucide-react';
import OsmErrorLog from '../components/profile/OsmErrorLog';
import ProfileAvatar from '../components/profile/ProfileAvatar';
import ParentSection from '../components/parent/ParentSection';
import TrustPact from '../components/feelgood/TrustPact';
import RegionDownloader from '../components/profile/RegionDownloader';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const profileTypes = [
  { value: 'driver', label: 'Conducteur', icon: Car, description: 'Améliorez votre conduite au quotidien' },
  { value: 'parent', label: 'Parent', icon: Shield, description: "Suivez la conduite de vos proches" },
  { value: 'school', label: 'Auto-école', icon: GraduationCap, description: 'Accompagnez vos élèves' },
  { value: 'company', label: 'Entreprise', icon: Building2, description: 'Gérez votre flotte' },
];

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profileType, setProfileType] = useState('driver');
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeResult, setReanalyzeResult] = useState(null);
  const [sendingSummary, setSendingSummary] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const me = await base44.auth.me();
      setUser(me);
      setProfileType(me.profile_type || 'driver');
      setNotifications(me.notifications !== false);
      setLoading(false);
    };
    loadUser();
  }, []);

  const { data: trips = [] } = useQuery({
    queryKey: ['profile-trips'],
    queryFn: () => base44.entities.Trip.list('-start_time', 100),
    enabled: !!user,
  });

  const handleSaveProfile = async (type) => {
    setProfileType(type);
    await base44.auth.updateMe({ profile_type: type });
    toast.success('Profil mis à jour');
  };

  const handleToggleNotifications = async (value) => {
    setNotifications(value);
    await base44.auth.updateMe({ notifications: value });
    toast.success(value ? 'Notifications activées' : 'Notifications désactivées');
  };

  const handleLogout = () => {
    base44.auth.logout('/');
  };

  const handleReanalyzeAll = async () => {
    setReanalyzing(true);
    setReanalyzeResult(null);
    const res = await base44.functions.invoke('reanalyzeAllTrips', {});
    setReanalyzeResult(res.data);
    setReanalyzing(false);
    if (res.status >= 400) {
      toast.error(res.data?.error || 'Échec du recalcul');
      return;
    }
    toast.success(`${res.data?.success ?? 0} trajet(s) recalculé(s) sur ${res.data?.total ?? 0}`);
  };

  const handleSendSummary = async () => {
    setSendingSummary(true);
    try {
      const res = await base44.functions.invoke('sendWeeklySummary', {});
      if (res.status >= 400) {
        toast.error(res.data?.error || 'Échec de l’envoi du bilan');
      } else {
        toast.success(`Bilan de conduite envoyé à ${user?.email || 'ta boîte mail'}`);
      }
    } catch (e) {
      toast.error('Échec de l’envoi du bilan');
    } finally {
      setSendingSummary(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (base44.isDemo) {
      base44.resetDemo();
      return;
    }
    try {
      await base44.functions.invoke('deleteUserData', {});
      toast.success('Vos données ont été supprimées. Vous allez être déconnecté.');
    } catch (e) {
      toast.error('Échec de la suppression des données — réessayez plus tard.');
      return;
    }
    setTimeout(() => base44.auth.logout('/'), 1500);
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
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Profil</h1>
        <p className="text-sm text-muted-foreground mt-1">Gérez vos paramètres et préférences</p>
      </motion.div>

      {/* User Info + Avatar */}
      <Card className="p-5 bg-card border-border">
        <ProfileAvatar user={user} onUpdate={setUser} />
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </Card>

      {/* Profile Type */}
      <Card className="p-5 bg-card border-border">
        <h3 className="text-sm font-semibold text-foreground mb-4">Type de profil</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profileTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => handleSaveProfile(type.value)}
              aria-pressed={profileType === type.value}
              aria-label={`${type.label} — ${type.description}`}
              className={`min-h-[56px] p-4 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                profileType === type.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30 hover:bg-secondary/30'
              }`}
            >
              <type.icon className={`w-5 h-5 mb-2 ${profileType === type.value ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">{type.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Settings */}
      <Card className="p-5 bg-card border-border space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Paramètres</h3>
        <div className="flex items-center justify-between min-h-[44px]">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Résumés de progression</Label>
              <p className="text-xs text-muted-foreground">Privilégier un résumé périodique plutôt qu'une alerte après chaque trajet</p>
            </div>
          </div>
          <Switch
        checked={notifications}
        onCheckedChange={handleToggleNotifications}
        aria-label="Activer ou désactiver les notifications"
      />
        </div>
        <div className="pt-4 border-t border-border">
          <Button
            onClick={handleSendSummary}
            disabled={sendingSummary}
            variant="outline"
            size="sm"
            className="w-full min-h-[44px] text-xs"
          >
            <Mail className={`w-3.5 h-3.5 mr-1.5 ${sendingSummary ? 'animate-pulse' : ''}`} />
            {sendingSummary ? 'Envoi du bilan…' : 'Recevoir mon bilan maintenant'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Envoie immédiatement un résumé de tes 7 derniers jours (points forts, axe de progression, conseils) sur {user?.email}.
          </p>
        </div>
      </Card>

      {/* Pacte de confiance */}
      <TrustPact />

      {/* Espace parent */}
      <Card className="p-5 bg-card border-border">
        <ParentSection user={user} trips={trips} />
      </Card>

      {/* RGPD */}
      <Card className="p-5 bg-card border-border space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Données personnelles (RGPD)
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Vos données de conduite sont utilisées uniquement pour améliorer votre expérience de conduite. 
          Elles ne sont jamais partagées à des tiers sans votre consentement explicite. 
          Les statistiques collectivités sont entièrement anonymisées.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" className="text-xs min-h-[44px]">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Exporter mes données
          </Button>
          <Button variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive min-h-[44px]">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Supprimer mes données
          </Button>
        </div>
      </Card>

      {/* Cartes téléchargées */}
      <RegionDownloader />

      {/* Journal OSM */}
      <Card className="p-5 bg-card border-border">
        <OsmErrorLog />
      </Card>

      {/* Ce que l'app surveille */}
      <Card className="p-5 bg-card border-border space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Comment Feelgood t'aide
        </h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm">😴</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Détection de fatigue</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                L'app mesure la durée de conduite continue et détecte des signes comportementaux (variations de vitesse, trajectoire instable). Une alerte s'affiche après 2h (1h la nuit). Ces informations apparaissent uniquement dans ton rapport personnel.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Smartphone className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Utilisation du téléphone</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                L'app détecte si tu passes en arrière-plan (autre app ou veille) plus de 8 secondes pendant la conduite, ou si tu touches l'écran plus de 3 secondes à plus de 30 km/h. Aucune donnée n'est partagée — c'est uniquement pour ton bilan personnel.
              </p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-primary font-medium">🎯 Objectif pédagogique uniquement</p>
            <p className="text-xs text-muted-foreground mt-1">
              Toutes ces données sont stockées localement dans ton rapport de trajet personnel et ne sont jamais transmises à des tiers.
            </p>
          </div>
        </div>
      </Card>

      {/* Admin: Recalculer tous les trajets */}
      {user?.role === 'admin' && (
        <Card className="p-5 bg-card border-border space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Administration
          </h3>
          <p className="text-xs text-muted-foreground">
            Relance l'analyse OSM (ronds-points, stops, vitesses) sur tous les trajets enregistrés.
          </p>
          {reanalyzeResult && (
            <p className="text-xs text-primary font-medium">
              ✓ {reanalyzeResult.success} réussi · {reanalyzeResult.failed} échoué sur {reanalyzeResult.total} trajets
            </p>
          )}
          <Button
            onClick={handleReanalyzeAll}
            disabled={reanalyzing}
            variant="outline"
            size="sm"
            className="w-full min-h-[44px] text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${reanalyzing ? 'animate-spin' : ''}`} />
            {reanalyzing ? 'Recalcul en cours…' : 'Recalculer tous les trajets'}
          </Button>
        </Card>
      )}

      {/* Logout / reset test */}
      {base44.isDemo ? (
        <Button
          variant="outline"
          onClick={() => {
            base44.resetDemo();
          }}
          className="w-full min-h-[44px]"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Réinitialiser les données de test
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={handleLogout}
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 min-h-[44px]"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Se déconnecter
        </Button>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <a href="/confidentialite" className="hover:underline">Politique de confidentialité</a>
      </p>

      {/* Delete Account — required by Apple */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            className="w-full text-destructive/70 hover:text-destructive hover:bg-destructive/5 min-h-[44px] text-sm"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer mon compte
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer mon compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes vos données de conduite, trajets et statistiques seront définitivement supprimés. Vous ne pourrez pas récupérer votre compte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}