import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from './pages/Login';

import { lazy, Suspense } from 'react';
import AppLayout from './components/layout/AppLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Trips = lazy(() => import('./pages/Trips'));
const TripDetail = lazy(() => import('./pages/TripDetail'));
const MapView = lazy(() => import('./pages/MapView'));
const Statistics = lazy(() => import('./pages/Statistics'));
const Profile = lazy(() => import('./pages/Profile'));
const Recording = lazy(() => import('./pages/Recording'));

const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
const Coaching = lazy(() => import('./pages/Coaching'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, checkAppState } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') {
      return <Login onAuthenticated={() => checkAppState()} />;
    }
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-semibold text-foreground">Serveur FeelGood injoignable</p>
        <p className="text-sm text-muted-foreground max-w-sm">{authError.message}</p>
        <p className="text-xs text-muted-foreground">Vérifie que ton API tourne et que VITE_API_URL pointe vers son HTTPS.</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>}>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<TripDetail />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/stats" element={<Statistics />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/record" element={<Recording />} />
        <Route path="/coach" element={<Coaching />} />

        <Route path="/parent" element={<ParentDashboard />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};

const Router = import.meta.env.VITE_DEMO_MODE === 'true' ? HashRouter : BrowserRouter;

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        {/* Le mode test (PWA / iOS) utilise le hash : pas de serveur pour
            recrire les URL profondes. Hors demo, le basename suit le sous-chemin. */}
        <Router basename={import.meta.env.VITE_DEMO_MODE === 'true' ? undefined : import.meta.env.BASE_URL}>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App