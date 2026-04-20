import fs from 'fs'
import path from 'path'

/**
 * SINAPSE brand tokens — single source of truth for emails (and any future
 * branded server-rendered surface).
 */

// Email logo: attached as inline file via Resend, referenced by cid in HTML.
//
// History of what failed before this:
//   1. External URL (radar.sinapse.nc/email-logo-...): forbidden — emails must
//      never point to radar.sinapse.nc (only the magic /evaluate link does).
//   2. data: URL in <img src>: Gmail (and Yahoo, iCloud) strip data URLs from
//      <img src> for spam/security. Logo rendered as a broken-image icon.
// Current approach: Resend attachment with contentId, referenced as
// `cid:sinapse-logo`. Universal support across modern email clients.
//
// EMAIL_LOGO_URL env var still wins if set — useful once we host the logo on
// sinapse.nc Drupal (then this file does not need to change).
export const LOGO_CID = 'sinapse-logo'

function loadLogoBuffer(): Buffer | null {
  const logoPath = process.env.EMAIL_LOGO_PATH
    ?? path.join(process.cwd(), 'public', 'email-logo-sinapse.png')
  try {
    return fs.readFileSync(logoPath)
  } catch (err) {
    console.warn(`[brand] failed to load email logo at ${logoPath}:`, (err as Error).message)
    return null
  }
}

const LOGO_BUFFER = loadLogoBuffer()
const LOGO_DATA_URL = LOGO_BUFFER
  ? `data:image/png;base64,${LOGO_BUFFER.toString('base64')}`
  : ''

/** Buffer for attachment-based embedding (Resend `attachments[].content`). */
export const BRAND_LOGO_BUFFER = LOGO_BUFFER

/** data: URL for browser-side previews (e.g. /dev/emails). */
export const BRAND_LOGO_DATA_URL = LOGO_DATA_URL

export const BRAND = {
  // Colors
  primary: '#008272',
  primaryHover: '#006b5d',
  text: '#1a1a1a',
  muted: '#666666',
  subtle: '#999999',
  background: '#f4f4f5',
  surface: '#ffffff',

  // Typography
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  fontSize: '15px',
  lineHeight: '1.7',

  // Identity
  name: 'GIE SINAPSE',
  tagline: 'Du code et du sens · Transformation numérique de la protection sociale de Nouvelle Calédonie',
  team: 'Team',
  address: 'BP L5 98849 NOUMEA CEDEX, Nouvelle-Calédonie',

  // URLs
  website: 'https://www.sinapse.nc',
  websiteLabel: 'www.sinapse.nc',
  linkedin: 'https://www.linkedin.com/company/sinapse-nc/',
  linkedinLabel: 'LinkedIn',

  // Default to cid: reference. Resend attaches the file with the matching
  // contentId on every send (see sendBrandedEmail in lib/email.ts).
  // Override with EMAIL_LOGO_URL once the logo is hosted on sinapse.nc.
  logoUrl: process.env.EMAIL_LOGO_URL ?? `cid:${LOGO_CID}`,
  logoWidthPx: 200,

  // Email layout
  emailMaxWidth: 560,
} as const

export function hex(c: string): string {
  return c.replace(/^#/, '')
}

/**
 * Swap `cid:sinapse-logo` references for the inline data URL so the markup
 * can render in a browser context (preview windows, /dev/emails iframe).
 * Real email sends keep the cid; the matching attachment is added by
 * email.ts:maybeLogoAttachment.
 */
export function previewizeEmailHtml(html: string): string {
  if (!LOGO_DATA_URL) return html
  return html.split(`cid:${LOGO_CID}`).join(LOGO_DATA_URL)
}
