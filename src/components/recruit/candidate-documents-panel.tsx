import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Upload, FileText, FileType2, BrainCircuit, Download, Eye, Pencil, Trash2, FolderArchive, RotateCcw, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react'
import ScanBadge from './scan-badge'
import { formatDateTime } from '@/lib/constants'
import { useDocumentUpload } from '@/hooks/use-document-upload'
import type { CandidatureData, CandidatureDocument, CandidatureEvent } from '@/hooks/use-candidate-data'

function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf')
}

function effectiveName(doc: CandidatureDocument): string {
  return doc.display_filename ?? doc.filename
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cv: 'CV',
  lettre: 'Lettre de motivation',
  aboro: 'Rapport Âboro',
  entretien: 'Compte-rendu entretien',
  proposition: 'Proposition',
  administratif: 'Administratif',
  other: 'Autre',
}

/** Stage where each slot becomes "expected" vs "optional". Âboro is optional
 *  until the pipeline reaches its own step — before that, showing it as
 *  "missing" just adds visual noise. */
const ABORO_STAGES = new Set(['aboro', 'entretien_2', 'proposition', 'embauche'])

type SlotType = 'cv' | 'lettre' | 'aboro'
const SLOT_META: Record<SlotType, { label: string; Icon: typeof FileText; description: string }> = {
  cv: { label: 'CV', Icon: FileText, description: 'Curriculum Vitae' },
  lettre: { label: 'Lettre de motivation', Icon: FileType2, description: 'Lettre du candidat' },
  aboro: { label: 'Rapport Âboro', Icon: BrainCircuit, description: 'Test de personnalité SWIPE' },
}

// Heuristic: if the filename strongly signals a different slot, warn the user
// before the upload. Non-blocking — they can keep going.
function detectMisplacedType(filename: string, targetSlot: SlotType): SlotType | null {
  const lower = filename.toLowerCase()
  const patterns: Array<{ slot: SlotType; re: RegExp }> = [
    { slot: 'cv', re: /\bcv\b|curriculum|resume/i },
    { slot: 'lettre', re: /lettre|motivation|cover.?letter/i },
    { slot: 'aboro', re: /aboro|swipe|personalit/i },
  ]
  for (const p of patterns) {
    if (p.slot !== targetSlot && p.re.test(lower)) return p.slot
  }
  return null
}

export interface CandidateDocumentsPanelProps {
  candidatureId: string
  documents: CandidatureDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>
  setCandidatureDataMap?: React.Dispatch<React.SetStateAction<Record<string, CandidatureData>>>
  currentStatut?: string
}

