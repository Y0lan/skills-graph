import fs from 'fs'
import path from 'path'

/**
 * SINAPSE brand tokens — single source of truth for emails (and any future
 * branded server-rendered surface).
 */

// Inline the logo as a data URL. Rationale: emails must NEVER point to
// radar.sinapse.nc (the only allowed radar URL is the candidate's magic
// /evaluate link). We don't host the asset on sinapse.nc/Drupal yet, so
// inlining keeps the email self-contained — no broken images regardless
// of which environment renders or which client receives.
function loadLogoDataUrl(): string {
  const logoPath = process.env.EMAIL_LOGO_PATH
    ?? path.join(process.cwd(), 'public', 'email-logo-sinapse.png')
  try {
    const buffer = fs.readFileSync(logoPath)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch (err) {
    console.warn(`[brand] failed to load email logo at ${logoPath}:`, (err as Error).message)
    return ''
  }
}

const LOGO_DATA_URL = loadLogoDataUrl()

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

  // Inlined data URL — see loadLogoDataUrl() above for the rationale.
  // No external host, no env-specific URL, no broken images. Works in
  // every email client that supports data: URLs in <img src> (which is
  // every modern client + Outlook desktop except Outlook 2007/2010,
  // which we don't target).
  // Override with EMAIL_LOGO_URL if you ever publish the logo on
  // sinapse.nc and want to use that instead.
  logoUrl: process.env.EMAIL_LOGO_URL ?? LOGO_DATA_URL,
  logoWidthPx: 200,

  // Email layout
  emailMaxWidth: 560,
} as const

/**
 * Convenience: hex color string (no leading #) for places that need it
 * (some legacy email clients).
 */
export function hex(c: string): string {
  return c.replace(/^#/, '')
}
