import React from 'react';

/** Bandeau visible uniquement dans le build de test (APK / PWA), sans Base44. */
export default function DemoBanner() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null;

  return (
    <div
      role="status"
      className="w-full text-center text-[10px] font-semibold tracking-wide uppercase bg-primary text-primary-foreground px-2 py-0.5"
    >
      Version de test — sans compte, données locales
    </div>
  );
}
