import type { Statut } from '../constants'

/**
 * UI-facing metadata for each stage's fiche. The schemas live in
 * `./schemas.ts`; this file is the human-friendly index — labels,
 * eyebrows, and which date field (if any) drives the upstream
 * "next critical fact" pill in the candidature header.
 *
 * Centralising stops drift between schema, form, and pill.
 */
export interface StageFicheMeta {
  /** Human label shown above the fiche block. */
  title: string
  /** Eyebrow / kicker. Always uppercase tracking-wide in the UI. */
  eyebrow: string
  /**
   * Field name (in the fiche data_json) whose value drives the upstream
   * pill in the candidature header. Null when the stage has no
   * upstream surface (postule, preselection, refuse, hire-side fields
   * surface differently).
   */
  upstreamDateField: 'scheduledAt' | 'responseDeadline' | 'arrivalDateInNc' | null
  /**
   * Action label to render when the upstream pill is shown. e.g.,
   * "Ouvrir Meet" for entretien, "Voir le rapport" for aboro.
   */
  upstreamActionLabel: string | null
  /**
   * Field name whose value provides the action target (URL). When null
   * the action button is hidden even if `upstreamActionLabel` is set.
   */
  upstreamActionField: 'meetLink' | 'resultPdfUrl' | null
}

export const STAGE_FICHE_META: Record<Statut, StageFicheMeta> = {
  postule: {
    title: 'Première impression',
    eyebrow: 'Étape 01 · Postulé',
    upstreamDateField: null,
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
  preselectionne: {
    title: 'Présélection',
    eyebrow: 'Étape 02 · Présélectionné',
    upstreamDateField: null,
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
  skill_radar_envoye: {
    title: 'Skill Radar — envoi',
    eyebrow: 'Étape 03 · Skill Radar envoyé',
    upstreamDateField: null,
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
  skill_radar_complete: {
    title: 'Skill Radar — bilan',
    eyebrow: 'Étape 04 · Skill Radar complété',
    upstreamDateField: null,
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
  entretien_1: {
    title: 'Entretien 1',
    eyebrow: 'Étape 05 · Entretien 1',
    upstreamDateField: 'scheduledAt',
    upstreamActionLabel: 'Ouvrir Meet',
    upstreamActionField: 'meetLink',
  },
  aboro: {
    title: 'Test Âboro',
    eyebrow: 'Étape 06 · Test Âboro',
    upstreamDateField: 'scheduledAt',
    upstreamActionLabel: 'Ouvrir le rapport',
    upstreamActionField: 'resultPdfUrl',
  },
  entretien_2: {
    title: 'Entretien 2',
    eyebrow: 'Étape 07 · Entretien 2',
    upstreamDateField: 'scheduledAt',
    upstreamActionLabel: 'Ouvrir Meet',
    upstreamActionField: 'meetLink',
  },
  proposition: {
    title: 'Proposition',
    eyebrow: 'Étape 08 · Proposition',
    upstreamDateField: 'responseDeadline',
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
  embauche: {
    title: 'Embauche',
    eyebrow: 'Étape 09 · Embauché',
    upstreamDateField: 'arrivalDateInNc',
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
  refuse: {
    title: 'Refus',
    eyebrow: 'Étape ✗ · Refusé',
    upstreamDateField: null,
    upstreamActionLabel: null,
    upstreamActionField: null,
  },
}
