/**
 * Pure merge logic for extraction runs. Given existing fields, a freshly-
 * extracted set, the locked-field set, and a strategy, return:
 *
 * - the merged result (what to persist)
 * - a per-field diff describing what changed (for the recruiter-curated UI)
 *
 * No I/O, no DB, no LLM — testable in isolation.
 *
 * See docs/decisions/2026-04-20-extraction-architecture.md.
 */

export type MergeStrategy = 'additive' | 'recruiter-curated' | 'replace'

export interface ExtractedField<T = unknown> {
  value: T | null
  confidence: number
  source_span?: [number, number]
  source_paragraph?: number
}

export type ExtractedFields = Record<string, ExtractedField>

export type FieldChange =
  | { kind: 'unchanged' }
  | { kind: 'added'; newValue: unknown; confidence: number }
  | { kind: 'updated'; oldValue: unknown; newValue: unknown; confidence: number }
  | { kind: 'locked-skipped'; lockedValue: unknown; proposedValue: unknown; proposedConfidence: number }

export interface MergeResult {
  merged: ExtractedFields
  diff: Record<string, FieldChange>
}

const isMeaningfulValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

export function mergeExtractions(
  existing: ExtractedFields,
  incoming: ExtractedFields,
  lockedFieldNames: Set<string>,
  strategy: MergeStrategy,
): MergeResult {
  const merged: ExtractedFields = { ...existing }
  const diff: Record<string, FieldChange> = {}

  const allFieldNames = new Set([...Object.keys(existing), ...Object.keys(incoming)])

  for (const name of allFieldNames) {
    const oldField = existing[name]
    const newField = incoming[name]

    // Field only existed before — untouched.
    if (!newField || !isMeaningfulValue(newField.value)) {
      diff[name] = { kind: 'unchanged' }
      continue
    }

    // Field is locked — never overwritten regardless of strategy.
    if (lockedFieldNames.has(name)) {
      if (oldField && isMeaningfulValue(oldField.value) && oldField.value !== newField.value) {
        diff[name] = {
          kind: 'locked-skipped',
          lockedValue: oldField.value,
          proposedValue: newField.value,
          proposedConfidence: newField.confidence,
        }
      } else {
        diff[name] = { kind: 'unchanged' }
      }
      continue
    }

    // Field didn't exist before — always add.
    if (!oldField || !isMeaningfulValue(oldField.value)) {
      merged[name] = newField
      diff[name] = { kind: 'added', newValue: newField.value, confidence: newField.confidence }
      continue
    }

    // Both exist + non-locked — strategy decides.
    if (strategy === 'additive') {
      // Never overwrite an existing non-empty field.
      diff[name] = { kind: 'unchanged' }
      continue
    }
    if (strategy === 'replace') {
      merged[name] = newField
      diff[name] = oldField.value === newField.value
        ? { kind: 'unchanged' }
        : { kind: 'updated', oldValue: oldField.value, newValue: newField.value, confidence: newField.confidence }
      continue
    }
    // recruiter-curated — surface the diff but DON'T apply yet (recruiter
    // accepts/rejects per field via UI; the apply step is a separate call).
    if (oldField.value === newField.value) {
      diff[name] = { kind: 'unchanged' }
    } else {
      diff[name] = { kind: 'updated', oldValue: oldField.value, newValue: newField.value, confidence: newField.confidence }
    }
  }

  return { merged, diff }
}

/** Apply a recruiter's per-field accept decisions to the existing fields. */
export function applyRecruiterDecisions(
  existing: ExtractedFields,
  incoming: ExtractedFields,
  acceptedFieldNames: Set<string>,
  lockedFieldNames: Set<string>,
): ExtractedFields {
  const out: ExtractedFields = { ...existing }
  for (const name of acceptedFieldNames) {
    if (lockedFieldNames.has(name)) continue
    if (incoming[name] && isMeaningfulValue(incoming[name].value)) {
      out[name] = incoming[name]
    }
  }
  return out
}
