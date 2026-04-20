import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { FolderOpen } from 'lucide-react'

export interface DocsChipProps {
  /** How many of the 3 required slots (CV / Lettre / ABORO) are filled. */
  docsSlotCount: number
}

export default function DocsChip({ docsSlotCount }: DocsChipProps) {
  const count = Math.min(3, Math.max(0, docsSlotCount))
  const tone = count === 3 ? 'text-emerald-600' : count >= 1 ? 'text-amber-600' : 'text-rose-600'

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help">
        <Badge variant="outline" className={`text-[10px] gap-1 ${tone}`}>
          <FolderOpen className="h-3 w-3" />
          Dossier {count}/3
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {count === 3
          ? 'CV, lettre et Âboro téléversés.'
          : count === 0
            ? 'Aucun document requis (CV, lettre, Âboro) téléversé.'
            : `${count}/3 documents requis téléversés (CV, lettre, Âboro).`}
      </TooltipContent>
    </Tooltip>
  )
}
