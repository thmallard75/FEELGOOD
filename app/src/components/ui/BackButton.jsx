import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Bouton retour universel.
 * - Utilise navigate(-1) pour préserver le scroll et l'état React Query.
 * - Fallback vers `fallbackPath` si pas d'historique (accès direct par URL).
 * - Label accessible pour VoiceOver Apple.
 */
export default function BackButton({ fallbackPath = '/', label = 'Retour' }) {
  const navigate = useNavigate();

  const handleBack = () => {
    // Si l'utilisateur est arrivé directement sur cette page, history.length <= 2
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  };

  return (
    <button
      onClick={handleBack}
      aria-label={label}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] -ml-1 px-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}