import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface FitReportProps {
  report: string
}

const SECTION_ICONS: Record<string, string> = {
  'Compétences comblées': '✅',
  'Compétences toujours manquantes': '⚠️',
  'Rôles/profils manquants': '🔍',
  'Complémentarité': '🤝',
  'Verdict': '📊',
}

export default function FitReport({ report }: FitReportProps) {
  const sections = parseSections(report)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (title: string) => {
    setCollapsed(prev => ({ ...prev, [title]: !prev[title] }))
  }

  if (sections.length === 0) {
    return <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{report}</div>
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">
        Évaluation initiale basée sur l'auto-évaluation du candidat — à valider lors de l'entretien.
      </p>
      {sections.map((section) => {
        const isCollapsed = collapsed[section.title]
        const icon = Object.entries(SECTION_ICONS).find(([key]) => section.title.includes(key))?.[1] ?? '📋'
        const isVerdict = section.title.toLowerCase().includes('verdict')

        return (
          <div key={section.title} className={`rounded-lg border ${isVerdict ? 'border-primary/30 bg-primary/5' : ''}`}>
            <button
              onClick={() => toggle(section.title)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <span>{icon}</span>
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className={isVerdict ? 'text-primary' : ''}>{section.title}</span>
            </button>
            {!isCollapsed && (
              <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {section.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function parseSections(report: string): { title: string; content: string }[] {
  const lines = report.split('\n')
  const sections: { title: string; content: string }[] = []
  let currentTitle = ''
  let currentContent: string[] = []

  for (const line of lines) {
    const headerMatch = line.match(/^\d+\.\s*\*\*(.+?)\*\*/)
    if (headerMatch) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
      }
      currentTitle = headerMatch[1].replace(/\s*[—–-]\s*$/, '').trim()
      const rest = line.replace(/^\d+\.\s*\*\*.+?\*\*\s*[—–-]?\s*/, '')
      currentContent = rest ? [rest] : []
    } else if (currentTitle) {
      currentContent.push(line)
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
  }

  return sections
}
