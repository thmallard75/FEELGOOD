import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Info } from 'lucide-react';
import {
  serenityAppreciation,
  serenityLabel,
  serenityTone,
  buildTripInsights,
  isIndicatif,
  evolutionText,
} from '@/lib/feelgoodCopy';

/**
 * Panel de bilan de conduite — version « sérénité ».
 * Affiche l'indice, l'appréciation, les points forts, le point à consolider,
 * le conseil Feelgood, l'évolution et la mention « indicatif » le cas échéant.
 */
export default function SerenityPanel({ trip, events = [], previousScore = null, compact = false }) {
  const score = trip?.overall_score ?? null;
  const appreciation = serenityAppreciation(score);
  const label = serenityLabel(score);
  const tone = serenityTone(score);
  const { strengths, toImprove, conseil } = buildTripInsights(trip, events);
  const indicatif = isIndicatif(trip);
  const evo = evolutionText(score, previousScore);

  return (
    <div className="space-y-4">
      {/* Indice de sérénité */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-2xl bg-card border border-border"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Indice de sérénité</p>
            <p className={`text-2xl font-bold mt-1 ${tone.text}`}>{label}</p>
            <p className="text-sm text-foreground mt-2 leading-relaxed">{appreciation}</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Indice {score ?? '—'}{score != null && ' / 100'} — indicatif, sans jugement
            </p>
            {evo && (
              <p className="text-xs text-muted-foreground mt-1.5">{evo}</p>
            )}
          </div>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${tone.ring}`}>
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </motion.div>

      {/* Points forts */}
      {!compact && strengths.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Points forts</h4>
          <ul className="space-y-1.5">
            {strengths.map((str, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-primary mt-0.5 flex-shrink-0">✓</span>
                <span>{str}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Point à consolider */}
      {!compact && toImprove.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Point à consolider</h4>
          <ul className="space-y-1.5">
            {toImprove.slice(0, 2).map((str, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-yellow-400 mt-0.5 flex-shrink-0">→</span>
                <span>{str}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conseil Feelgood */}
      {conseil && (
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">Conseil Feelgood</h4>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{conseil}</p>
        </div>
      )}

      {/* Mention indicatif */}
      {indicatif && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-secondary/40 border border-border">
          <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bilan partiel — Feelgood n'a pas obtenu assez de données fiables pour établir un indice complet.
            Les informations sont indicatives et peuvent être influencées par la qualité du signal et les conditions de circulation.
          </p>
        </div>
      )}
    </div>
  );
}