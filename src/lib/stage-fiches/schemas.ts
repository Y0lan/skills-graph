import { z } from 'zod'
import { FICHE_DATE_REGEX, FICHE_DATETIME_REGEX } from './datetime'
import type { Statut } from '../constants'

/**
 * Per-stage Zod schemas. Every field is `.optional()` so a candidate can
 * advance without filling the fiche (soft-required UX, see plan D1 + Y3
 * for the reminder-activation refinement). The PATCH endpoint:
 *
 *   1. Validates the incoming partial body with `schema.partial()`.
 *   2. Rejects an empty body (R3 footgun).
 *   3. Merges with the existing `data_json`; `null` in the payload clears
 *      the field (explicit clear-via-null).
 *   4. Re-validates the merged result against the FULL schema.
 *
 * Caps on string lengths are also enforced at the DB layer via the Zod
 * gate. Markdown summaries cap at 10k chars to bound row size.
 *
 * Currency: salaries are XPF (CFP franc). No decimals — XPF has no
 * subdivision. Annual figures only.
 */

const ficheDateTime = z.string().regex(FICHE_DATETIME_REGEX, {
  message: 'Format attendu : AAAA-MM-JJTHH:MM',
})
const ficheDate = z.string().regex(FICHE_DATE_REGEX, {
  message: 'Format attendu : AAAA-MM-JJ',
})
const url = z.string().url({ message: 'URL invalide' }).max(500)
const shortText = (max: number) => z.string().trim().min(1).max(max)
const markdown = (max: number) => z.string().trim().max(max)

// ─── Per-stage shapes ───────────────────────────────────────────────────

export const postuleFicheSchema = z.object({
  firstImpression: shortText(280).optional(),
  source: z.enum(['linkedin', 'sinapse_nc', 'email', 'parrainage', 'autre']).optional(),
  referredBy: shortText(120).optional(),
})

export const preselectionneFicheSchema = z.object({
  reason: shortText(280).optional(),
  priority: z.enum(['haute', 'moyenne', 'basse']).optional(),
})

export const skillRadarEnvoyeFicheSchema = z.object({
  sentAt: ficheDateTime.optional(),       // auto-derived in v5.2 from email_sent
  lastNudgeAt: ficheDateTime.optional(),  // last manual relance
})

export const skillRadarCompleteFicheSchema = z.object({
  strengthsSummary: markdown(2000).optional(),
  redFlags: markdown(2000).optional(),
  goNoGo: z.enum(['go', 'caution', 'no_go']).optional(),
})

const interviewMode = z.enum(['visio', 'presentiel', 'telephone'])

export const entretienFicheSchema = z.object({
  scheduledAt: ficheDateTime.optional(),
  mode: interviewMode.optional(),
  meetLink: url.optional(),
  location: shortText(200).optional(),
  durationMin: z.number().int().min(15).max(240).optional(),
  interviewers: z.array(shortText(80)).max(8).optional(),
  conclusion: z.enum(['go', 'caution', 'no_go']).optional(),
  summary: markdown(10_000).optional(),
})

export const aboroFicheSchema = z.object({
  scheduledAt: ficheDateTime.optional(),
  mode: z.enum(['visio', 'presentiel']).optional(),
  meetLink: url.optional(),
  location: shortText(200).optional(),
  resultPdfUrl: url.optional(),
  resultSummary: markdown(2000).optional(),
  recommendation: z.enum(['compatible', 'reserve', 'non_compatible']).optional(),
})

export const propositionFicheSchema = z.object({
  salaryProposedAnnualXpf: z.number().int().min(0).max(500_000_000).optional(),
  salaryStandardAnnualXpf: z.number().int().min(0).max(500_000_000).optional(),
  bonusVariableAnnualXpf: z.number().int().min(0).max(100_000_000).optional(),
  benefitsMd: markdown(4000).optional(),
  conditionsMd: markdown(4000).optional(),
  responseDeadline: ficheDate.optional(),
})

export const embaucheFicheSchema = z.object({
  startDate: ficheDate.optional(),
  originCity: shortText(120).optional(),
  requiresRelocation: z.boolean().optional(),
  arrivalDateInNc: ficheDate.optional(),
  residencyStatus: z.enum(['citoyen_nc', 'metropole', 'etranger_visa', 'autre']).optional(),
  onboardingNotesMd: markdown(4000).optional(),
})

export const refuseFicheSchema = z.object({
  reason: z.enum(['competences', 'budget', 'timing', 'fit', 'concurrence', 'desistement_candidat', 'autre']).optional(),
  reasonDetails: markdown(2000).optional(),
  feedbackSent: z.boolean().optional(),
})

// ─── Registry ───────────────────────────────────────────────────────────

/**
 * The fiche schema for a given stage. `entretien_2` shares the entretien
 * shape — both receive 5-7 typed fields, validated with the same rules.
 */
export const stageFicheSchemas = {
  postule: postuleFicheSchema,
  preselectionne: preselectionneFicheSchema,
  skill_radar_envoye: skillRadarEnvoyeFicheSchema,
  skill_radar_complete: skillRadarCompleteFicheSchema,
  entretien_1: entretienFicheSchema,
  aboro: aboroFicheSchema,
  entretien_2: entretienFicheSchema,
  proposition: propositionFicheSchema,
  embauche: embaucheFicheSchema,
  refuse: refuseFicheSchema,
} as const satisfies Record<Statut, z.ZodTypeAny>

export type StageFicheSchemaFor<S extends Statut> = (typeof stageFicheSchemas)[S]
export type StageFicheData<S extends Statut> = z.infer<StageFicheSchemaFor<S>>
export type AnyStageFicheData = {
  [S in Statut]: StageFicheData<S>
}[Statut]

export function getStageFicheSchema(stage: string): z.ZodTypeAny | null {
  if (!(stage in stageFicheSchemas)) return null
  return stageFicheSchemas[stage as Statut]
}

/**
 * Validate an incoming PATCH body for the given stage.
 *  - rejects empty objects (R3 footgun)
 *  - validates with `schema.partial()` so missing fields are OK
 *  - returns parsed (cleaned) partial data on success
 */
export function validatePartialFichePatch(
  stage: Statut,
  body: unknown,
):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; details?: z.ZodError['issues'] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Corps invalide' }
  }
  const obj = body as Record<string, unknown>
  if (Object.keys(obj).length === 0) {
    return { ok: false, error: 'Au moins un champ requis' }
  }
  // Allow `null` for explicit clear-via-null. The schema would reject null
  // on .optional() fields (which are `T | undefined`), so we strip the
  // null entries before parsing and let the merge step apply them.
  const nullsKept: Record<string, unknown> = {}
  const toParse: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) nullsKept[k] = null
    else toParse[k] = v
  }
  const schema = stageFicheSchemas[stage]
  const partial = (schema as z.ZodObject<z.ZodRawShape>).partial()
  const parsed = partial.safeParse(toParse)
  if (!parsed.success) {
    return { ok: false, error: 'Validation', details: parsed.error.issues }
  }
  return { ok: true, data: { ...parsed.data, ...nullsKept } }
}

/**
 * Re-validate a fiche after merge. The merged shape MUST satisfy the full
 * (non-partial) schema so we don't store invalid nonsense.
 */
export function validateMergedFiche(
  stage: Statut,
  merged: Record<string, unknown>,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string; details?: z.ZodError['issues'] } {
  const schema = stageFicheSchemas[stage]
  const parsed = schema.safeParse(merged)
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides après fusion', details: parsed.error.issues }
  }
  return { ok: true, data: parsed.data as Record<string, unknown> }
}
