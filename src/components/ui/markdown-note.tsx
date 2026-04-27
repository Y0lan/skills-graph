import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * Render a markdown note with the recruiter-facing visual hierarchy
 * (different sizes for `# H1`, `## H2`, `### H3`).
 *
 * v5.1.x A.8 (codex Y1+Y2): the prior implementation lived inline at
 * `candidate-history-by-stage.tsx:243` and `candidate-status-bar.tsx:243`
 * with `[&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs` overrides — flat
 * scale, headings rendered indistinguishable. We deliberately don't
 * install `@tailwindcss/typography` (codex Y2: not drop-in for Tailwind
 * 4 with the vite plugin model, and the `prose` class would also
 * cascade into emails / legal pages where the recruiter-note tuning
 * doesn't fit).
 *
 * Two variants:
 *   - `default`: used in the timeline accordion blocks (history-by-stage),
 *     where the recruiter is reading carefully. h1=text-base, h2=text-sm,
 *     h3=text-xs uppercase.
 *   - `compact`: used in tight vertical-rhythm contexts (candidate
 *     status-bar). h1=text-sm to avoid overflowing the 1-line strip.
 *     Same level of differentiation, smaller absolute scale.
 *
 * Do NOT use this in email-body or legal-page markdown rendering — they
 * have different visual needs and should keep their own className.
 */
export interface MarkdownNoteProps {
  content: string
  variant?: 'default' | 'compact'
  /** Extra classes (e.g. line-clamp). Composed onto the variant base. */
  className?: string
}

const VARIANT_CLASSES = {
  default:
    'prose prose-sm dark:prose-invert max-w-none text-xs ' +
    '[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 ' +
    '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1 ' +
    '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 ' +
    '[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide',
  compact:
    'prose prose-sm dark:prose-invert max-w-none text-xs ' +
    '[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 ' +
    '[&_h1]:text-sm [&_h1]:font-semibold ' +
    '[&_h2]:text-xs [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide ' +
    '[&_h3]:text-[0.7rem] [&_h3]:font-medium',
} as const

export function MarkdownNote({ content, variant = 'default', className }: MarkdownNoteProps) {
  return (
    <div className={cn(VARIANT_CLASSES[variant], className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
