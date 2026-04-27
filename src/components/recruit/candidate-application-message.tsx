import { Quote } from 'lucide-react'

/**
 * Read-only callout that surfaces the message the candidate typed in
 * the public intake form ("Message complémentaire — Parlez-nous de
 * votre motivation, de vos projets…").
 *
 * The message lives on `candidates.notes` because it's candidate-level
 * (one person, all candidatures share it). Intake-service catenates
 * messages across postes with a `--- {posteTitre} ---` marker so a
 * candidate applying twice keeps both messages on the same row.
 *
 * This component lives ABOVE the recruiter's "Notes d'entretien" so:
 *   - the candidate's voice is visible without buried clicks
 *   - it never contaminates the recruiter's structured evaluation notes
 *     (the previous fallback `notesDirecteur ?? candidate.notes` mixed
 *     the two)
 *
 * Render rules:
 *   - empty / null notes → render nothing (component returns null)
 *   - single-poste message → render as one quoted block
 *   - multi-poste catenation → split on the `--- {posteTitre} ---`
 *     markers and render one block per poste
 */
export interface CandidateApplicationMessageProps {
  /** Raw `candidates.notes` field — may be null, single message, or
   *  catenated multi-poste blob. */
  notes: string | null | undefined
  /** Optional title to filter to ONE poste's message when rendered
   *  inside a per-candidature workspace. When the catenation has only
   *  the matching block, hide the others to keep the surface focused. */
  filterPosteTitre?: string
}

interface MessageBlock {
  posteTitre: string | null
  body: string
}

const MARKER = /^---\s+(.+?)\s+---$/m

function parseBlocks(raw: string): MessageBlock[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  // Fast path: no marker → single message, no poste attribution.
  if (!MARKER.test(trimmed)) {
    return [{ posteTitre: null, body: trimmed }]
  }
  // The intake-service catenates with "\n\n--- {posteTitre} ---\n"
  // so we split by lines, walk, and accumulate.
  const lines = trimmed.split(/\r?\n/)
  const blocks: MessageBlock[] = []
  let currentPoste: string | null = null
  let currentBody: string[] = []
  const flush = () => {
    const body = currentBody.join('\n').trim()
    if (body) blocks.push({ posteTitre: currentPoste, body })
    currentBody = []
  }
  for (const line of lines) {
    const m = line.match(/^---\s+(.+?)\s+---$/)
    if (m) {
      flush()
      currentPoste = m[1].trim()
      continue
    }
    currentBody.push(line)
  }
  flush()
  return blocks
}

export default function CandidateApplicationMessage({ notes, filterPosteTitre }: CandidateApplicationMessageProps) {
  if (!notes || !notes.trim()) return null
  const blocks = parseBlocks(notes)
  const visible = filterPosteTitre
    ? blocks.filter(b => b.posteTitre === null || b.posteTitre === filterPosteTitre)
    : blocks
  if (visible.length === 0) return null

  return (
    <section
      aria-label="Message du candidat à l'inscription"
      className="rounded-md border border-border/70 bg-muted/20 p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <Quote className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Message du candidat
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          · transmis via le formulaire de candidature
        </p>
      </div>
      <div className="space-y-3">
        {visible.map((block, i) => (
          <div key={i}>
            {block.posteTitre && (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mb-1">
                Pour le poste : {block.posteTitre}
              </p>
            )}
            <blockquote className="border-l-2 border-border pl-3 text-sm italic text-foreground/90 whitespace-pre-line">
              {block.body}
            </blockquote>
          </div>
        ))}
      </div>
    </section>
  )
}
