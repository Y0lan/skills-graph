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

/** Sanitize a name part for use in a filename: uppercase, no accents, letters/digits only. */
function filenamePart(s: string): string {
  return stripAccents(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40)
}

/** Sanitize the original filename's stem: keep recognizable chars, strip accents,
 *  replace unsafe chars with `_`, collapse runs, cap length. Falls back to
 *  `DOCUMENT` if the stem collapses to empty. */
function sanitizeStem(stem: string): string {
  const cleaned = stripAccents(stem)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 60)
  return cleaned || 'DOCUMENT'
}

/** Build the canonical display_filename for an uploaded document. Uppercases
 *  the uploader's original stem so the whole filename stays visually
 *  consistent with the candidate NAME_FIRSTNAME and the type badge shown in
 *  the UI. Category is tracked in the DB and shown as a badge — not in the
 *  name.
 *
 *  NOTE: only used for documents uploaded AFTER the initial CV / Lettre /
 *  ABORO trio. Those three keep their original filename — see the branch
 *  in document-service.ts.
 *
 *  Example: ("Pierre LEFÈVRE", "Mon CV.pdf", 2026-04-20) → "MON_CV_LEFEVRE_PIERRE_20260420.pdf" */
export function buildCanonicalFilename(
  candidateName: string,
  originalFilename: string,
  date: Date = new Date(),
): string {
  const { firstname, lastname } = parseName(candidateName)
  const last = filenamePart(lastname) || 'INCONNU'
  const first = filenamePart(firstname) || 'INCONNU'
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const extRaw = extractExtension(originalFilename)
  const ext = extRaw.toLowerCase().slice(0, 8) || 'bin'
  const dotIdx = originalFilename.lastIndexOf('.')
  const rawStem = dotIdx > 0 ? originalFilename.slice(0, dotIdx) : originalFilename
  const stem = sanitizeStem(rawStem).toUpperCase()
  return `${stem}_${last}_${first}_${yyyy}${mm}${dd}.${ext}`
}

/** Extract extension from an original filename ("my cv.PDF" → "pdf"). */
export function extractExtension(filename: string): string {
  const match = filename.match(/\.([^.\\/]+)$/)
  return match ? match[1] : ''
}

/** Uppercase the stem, keep the extension lowercase. Used for CV / Lettre /
 *  ABORO slots so "cv.pdf" → "CV.pdf", matching the uppercase type badge
 *  shown above the filename in the documents panel. Leaves everything else
 *  untouched so special characters (accents, spaces) survive. */
export function uppercaseStem(filename: string): string {
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx <= 0) return filename.toUpperCase()
  const stem = filename.slice(0, dotIdx)
  const ext = filename.slice(dotIdx + 1).toLowerCase()
  return `${stem.toUpperCase()}.${ext}`
}

/** Build a type-prefixed canonical filename for Drupal intake uploads where
 *  the browser-uploaded name is typically useless ("cv.pdf", "lettre.pdf").
 *  Forces "{TYPE}_{LASTNAME}_{FIRSTNAME}_{YYYYMMDD}.{ext}" so downstream
 *  consumers (zip exports, archival) get self-describing filenames.
 *
 *  Example: ("CV", "Pierre LEFÈVRE", "cv.pdf", 2026-04-21) → "CV_LEFEVRE_PIERRE_20260421.pdf" */
export function buildTypePrefixedFilename(
  typePrefix: string,
  candidateName: string,
  originalFilename: string,
  date: Date = new Date(),
): string {
  const { firstname, lastname } = parseName(candidateName)
  const last = filenamePart(lastname) || 'INCONNU'
  const first = filenamePart(firstname) || 'INCONNU'
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const extRaw = extractExtension(originalFilename)
  const ext = extRaw.toLowerCase().slice(0, 8) || 'bin'
  return `${typePrefix.toUpperCase()}_${last}_${first}_${yyyy}${mm}${dd}.${ext}`
}
