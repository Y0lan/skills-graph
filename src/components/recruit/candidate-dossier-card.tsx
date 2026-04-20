import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { FileText, Download, FolderArchive, Upload, Loader2, AlertTriangle, ShieldCheck, ShieldAlert, Loader, Settings2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import CandidateDocumentsPanel from './candidate-documents-panel'
import { formatDateTime } from '@/lib/constants'
import { useDocumentUpload } from '@/hooks/use-document-upload'
import type { CandidatureDocument, CandidatureEvent } from '@/hooks/use-candidate-data'

const DOC_TYPE_LABELS: Record<string, string> = {
  cv: 'CV',
  lettre: 'Lettre de motivation',
  aboro: 'Rapport Aboro',
  entretien: 'Compte-rendu entretien',
  proposition: 'Proposition',
  administratif: 'Administratif',
  other: 'Autre',
}

/** Reuse the EXPECTED_DOCUMENTS map from candidate-documents-panel.tsx */
const EXPECTED_DOCUMENTS: Record<string, string[]> = {
  cv: ['cv'],
  lettre: ['cv', 'lettre'],
  postule: ['cv'],
  preselectionne: ['cv'],
  skill_radar_envoye: ['cv'],
  skill_radar_complete: ['cv'],
  entretien_1: ['cv', 'lettre'],
  aboro: ['cv', 'lettre', 'aboro'],
  entretien_2: ['cv', 'lettre', 'aboro', 'entretien'],
  proposition: ['cv', 'lettre', 'aboro', 'entretien', 'proposition'],
  embauche: ['cv', 'lettre', 'aboro', 'entretien', 'proposition', 'administratif'],
}

import { useState, useEffect } from 'react'
import ScanDetailDialog from './scan-detail-dialog'

function ScanBadge({ doc }: { doc: CandidatureDocument }) {
  const [open, setOpen] = useState(false)

  if (!doc.scan_status || doc.scan_status === 'pending') {
    return (
      <Tooltip>
        <TooltipTrigger className="cursor-help">
          <Loader className="h-3 w-3 text-muted-foreground animate-spin" />
        </TooltipTrigger>
        <TooltipContent className="text-xs">Scan antivirus en cours...</TooltipContent>
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
            ? 'Scanné — aucun malware détecté. Cliquer pour voir le détail.'
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

export interface CandidateDossierCardProps {
  candidatureId: string
  documents: CandidatureDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>
  currentStatut?: string
}

export default function CandidateDossierCard({
  candidatureId,
  documents,
  setDocuments,
  setEvents,
  currentStatut,
}: CandidateDossierCardProps) {
  const { uploading, uploadType, setUploadType, uploadDocument } = useDocumentUpload(candidatureId, setDocuments, setEvents)
  const [panelOpen, setPanelOpen] = useState(false)

  // Polling fallback for live scan-status updates. SSE handles most cases, but
  // if the scan finishes within ~1s of upload (typical when only VirusTotal
  // runs without ClamAV) the SSE connection may not be open yet. Poll every
  // 3s while ANY document is still pending; stops automatically once all
  // resolve.
  useEffect(() => {
    const pendingDocs = documents.filter(d => d.scan_status === 'pending' || d.scan_status === undefined || d.scan_status === null)
    if (pendingDocs.length === 0) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, { credentials: 'include' })
        if (!res.ok) return
        const fresh = await res.json() as CandidatureDocument[]
        setDocuments(prev => prev.map(d => {
          const updated = fresh.find(f => f.id === d.id)
          return updated ? { ...d, scan_status: updated.scan_status } : d
        }))
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [documents, candidatureId, setDocuments])

  const expectedTypes = currentStatut ? (EXPECTED_DOCUMENTS[currentStatut] ?? ['cv']) : ['cv']
  const uploadedTypes = new Set(documents.map(d => d.type))

  const cvDoc = documents.find(d => d.type === 'cv')
  const lettreDoc = documents.find(d => d.type === 'lettre')
  const otherDocs = documents.filter(d => d.type !== 'cv' && d.type !== 'lettre')
  const missingDocs = expectedTypes.filter(t => !uploadedTypes.has(t))
  const hasCv = uploadedTypes.has('cv')

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dossier</p>

      {/* Empty state */}
      {documents.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            CV manquant
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Impossible de faire une revue rapide sans CV
          </p>
        </div>
      )}

      {/* Primary document buttons */}
      {hasCv && (
        <div className="flex flex-wrap gap-2">
          {cvDoc && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="default"
                onClick={() => window.open(`/api/recruitment/documents/${cvDoc.id}/preview`, '_blank')}
                className="gap-2"
                title="Ouvrir le CV dans un nouvel onglet (aperçu)"
              >
                <FileText className="h-4 w-4" />
                Ouvrir CV
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => window.open(`/api/recruitment/documents/${cvDoc.id}/download`, '_blank')}
                title="Télécharger le CV"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <ScanBadge doc={cvDoc} />
            </div>
          )}
          {lettreDoc && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/api/recruitment/documents/${lettreDoc.id}/preview`, '_blank')}
                className="gap-2"
                title="Ouvrir la lettre dans un nouvel onglet (aperçu)"
              >
                <FileText className="h-4 w-4" />
                Ouvrir Lettre
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => window.open(`/api/recruitment/documents/${lettreDoc.id}/download`, '_blank')}
                title="Télécharger la lettre"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <ScanBadge doc={lettreDoc} />
            </div>
          )}
          {documents.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/api/recruitment/candidatures/${candidatureId}/documents/zip`, '_blank')}
              className="gap-2"
              title="Télécharger tous les documents en un fichier .zip"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              Tout (.zip)
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPanelOpen(true)}
            className="gap-1.5 text-xs"
            title="Voir tous les fichiers, renommer, supprimer"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Gérer
          </Button>
        </div>
      )}

      {/* Other documents list */}
      {otherDocs.length > 0 && (
        <div className="space-y-1">
          {otherDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-muted/50 group">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs truncate">{doc.display_filename ?? doc.filename}</span>
                <Badge variant="secondary" className="text-[9px] shrink-0">
                  {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                </Badge>
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {formatDateTime(doc.created_at)}
                </span>
                <ScanBadge doc={doc} />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Missing expected docs */}
      {missingDocs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {missingDocs.map(type => (
            <Badge
              key={type}
              variant="outline"
              className="text-[9px] border-dashed border-amber-500/50 text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              {DOC_TYPE_LABELS[type] ?? type}
            </Badge>
          ))}
        </div>
      )}

      {/* Upload (tertiary, at bottom) */}
      <div className="flex items-center gap-2 pt-1">
        <Select value={uploadType} onValueChange={(v) => { if (v) setUploadType(v) }}>
          <SelectTrigger className="w-[140px] h-7 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          disabled={uploading}
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.pdf,.docx,.doc'
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) uploadDocument(file)
            }
            input.click()
          }}
        >
          {uploading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Upload className="mr-1.5 h-3 w-3" />}
          Uploader
        </Button>
      </div>

      {/* Full documents panel — rename, delete, preview, download per file. */}
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gérer les fichiers</DialogTitle>
          </DialogHeader>
          <CandidateDocumentsPanel
            candidatureId={candidatureId}
            documents={documents}
            setDocuments={setDocuments}
            setEvents={setEvents}
            currentStatut={currentStatut}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
