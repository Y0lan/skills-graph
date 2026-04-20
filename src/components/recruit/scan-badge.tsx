import { useState } from 'react'
import { ShieldCheck, ShieldAlert, Loader } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import ScanDetailDialog from './scan-detail-dialog'
import type { CandidatureDocument } from '@/hooks/use-candidate-data'

/**
 * Antivirus-scan status indicator for a single document.
 *  - pending / null → spinner ("scan en cours")
 *  - clean          → green shield, click opens scan detail
 *  - infected       → red shield, click opens override flow
 *  - error          → nothing (fail quietly, operator can retry upload)
 */
export default function ScanBadge({ doc }: { doc: CandidatureDocument }) {
  const [open, setOpen] = useState(false)

  if (!doc.scan_status || doc.scan_status === 'pending') {
    return (
      <Tooltip>
        <TooltipTrigger className="cursor-help">
          <Loader className="h-3 w-3 text-muted-foreground animate-spin" />
        </TooltipTrigger>
        <TooltipContent className="text-xs">Scan antivirus en cours…</TooltipContent>
      </Tooltip>
    )
  }

  const icon = doc.scan_status === 'clean'
    ? <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
    : doc.scan_status === 'infected'
      ? <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
      : null
  if (!icon) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer rounded p-0.5 hover:bg-muted/60"
          aria-label={`Voir le détail du scan de ${doc.filename}`}
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent className="text-xs max-w-[220px]">
          {doc.scan_status === 'clean'
            ? 'Scanné (ClamAV + VirusTotal) — aucune menace. Cliquer pour le détail par moteur.'
            : 'Menace détectée — cliquer pour voir le détail et créer un override.'}
        </TooltipContent>
      </Tooltip>
      {open && (
        <ScanDetailDialog
          open={open}
          onClose={() => setOpen(false)}
          documentId={doc.id}
          filename={doc.filename}
        />
      )}
    </>
  )
}
