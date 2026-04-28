/**
 * Shared helpers for the per-stage fiche components. The Entretien and
 * Aboro fiches shipped in v5.1 inlined this logic; the v5.2 fiches
 * (Proposition, Embauche, SkillRadarComplete, Refuse) reuse it instead
 * of copy-pasting.
 */

/**
 * Build the patch payload from a (data, draft) pair: only changed
 * fields, with `null` for cleared values so the server's merge-with-
 * null-clears-field semantics apply (see v5.1 PATCH endpoint).
 */
export function buildFichePatch<T extends Record<string, unknown>>(data: T, draft: T): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(draft), ...Object.keys(data)])
  for (const k of allKeys) {
    const a = data[k]
    const b = draft[k]
    if (Object.is(a, b)) continue
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])) continue
    if (b === undefined || b === '' || (Array.isArray(b) && b.length === 0)) {
      patch[k] = null
    } else {
      patch[k] = b
    }
  }
  return patch
}

/**
 * Shallow equality on the keys present in either object. Used to
 * compute `isDirty` for the FicheShell.
 */
export function shallowFicheEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const va = a[k]
    const vb = b[k]
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false
      if (va.some((v, i) => v !== vb[i])) return false
    } else if (va !== vb) {
      return false
    }
  }
  return true
}

/** Format an integer XPF salary with French locale grouping. */
export function formatXpf(n: number | undefined | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR').format(n) + ' XPF'
}
