import React from 'react';
import { Shield } from 'lucide-react';

/**
 * Pacte de confiance — bloc de transparence réutilisable
 * accessible côté jeune conducteur comme côté parent.
 */
export default function TrustPact({ compact = false, asParent = false }) {
  return (
    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold text-primary">Pacte de confiance</h4>
      </div>
      <p className="text-sm text-foreground leading-relaxed">
        Un regard sur la conduite, pas sur la destination.
      </p>
      {!compact && (
        <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          {asParent ? (
            <>
              <li>• Vous suivez une évolution globale — jamais le trajet détaillé, l'itinéraire ni les horaires.</li>
              <li>• Aucune carte, aucune position en temps réel, aucune destination n'est visible ici.</li>
              <li>• Les informations restent indicatives et pédagogiques.</li>
              <li>• Le jeune conducteur peut révoquer cet accès à tout moment.</li>
            </>
          ) : (
            <>
              <li>• Feelgood analyse ta conduite pour t'aider à progresser, pas pour te surveiller.</li>
              <li>• Les destinations, itinéraires et horaires précis restent privés.</li>
              <li>• Ton parent voit une évolution globale, jamais ton trajet détaillé.</li>
              <li>• Tu peux révoquer l'accès ou supprimer l'historique à tout moment.</li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}