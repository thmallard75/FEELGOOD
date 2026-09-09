import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  History, 
  BarChart3, 
  User, 
  Car,
  CircleDot,
  Shield,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

const BASE_NAV = [
  { path: '/', icon: LayoutDashboard, label: 'Accueil' },
  { path: '/trips', icon: History, label: 'Trajets' },
  { path: '/record', icon: CircleDot, label: 'Conduire', highlight: true },
  { path: '/stats', icon: BarChart3, label: 'Progression' },
  { path: '/coach', icon: GraduationCap, label: 'Coaching' },
  { path: '/profile', icon: User, label: 'Profil' },
];

const pageVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

// Routes whose scroll position + state should be preserved when switching tabs
const PRESERVED_TABS = ['/', '/trips', '/stats'];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isParent, setIsParent] = useState(false);

  useEffect(() => {
    base44.auth.me().then(me => {
      base44.entities.ParentLink.filter({ parent_email: me.email }).then(links => {
        setIsParent(links.some(l => l.status === 'active' || l.status === 'pending'));
      });
    }).catch(() => {});
  }, []);

  const navItems = isParent
    ? [...BASE_NAV, { path: '/parent', icon: Shield, label: 'Parent' }]
    : BASE_NAV;

  // Per-tab stack preservation: each tab remembers its last location so
  // switching back restores the deep link. Re-selecting the active tab
  // returns to that tab's root.
  const tabStacks = useRef({});
  const activeTab = useMemo(() => {
    const match = navItems.find(item =>
      location.pathname === item.path || location.pathname.startsWith(item.path + '/')
    );
    return match?.path || '/';
  }, [location.pathname, navItems]);

  useEffect(() => {
    tabStacks.current[activeTab] = location.pathname;
  }, [location.pathname, activeTab]);

  const handleTabClick = (item) => {
    if (item.path === activeTab) {
      if (location.pathname !== item.path) navigate(item.path);
    } else {
      const saved = tabStacks.current[item.path];
      navigate(saved || item.path);
    }
  };

  // Ensure the browser history stack allows the native iOS swipe-back gesture
  // by always pushing a real history entry (React Router does this by default with BrowserRouter).
  // We add a landmark role on the root for screen readers.

  return (
    <div className="min-h-screen bg-background flex" id="app-root">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-20 lg:w-64 border-r border-border bg-card/50 backdrop-blur-xl fixed h-full z-40">
        <div className="p-4 lg:p-6 flex items-center gap-3" aria-label="FeelGood Conduite — Accueil">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <Car className="w-5 h-5 text-primary-foreground" aria-hidden="true" />
          </div>
          <span className="hidden lg:block text-lg font-bold text-foreground tracking-tight" aria-hidden="true">
            FeelGood
          </span>
        </div>
        
        <nav className="flex-1 px-2 lg:px-3 space-y-1 mt-4" aria-label="Navigation principale">
          {navItems.map((item) => {
            const isActive = activeTab === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => { e.preventDefault(); handleTabClick(item); }}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  item.highlight
                    ? isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                    : isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {isActive && !item.highlight && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="hidden lg:block text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:block p-4 m-3 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">Version 1.0</p>
          <p className="text-xs text-primary font-medium mt-1">FeelGood Conduite</p>
        </div>
      </aside>

      {/* Mobile Header — iOS safe-area top */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-b border-border z-50 flex items-end justify-center"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(env(safe-area-inset-top) + 52px)' }}
      >
        <div className="w-full flex items-center justify-center px-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Car className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">FeelGood Conduite</span>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav — iOS safe-area bottom */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border z-40 flex items-start justify-around px-1 pt-1 select-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        aria-label="Navigation principale"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => { e.preventDefault(); handleTabClick(item); }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 rounded-lg transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                item.highlight
                  ? isActive ? 'bg-primary text-primary-foreground rounded-xl px-3' : 'text-primary'
                  : isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-xs font-medium" aria-hidden="true">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <main
        className="flex-1 md:ml-20 lg:ml-64 pb-24 md:pb-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 52px)' }}
      >
        <div className="md:pt-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Preserved tabs render without exit animation to keep query cache + scroll */}
          {PRESERVED_TABS.includes(location.pathname) ? (
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
            >
              <Outlet />
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  );
}