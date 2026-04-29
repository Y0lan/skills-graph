/**
 * Inbound email helpers — anti-spoofing + payload shape utilities.
 *
 * Lifted out of recruitment.ts so the post-split `admin.ts` route
 * submodule (which owns the Resend Inbound webhook) can import them
 * without forking. Codex post-plan P1 #4.
 *
 * The interesting helper here is `isInboundFromVerified`. The Svix
 * signature on the webhook proves the payload came from Resend, NOT
 * that the email\'s `From:` is actually authentic. Treating the
 * From: identity as verified requires Resend\'s OWN parsed auth
 * results (`data.dkim` / `data.dmarc` / `data.auth`) — NOT the raw
 * `Authentication-Results` header in `data.headers`, which the
 * sender can forge.
 *
 * Two acceptance signals:
 *
 *   1. **DMARC pass** — DMARC validates From: alignment with DKIM/SPF
 *      from the publisher\'s policy. Strongest single signal.
 *   2. **DKIM pass AND DKIM domain aligned with From: domain** —
 *      a DKIM signature alone only proves the signing domain. Without
 *      alignment to the visible From:, an attacker can DKIM-sign with
 *      their own domain and still spoof `From: candidate@sinapse.nc`.
 */

export interface InboundEmailPayload {
  type?: string
  data?: {
    from?: string | { email?: string; name?: string }
    to?: string[] | string
    subject?: string
    text?: string
    html?: string
    /** Raw inbound headers as the email arrived. NOT trusted for
     *  sender authentication — see `isInboundFromVerified`, which
     *  only uses Resend\'s own parsed dkim/dmarc/auth fields. Kept
     *  around in case future code wants to surface the raw headers
     *  in audit UI. */
    headers?: Record<string, string> | Array<{ name?: string; value?: string }>
    messageId?: string
    inReplyTo?: string
    receivedAt?: string
    attachments?: Array<{ filename?: string; contentType?: string }>
    /** Authentication results from Resend\'s upstream MTA. Trusted
     *  because Resend populates these fields from its own
     *  verification, unlike the raw `headers.Authentication-Results`
     *  which is just whatever the sender included. */
    spf?: { result?: string }
    dkim?: { result?: string; domain?: string }
    dmarc?: { result?: string }
    auth?: { spf?: string; dkim?: string; dmarc?: string }
  }
}

/**
 * Extract the registrable root domain from a host or email address.
 * Uses the last 2 labels as a heuristic — "sinapse.nc" stays whole;
 * "mail.sinapse.nc" reduces to "sinapse.nc". Not perfect for ccTLDs
 * like .co.uk but covers the recruitment use case.
 */
export function rootDomain(host: string | null | undefined): string | null {
  if (!host) return null
  const cleaned = host.trim().toLowerCase().replace(/^.*@/, '')
  if (!cleaned) return null
  const parts = cleaned.split('.').filter(Boolean)
  return parts.slice(-2).join('.')
}

/** Pick a normalized email address from a header that can be either a
 *  raw string ("Name <email@…>") or an object ({ email, name }). */
export function pickEmailAddress(v: unknown): string | null {
  if (typeof v === 'string') {
    const m = v.match(/<([^>]+)>/)
    return (m ? m[1] : v).trim().toLowerCase() || null
  }
  if (v && typeof v === 'object' && 'email' in v && typeof (v as { email: unknown }).email === 'string') {
    return ((v as { email: string }).email).trim().toLowerCase() || null
  }
  return null
}

/**
 * Anti-spoofing gate for inbound emails. See module docstring for
 * the design rationale.
 */
export function isInboundFromVerified(data: NonNullable<InboundEmailPayload['data']>): boolean {
  const fromAddr = pickEmailAddress(data.from)
  const fromDomain = rootDomain(fromAddr)
  if (!fromDomain) return false

  // (1) DMARC pass — strongest signal, From: alignment built-in.
  const dmarcResult = data.dmarc?.result?.toLowerCase()
  if (dmarcResult === 'pass') return true

  const authDmarc = data.auth?.dmarc?.toLowerCase() ?? ''
  if (authDmarc.includes('pass')) return true

  // (2) DKIM pass AND domain alignment with From:.
  const dkimResult = data.dkim?.result?.toLowerCase()
  const dkimDomain = rootDomain(data.dkim?.domain)
  if (dkimResult === 'pass' && dkimDomain && dkimDomain === fromDomain) return true

  return false
}

/**
 * Strip `*` from a string so when it gets embedded in markdown bold,
 * it can\'t accidentally close the leading `**bold** subject` block.
 * Used by the inbound webhook handler when rendering the candidate\'s
 * subject line into the timeline event note.
 */
export function escapeMdBold(s: string): string {
  return s.replace(/\*/g, '∗')
}
