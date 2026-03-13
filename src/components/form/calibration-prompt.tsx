import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'

interface CalibrationPromptProps {
  text: string
  categoryEmoji: string
  categoryLabel: string
  tools?: string[]
}

export default function CalibrationPrompt({
  text,
  categoryEmoji: _categoryEmoji,
  categoryLabel: _categoryLabel,
  tools,
}: CalibrationPromptProps) {
  return (
    <div className="relative flex min-h-[50vh] flex-col items-center justify-center px-4 pb-16">
      {/* Subtle radial gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-primary)/0.04,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,var(--color-primary)/0.08,transparent_70%)]" />

      <div className="relative z-10 flex w-full flex-col items-center gap-8 text-center">
        {/* Prompt text */}
        <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
          {text}
        </p>

        {/* Tool badges */}
        {tools && tools.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {tools.map((tool) => (
              <Badge
                key={tool}
                variant="secondary"
                className="px-3 py-1 text-sm font-medium"
              >
                {tool}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-2 flex flex-col items-center gap-2 text-muted-foreground">
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium tracking-wide uppercase">
          Évaluez-vous
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </span>
      </div>
    </div>
  )
}
