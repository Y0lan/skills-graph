/**
 * SINAPSE brand tokens — single source of truth for emails (and any future
 * branded server-rendered surface). Keep this file dependency-free so it
 * can be imported from React Email components, plain strings, and tests
 * without dragging in heavy modules.
 */

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

  // Logo for emails. MUST be a publicly-reachable absolute URL — email
  // clients can't fetch from localhost or behind auth. Override via
  // EMAIL_LOGO_URL env var if hosted elsewhere (CDN, marketing site).
  logoUrl: process.env.EMAIL_LOGO_URL ?? 'https://radar.sinapse.nc/logo-sinapse-crop.png',
  logoWidthPx: 140,

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
