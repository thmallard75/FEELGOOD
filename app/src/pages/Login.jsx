import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

export default function Login({ onAuthenticated }) {
  const [providers, setProviders] = useState({ email: true, google: false, facebook: false, apple: false });
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    base44.auth.providers?.().then(setProviders).catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await base44.auth.register(email, password, fullName);
      } else {
        await base44.auth.loginWithEmail(email, password);
      }
      onAuthenticated?.();
    } catch (e) {
      setError(e.message || 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      icon={Shield}
      title="FeelGood Conduite"
      subtitle="Connecte-toi pour retrouver tes trajets et les partager avec un parent."
      footer="Tes données restent sur ton serveur FeelGood — pas sur Base44."
    >
      <div className="space-y-3 mb-6">
        {providers.google && (
          <Button type="button" variant="outline" className="w-full h-11" onClick={() => base44.auth.loginWithProvider('google')}>
            Continuer avec Google
          </Button>
        )}
        {providers.facebook && (
          <Button type="button" className="w-full h-11 bg-[#1877F2] hover:bg-[#166fe0] text-white" onClick={() => base44.auth.loginWithProvider('facebook')}>
            Continuer avec Facebook
          </Button>
        )}
        {providers.apple && (
          <Button type="button" className="w-full h-11 bg-black hover:bg-neutral-800 text-white" onClick={() => base44.auth.loginWithProvider('apple')}>
            Continuer avec Apple
          </Button>
        )}
        {(providers.google || providers.facebook || providers.apple) && (
          <p className="text-center text-xs text-muted-foreground pt-1">ou avec un e-mail</p>
        )}
      </div>

      <form className="space-y-4" onSubmit={submit}>
        {mode === 'register' && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Prénom</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Thomas" autoComplete="name" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@gmail.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full h-11" disabled={busy}>
          {busy ? 'Connexion…' : (mode === 'register' ? 'Créer mon compte' : 'Se connecter')}
        </Button>
      </form>

      <button
        type="button"
        className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
      >
        {mode === 'login' ? 'Pas encore de compte ? Inscription' : 'Déjà un compte ? Connexion'}
      </button>
    </AuthLayout>
  );
}
