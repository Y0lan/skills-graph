/**
 * Canonical candidate name + document filename formatting.
 *
 * Conventions:
 *  - Display name: "Firstname LASTNAME" (e.g. "Pierre LEFÈVRE"), accents preserved.
 *  - Filename: "{CATEGORY}_{LASTNAME}_{FIRSTNAME}_{YYYYMMDD}.{ext}" with
 *    both name parts uppercase, accents stripped, non-ASCII sanitized.
 */

/** Strip Unicode diacritics — "Lefèvre" → "Lefevre". */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Split a candidate name into firstname + lastname.
 *
 * Heuristics (in order):
 *  1. If the string contains a token that is ALL-UPPERCASE (ignoring punctuation),
 *     that token is the lastname — remainder is the firstname. Catches the
 *     common "Pierre LEFÈVRE" + "LEFÈVRE Pierre" formats.
 *  2. Otherwise, assume "Firstname [Middle] Lastname" — last token is lastname,
 *     everything before is firstname.
 */
export function parseName(fullName: string): { firstname: string; lastname: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { firstname: '', lastname: '' }

  const tokens = trimmed.split(' ')
  if (tokens.length === 1) {
    // Single-token name — treat as lastname (no firstname known).
    return { firstname: '', lastname: tokens[0] }
  }

  // Heuristic 1: any token that is ALL-UPPERCASE (at least 2 letters) is the lastname.
  const upperIdx = tokens.findIndex(t => t.length >= 2 && t === t.toUpperCase() && /\p{L}/u.test(t))
  if (upperIdx !== -1) {
    const lastname = tokens[upperIdx]
    const firstname = tokens.filter((_, i) => i !== upperIdx).join(' ')
    return { firstname, lastname }
  }

  // Heuristic 2: last token = lastname.
  const lastname = tokens[tokens.length - 1]
  const firstname = tokens.slice(0, -1).join(' ')
  return { firstname, lastname }
}

/** "pierre lefèvre" / "LEFEVRE Pierre" / "Pierre LEFÈVRE" → "Pierre LEFÈVRE". */
export function formatDisplayName(fullName: string): string {
  const { firstname, lastname } = parseName(fullName)
  if (!firstname && !lastname) return fullName.trim()
  if (!firstname) return lastname.toUpperCase()
  const cap = firstname
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
  return `${cap} ${lastname.toUpperCase()}`
}

/** Document type (db enum value) → filename category prefix.
 *  Unknown types fall back to "DOCUMENT" so nothing silently drops. */
const CATEGORY_LABELS: Record<string, string> = {
  cv: 'CV',
  lettre: 'LETTRE',
  aboro: 'ABORO',
  entretien: 'ENTRETIEN',
  proposition: 'PROPOSITION',
  administratif: 'ADMINISTRATIF',
  other: 'DOCUMENT',
}

/** Sanitize a name part for use in a filename: uppercase, no accents, letters/digits only. */
function filenamePart(s: string): string {
  return stripAccents(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40)
}

/** Build the canonical display_filename for an uploaded document.
 *  Example: ("cv", "Pierre LEFÈVRE", "pdf", 2026-04-20) → "CV_LEFEVRE_PIERRE_20260420.pdf" */
export function buildCanonicalFilename(
  docType: string,
  candidateName: string,
  extension: string,
  date: Date = new Date(),
): string {
  const category = CATEGORY_LABELS[docType] ?? 'DOCUMENT'
  const { firstname, lastname } = parseName(candidateName)
  const last = filenamePart(lastname) || 'INCONNU'
  const first = filenamePart(firstname) || 'INCONNU'
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const ext = extension.replace(/^\.*/, '').toLowerCase().slice(0, 8) || 'bin'
  return `${category}_${last}_${first}_${yyyy}${mm}${dd}.${ext}`
}

/** Extract extension from an original filename ("my cv.PDF" → "pdf"). */
export function extractExtension(filename: string): string {
  const match = filename.match(/\.([^.\\/]+)$/)
  return match ? match[1] : ''
}