export default function CandidateDocumentsPanel({
  candidatureId,
  documents,
  setDocuments,
  setEvents,
  setCandidatureDataMap,
  currentStatut,
}: CandidateDocumentsPanelProps) {
  const { uploading, uploadType, setUploadType, uploadDocument } = useDocumentUpload(candidatureId, setDocuments, setEvents, setCandidatureDataMap)

  // Shared dialog state
  const [previewDoc, setPreviewDoc] = useState<CandidatureDocument | null>(null)
  const [renameDoc, setRenameDoc] = useState<CandidatureDocument | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState<CandidatureDocument | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Replace-on-filled-slot confirmation: stores the pending file + target type.
  const [pendingReplace, setPendingReplace] = useState<{ file: File; slot: SlotType } | null>(null)
  // Soft-deleted docs (lazy-fetched when the trash section is opened).
  const [trashOpen, setTrashOpen] = useState(false)
  const [deletedDocs, setDeletedDocs] = useState<CandidatureDocument[]>([])
  const [trashLoading, setTrashLoading] = useState(false)

  // Sync helper — updates flat state + per-candidature map so the candidate
  // detail page refreshes without a reload. Same pattern as the transition
  // fix in commit 5feebbe.
  const syncDocs = useCallback((next: CandidatureDocument[] | ((p: CandidatureDocument[]) => CandidatureDocument[])) => {
    setDocuments(next)
    if (setCandidatureDataMap) {
      setCandidatureDataMap(prev => {
        const prevDocs = prev[candidatureId]?.documents ?? []
        const nextDocs = typeof next === 'function' ? next(prevDocs) : next
        return { ...prev, [candidatureId]: { ...prev[candidatureId], documents: nextDocs } as CandidatureData }
      })
    }
  }, [setDocuments, setCandidatureDataMap, candidatureId])

  const refreshTrash = useCallback(async () => {
    setTrashLoading(true)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents?deleted=1`, { credentials: 'include' })
      if (!res.ok) return
      const all = await res.json() as CandidatureDocument[]
      setDeletedDocs(all.filter(d => d.deleted_at))
    } finally {
      setTrashLoading(false)
    }
  }, [candidatureId])

  useEffect(() => {
    if (trashOpen) void refreshTrash()
  }, [trashOpen, refreshTrash])

  // When an upload succeeds, a slot replace may have soft-deleted the prior doc.
  // If the trash section is open, refresh it so the replaced doc shows up.
  useEffect(() => {
    if (trashOpen) void refreshTrash()
    // Intentionally depend on documents.length (new upload bumps the list length).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.length])

  async function handleDelete(): Promise<void> {
    if (!deleteDoc) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/recruitment/documents/${deleteDoc.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      syncDocs(prev => prev.filter(d => d.id !== deleteDoc.id))
      toast.success('Document supprimé — récupérable 30 jours depuis « Documents supprimés »')
      setDeleteDoc(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }

  function openRenameDialog(doc: CandidatureDocument): void {
    setRenameDoc(doc)
    setRenameValue(effectiveName(doc))
  }

  async function handleRename(): Promise<void> {
    if (!renameDoc) return
    const newName = renameValue.trim()
    if (newName.length < 1 || newName.length > 200) {
      toast.error('Le nom doit faire entre 1 et 200 caractères')
      return
    }
    if (newName === effectiveName(renameDoc)) {
      setRenameDoc(null)
      return
    }
    setRenaming(true)
    try {
      const res = await fetch(`/api/recruitment/documents/${renameDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ display_filename: newName }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      syncDocs(prev => prev.map(d => d.id === renameDoc.id ? { ...d, display_filename: newName } : d))
      toast.success('Document renommé')
      setRenameDoc(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du renommage')
    } finally {
      setRenaming(false)
    }
  }

  async function handleRestore(doc: CandidatureDocument): Promise<void> {
    try {
      const res = await fetch(`/api/recruitment/documents/${doc.id}/restore`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // Refetch both lists to reflect restore + any slot replacement side effects.
      const listRes = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, { credentials: 'include' })
      if (listRes.ok) {
        const fresh = await listRes.json() as CandidatureDocument[]
        syncDocs(fresh)
      }
      await refreshTrash()
      toast.success('Document restauré')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la restauration')
    }
  }

  function handleSlotFile(slot: SlotType, file: File, existingDoc: CandidatureDocument | undefined): void {
    // Filename-slot mismatch warning (non-blocking)
    const suggested = detectMisplacedType(file.name, slot)
    if (suggested) {
      toast.warning(`Ce fichier ressemble plutôt à « ${SLOT_META[suggested].label} ». Uploadé comme « ${SLOT_META[slot].label} » quand même.`)
    }
    if (existingDoc) {
      // Confirm before overwriting a filled slot.
      setPendingReplace({ file, slot })
    } else {
      void uploadDocument(file, slot)
    }
  }

  function confirmReplace(): void {
    if (!pendingReplace) return
    const { file, slot } = pendingReplace
    setPendingReplace(null)
    void uploadDocument(file, slot)
  }

  // Grouping
  const activeDocs = documents.filter(d => !d.deleted_at)
  const slotDocs: Record<SlotType, CandidatureDocument | undefined> = {
    cv: activeDocs.find(d => d.type === 'cv'),
    lettre: activeDocs.find(d => d.type === 'lettre'),
    aboro: activeDocs.find(d => d.type === 'aboro'),
  }
  const adminDocs = activeDocs.filter(d => !['cv', 'lettre', 'aboro'].includes(d.type))
  const aboroRequired = !!currentStatut && ABORO_STAGES.has(currentStatut)

  const slotCount = (['cv', 'lettre'] as const).filter(t => slotDocs[t]).length

  const onDocActions = {
    onPreview: (doc: CandidatureDocument) => setPreviewDoc(doc),
    onRename: (doc: CandidatureDocument) => openRenameDialog(doc),
    onDelete: (doc: CandidatureDocument) => setDeleteDoc(doc),
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Documents
          <span className="text-xs font-normal text-muted-foreground ml-2">
            {slotCount}/2 candidat · {activeDocs.length} total
          </span>
        </CardTitle>
        {activeDocs.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/recruitment/candidatures/${candidatureId}/documents/zip`, '_blank')}
            title="Télécharger tous les documents en un fichier .zip"
          >
            <FolderArchive className="mr-2 h-4 w-4" />
            Tout télécharger (.zip)
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ─── Section 1 — Dossier candidat (3 slots) ─── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Dossier candidat
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['cv', 'lettre', 'aboro'] as SlotType[]).map(slot => (
              <DocumentSlot
                key={slot}
                slot={slot}
                doc={slotDocs[slot]}
                muted={slot === 'aboro' && !aboroRequired}
                uploading={uploading}
                onFile={(file) => handleSlotFile(slot, file, slotDocs[slot])}
                onPreview={onDocActions.onPreview}
                onRename={onDocActions.onRename}
                onDelete={onDocActions.onDelete}
              />
            ))}
          </div>
        </section>

        {/* ─── Section 2 — Autres documents (multi) ─── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Autres documents
          </h3>
          <div className="flex items-center gap-2 mb-3">
            <Select value={uploadType} onValueChange={(v) => { if (v) setUploadType(v) }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {(['entretien', 'proposition', 'administratif', 'other'] as const).map(t => (
                  <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.pdf,.docx,.doc'
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) void uploadDocument(file)
                }
                input.click()
              }}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Ajouter
            </Button>
          </div>

          {adminDocs.length > 0 ? (
            <div className="space-y-1.5">
              {adminDocs.map(doc => (
                <DocumentRow key={doc.id} doc={doc} showType {...onDocActions} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Aucun document additionnel.</p>
          )}
        </section>

        {/* ─── Section 3 — Trash (collapsible) ─── */}
        <section>
          <button
            type="button"
            onClick={() => setTrashOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {trashOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Documents supprimés{deletedDocs.length > 0 ? ` (${deletedDocs.length})` : ''} <span className="text-muted-foreground/70">· récupérables 30 jours</span>
          </button>
          {trashOpen && (
            <div className="mt-2 space-y-1.5 pl-5">
              {trashLoading && <p className="text-xs text-muted-foreground italic"><Loader2 className="inline h-3 w-3 mr-1 animate-spin" /> Chargement…</p>}
              {!trashLoading && deletedDocs.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Aucun document supprimé récemment.</p>
              )}
              {deletedDocs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded text-sm opacity-75">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-xs">{effectiveName(doc)}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                    </Badge>
                    {doc.deleted_at && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        supprimé {formatDateTime(doc.deleted_at)}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleRestore(doc)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restaurer
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>

      {/* ── Dialogs ── */}

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null) }}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-medium truncate pr-8">
              {previewDoc ? effectiveName(previewDoc) : ''}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <iframe
              src={`/api/recruitment/documents/${previewDoc.id}/preview`}
              title={`Aperçu de ${effectiveName(previewDoc)}`}
              className="flex-1 w-full border-0"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDoc} onOpenChange={(open) => { if (!open && !deleting) setDeleteDoc(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce document ?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Le document <span className="font-medium">{deleteDoc ? effectiveName(deleteDoc) : ''}</span> sera retiré du dossier.</p>
            <p className="text-xs text-muted-foreground">Récupérable depuis « Documents supprimés » pendant 30 jours, puis purgé définitivement.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteDoc(null)}>Annuler</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameDoc} onOpenChange={(open) => { if (!open && !renaming) setRenameDoc(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer le document</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input" className="text-sm">Nouveau nom (avec extension, ex. CV_Jean_Dupont.pdf)</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={200}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !renaming) void handleRename() }}
            />
            {renameDoc && renameValue.trim() !== renameDoc.filename && (
              <p className="text-[11px] text-muted-foreground">Original : {renameDoc.filename}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={renaming} onClick={() => setRenameDoc(null)}>Annuler</Button>
            <Button disabled={renaming} onClick={handleRename}>
              {renaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingReplace} onOpenChange={(open) => { if (!open) setPendingReplace(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Remplacer ce document ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Remplacer « <span className="font-medium">{pendingReplace ? SLOT_META[pendingReplace.slot].label : ''}</span> » par
              « <span className="font-medium">{pendingReplace?.file.name}</span> » ?
            </p>
            <p className="text-xs text-muted-foreground">
              L'ancien document restera récupérable dans « Documents supprimés » pendant 30 jours.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingReplace(null)}>Annuler</Button>
            <Button onClick={confirmReplace}>Remplacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ───────────────────────────── subcomponents ─────────────────────────────

interface DocumentSlotProps {
  slot: SlotType
  doc: CandidatureDocument | undefined
  muted: boolean
  uploading: boolean
  onFile: (file: File) => void
  onPreview: (doc: CandidatureDocument) => void
  onRename: (doc: CandidatureDocument) => void
  onDelete: (doc: CandidatureDocument) => void
}

function DocumentSlot({ slot, doc, muted, uploading, onFile, onPreview, onRename, onDelete }: DocumentSlotProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { label, Icon, description } = SLOT_META[slot]

  function pickFile(): void {
    inputRef.current?.click()
  }
  function handleDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  const emptyClass = `flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors min-h-[130px] text-center ${dragOver ? 'border-primary bg-primary/5' : muted ? 'border-muted-foreground/20 hover:border-muted-foreground/40' : 'border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/30'}`
  const filledClass = `flex flex-col gap-1.5 p-3 rounded-lg border bg-card transition-colors ${dragOver ? 'border-primary bg-primary/5' : ''}`

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Reset so re-picking same filename fires onChange again
          if (inputRef.current) inputRef.current.value = ''
        }}
      />

      {!doc ? (
        <div
          className={emptyClass}
          onClick={pickFile}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickFile() }}
          aria-label={`Ajouter ${label}`}
        >
          <Icon className={`h-6 w-6 ${muted ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-sm font-medium ${muted ? 'text-muted-foreground/70' : ''}`}>{label}</p>
            {muted && <p className="text-[10px] text-muted-foreground/60">optionnel à ce stade</p>}
          </div>
          <p className="text-[11px] text-muted-foreground">Glisser ou cliquer</p>
          {uploading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      ) : (
        <div
          className={filledClass}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate" title={description}>{label}</span>
            <ScanBadge doc={doc} />
          </div>
          <p className="text-sm font-medium truncate" title={effectiveName(doc) !== doc.filename ? `Original : ${doc.filename}` : undefined}>
            {effectiveName(doc)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatDateTime(doc.created_at)}
            {formatBytes(doc.size_bytes) && ` · ${formatBytes(doc.size_bytes)}`}
          </p>
          <div className="flex items-center gap-0.5 pt-1 border-t">
            {isPdf(doc.filename) && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Voir" aria-label={`Voir ${effectiveName(doc)}`} onClick={() => onPreview(doc)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Renommer" aria-label={`Renommer ${effectiveName(doc)}`} onClick={() => onRename(doc)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Télécharger" aria-label={`Télécharger ${effectiveName(doc)}`} onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive ml-auto" title="Supprimer" aria-label={`Supprimer ${effectiveName(doc)}`} onClick={() => onDelete(doc)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

interface DocumentRowProps {
  doc: CandidatureDocument
  showType?: boolean
  onPreview: (doc: CandidatureDocument) => void
  onRename: (doc: CandidatureDocument) => void
  onDelete: (doc: CandidatureDocument) => void
}

function DocumentRow({ doc, showType, onPreview, onRename, onDelete }: DocumentRowProps) {
  const name = effectiveName(doc)
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate" title={name !== doc.filename ? `Original : ${doc.filename}` : undefined}>{name}</span>
        {showType && (
          <Badge variant="secondary" className="text-[10px] shrink-0">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</Badge>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(doc.created_at)}</span>
        <ScanBadge doc={doc} />
      </div>
      <div className="flex items-center gap-0.5">
        {isPdf(doc.filename) && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Voir" aria-label={`Voir ${name}`} onClick={() => onPreview(doc)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Renommer" aria-label={`Renommer ${name}`} onClick={() => onRename(doc)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Télécharger" aria-label={`Télécharger ${name}`} onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}>
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Supprimer" aria-label={`Supprimer ${name}`} onClick={() => onDelete(doc)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
