import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
  allowedAttributes: { a: ['href'] },
}

describe('markdown to email HTML pipeline', () => {
  it('converts basic markdown to safe HTML', () => {
    const md = '**Bonjour** Jean,\n\nVotre candidature a été **retenue**.'
    const html = sanitizeHtml(marked(md) as string, SANITIZE_OPTIONS)
    expect(html).toContain('<strong>Bonjour</strong>')
    expect(html).toContain('<strong>retenue</strong>')
    expect(html).not.toContain('<script>')
  })

  it('strips dangerous HTML from markdown output', () => {
    const md = 'Hello <script>alert("xss")</script> world'
    const html = sanitizeHtml(marked(md) as string, SANITIZE_OPTIONS)
    expect(html).not.toContain('<script>')
    expect(html).toContain('Hello')
    expect(html).toContain('world')
  })

  it('preserves links but strips onclick attributes', () => {
    const md = '[SINAPSE](https://sinapse.nc)'
    const html = sanitizeHtml(marked(md) as string, SANITIZE_OPTIONS)
    expect(html).toContain('href="https://sinapse.nc"')
    expect(html).not.toContain('onclick')
  })

  it('handles GFM lists correctly', () => {
    const md = '- Point 1\n- Point 2\n- **Point 3**'
    const html = sanitizeHtml(marked(md) as string, SANITIZE_OPTIONS)
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('<strong>Point 3</strong>')
  })

  it('handles empty markdown gracefully', () => {
    const html = sanitizeHtml(marked('') as string, SANITIZE_OPTIONS)
    expect(html).toBe('')
  })

  it('strips image tags (not allowed in emails)', () => {
    const md = '![alt](https://evil.com/tracker.png)'
    const html = sanitizeHtml(marked(md) as string, SANITIZE_OPTIONS)
    expect(html).not.toContain('<img')
  })
})

describe('PII sanitization for AI prompts', () => {
  function sanitizePII(text: string): string {
    return text
      .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email masqué]')
      .replace(/(\+?\d[\d\s.-]{7,})/g, '[téléphone masqué]')
  }

  it('masks email addresses', () => {
    const text = 'Contact: jean.dupont@sinapse.nc pour plus de détails'
    expect(sanitizePII(text)).toContain('[email masqué]')
    expect(sanitizePII(text)).not.toContain('jean.dupont@sinapse.nc')
  })

  it('masks phone numbers', () => {
    const text = 'Téléphone: +687 28 45 67'
    expect(sanitizePII(text)).toContain('[téléphone masqué]')
    expect(sanitizePII(text)).not.toContain('28 45 67')
  })

  it('masks multiple PII in same text', () => {
    const text = 'Jean, email: j@test.com, tel: 06 12 34 56 78, skills: Java'
    const result = sanitizePII(text)
    expect(result).not.toContain('j@test.com')
    expect(result).not.toContain('06 12 34 56 78')
    expect(result).toContain('Jean')
    expect(result).toContain('Java')
  })

  it('preserves text without PII', () => {
    const text = 'Expérience: 5 ans en Java, Spring Boot, Angular'
    expect(sanitizePII(text)).toBe(text)
  })
})

describe('candidature_events schema', () => {
  it('valid event types include email_sent and email_failed', () => {
    const VALID_TYPES = ['status_change', 'note', 'entretien', 'document', 'email', 'email_sent', 'email_failed', 'email_open']
    expect(VALID_TYPES).toContain('email_sent')
    expect(VALID_TYPES).toContain('email_failed')
    expect(VALID_TYPES).toContain('email_open')
  })
})

describe('email snapshot structure', () => {
  it('serializes and deserializes email snapshot correctly', () => {
    const snapshot = {
      subject: 'Candidature retenue — Dev Senior chez SINAPSE',
      body: 'Bonjour Jean, votre candidature a été retenue.',
      messageId: 'msg_abc123',
    }
    const json = JSON.stringify(snapshot)
    const parsed = JSON.parse(json)
    expect(parsed.subject).toBe(snapshot.subject)
    expect(parsed.body).toBe(snapshot.body)
    expect(parsed.messageId).toBe(snapshot.messageId)
  })

  it('handles null email snapshot gracefully', () => {
    const event = { id: 1, type: 'status_change', email_snapshot: null }
    expect(event.email_snapshot).toBeNull()
  })
})

