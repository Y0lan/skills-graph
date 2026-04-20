import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { FolderOpen } from 'lucide-react'

export interface DocsChipProps {
  /** How many of the 2 candidate-facing slots (CV / Lettre) are filled.
   *  Âboro is recruiter-collected and tracked separately (not part of this count). */
  docsSlotCount: number
}

export default function DocsChip({ docsSlotCount }: DocsChipProps) {
  const count = Math.min(2, Math.max(0, docsSlotCount))
  const tone = count === 2 ? 'text-emerald-600' : count >= 1 ? 'text-amber-600' : 'text-rose-600'

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help">
        <Badge variant="outline" className={`text-[10px] gap-1 ${tone}`}>
          <FolderOpen className="h-3 w-3" />
          Dossier {count}/2
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {count === 2
          ? 'CV et lettre de motivation téléversés.'
          : count === 0
            ? 'Aucun document candidat (CV, lettre de motivation) téléversé.'
            : `${count}/2 documents candidat téléversés (CV, lettre de motivation).`}
      </TooltipContent>
    </Tooltip>
  )
}