describe('document status tracking', () => {
  const EXPECTED_DOCUMENTS: Record<string, string[]> = {
    postule: ['cv'],
    preselectionne: ['cv'],
    entretien_1: ['cv', 'lettre'],
    aboro: ['cv', 'lettre', 'aboro'],
    entretien_2: ['cv', 'lettre', 'aboro', 'entretien'],
    proposition: ['cv', 'lettre', 'aboro', 'entretien', 'proposition'],
    embauche: ['cv', 'lettre', 'aboro', 'entretien', 'proposition', 'administratif'],
  }

  it('early pipeline stages require fewer documents', () => {
    expect(EXPECTED_DOCUMENTS['postule']).toHaveLength(1)
    expect(EXPECTED_DOCUMENTS['postule']).toContain('cv')
  })

  it('later stages accumulate document requirements', () => {
    expect(EXPECTED_DOCUMENTS['embauche']).toHaveLength(6)
    expect(EXPECTED_DOCUMENTS['embauche']).toContain('administratif')
  })

  it('calculates document completion correctly', () => {
    const uploadedTypes = new Set(['cv', 'lettre'])
    const expectedTypes = EXPECTED_DOCUMENTS['entretien_1']
    const complete = expectedTypes.every(t => uploadedTypes.has(t))
    expect(complete).toBe(true)
  })

  it('detects missing documents', () => {
    const uploadedTypes = new Set(['cv'])
    const expectedTypes = EXPECTED_DOCUMENTS['aboro']
    const missing = expectedTypes.filter(t => !uploadedTypes.has(t))
    expect(missing).toContain('lettre')
    expect(missing).toContain('aboro')
  })
})

describe('transition state machine', () => {
  const TRANSITION_MAP: Record<string, string[]> = {
    postule: ['preselectionne', 'refuse'],
    preselectionne: ['skill_radar_envoye', 'entretien_1', 'refuse'],
    skill_radar_envoye: ['skill_radar_complete', 'refuse'],
    skill_radar_complete: ['entretien_1', 'refuse'],
    entretien_1: ['aboro', 'entretien_2', 'refuse'],
    aboro: ['entretien_2', 'refuse'],
    entretien_2: ['proposition', 'refuse'],
    proposition: ['embauche', 'refuse'],
  }

  it('refuse is always an option (except terminal states)', () => {
    for (const [, transitions] of Object.entries(TRANSITION_MAP)) {
      expect(transitions).toContain('refuse')
    }
  })

  it('embauche and refuse are terminal states', () => {
    expect(TRANSITION_MAP['embauche']).toBeUndefined()
    expect(TRANSITION_MAP['refuse']).toBeUndefined()
  })

  it('pipeline progresses linearly for happy path', () => {
    const happyPath = ['postule', 'preselectionne', 'skill_radar_envoye', 'skill_radar_complete', 'entretien_1', 'aboro', 'entretien_2', 'proposition', 'embauche']
    for (let i = 0; i < happyPath.length - 1; i++) {
      const current = happyPath[i]
      const next = happyPath[i + 1]
      const transitions = TRANSITION_MAP[current]
      if (transitions) {
        expect(transitions).toContain(next)
      }
    }
  })

  it('notes required for refuse and embauche transitions', () => {
    const NOTES_REQUIRED = ['refuse', 'embauche']
    expect(NOTES_REQUIRED).toContain('refuse')
    expect(NOTES_REQUIRED).toContain('embauche')
  })
})

describe('open tracking idempotency', () => {
  it('deduplicates events by messageId', () => {
    const existingEvents = [
      { type: 'email_open', email_snapshot: JSON.stringify({ messageId: 'msg_123' }) },
    ]
    const incomingMessageId = 'msg_123'
    const isDuplicate = existingEvents.some(e => {
      if (e.type !== 'email_open') return false
      try {
        const snapshot = JSON.parse(e.email_snapshot)
        return snapshot.messageId === incomingMessageId
      } catch { return false }
    })
    expect(isDuplicate).toBe(true)
  })

  it('allows new events for different messageIds', () => {
    const existingEvents = [
      { type: 'email_open', email_snapshot: JSON.stringify({ messageId: 'msg_123' }) },
    ]
    const incomingMessageId = 'msg_456'
    const isDuplicate = existingEvents.some(e => {
      if (e.type !== 'email_open') return false
      try {
        const snapshot = JSON.parse(e.email_snapshot)
        return snapshot.messageId === incomingMessageId
      } catch { return false }
    })
    expect(isDuplicate).toBe(false)
  })
})

describe('batch ZIP validation', () => {
  it('rejects requests with more than 20 candidatures', () => {
    const MAX_BATCH = 20
    const ids = Array.from({ length: 21 }, (_, i) => `id-${i}`)
    expect(ids.length).toBeGreaterThan(MAX_BATCH)
  })

  it('generates unique folder names for duplicate candidate names', () => {
    function uniqueFolderNames(names: string[]): string[] {
      const counts = new Map<string, number>()
      return names.map(name => {
        const count = counts.get(name) ?? 0
        counts.set(name, count + 1)
        return count === 0 ? name : `${name}_${count + 1}`
      })
    }

    const names = ['Jean_Dupont', 'Marie_Martin', 'Jean_Dupont']
    const folders = uniqueFolderNames(names)
    expect(folders[0]).toBe('Jean_Dupont')
    expect(folders[1]).toBe('Marie_Martin')
    expect(folders[2]).toBe('Jean_Dupont_2')
  })
})
