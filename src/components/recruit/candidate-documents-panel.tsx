import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Upload, FileText, Download, Eye, Pencil, Trash2, FolderArchive } from 'lucide-react'
import { formatDateTime } from '@/lib/constants'
import { useDocumentUpload } from '@/hooks/use-document-upload'
import type { CandidatureDocument, CandidatureEvent } from '@/hooks/use-candidate-data'

function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf')
}

function effectiveName(doc: CandidatureDocument): string {
  return doc.display_filename ?? doc.filename
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

export interface CandidateDocumentsPanelProps {
  candidatureId: string
  documents: CandidatureDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>
  currentStatut?: string
}

export default function CandidateDocumentsPanel({
  candidatureId,
  documents,
  setDocuments,
  setEvents,
  currentStatut,
}: CandidateDocumentsPanelProps) {
  const { uploading, uploadType, setUploadType, uploadDocument } = useDocumentUpload(candidatureId, setDocuments, setEvents)
  const [previewDoc, setPreviewDoc] = useState<CandidatureDocument | null>(null)
  const [renameDoc, setRenameDoc] = useState<CandidatureDocument | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState<CandidatureDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

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
      setDocuments(prev => prev.filter(d => d.id !== deleteDoc.id))
      toast.success('Document supprimé (récupérable pendant 30 jours)')
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
    if (newName.length === 0 || newName.length > 200) {
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
      setDocuments(prev => prev.map(d => d.id === renameDoc.id ? { ...d, display_filename: newName } : d))
      toast.success('Document renommé')
      setRenameDoc(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du renommage')
    } finally {
      setRenaming(false)
    }
  }

  const expectedTypes = currentStatut ? (EXPECTED_DOCUMENTS[currentStatut] ?? ['cv']) : ['cv']
  const uploadedTypes = new Set(documents.map(d => d.type))

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Documents
          <span className="text-xs font-normal text-muted-foreground ml-2">
            {documents.length}/{expectedTypes.length} attendus
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {documents.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.open(`/api/recruitment/candidatures/${candidatureId}/documents/zip`, '_blank')
              }}
            >
              <FolderArchive className="mr-2 h-4 w-4" />
              Télécharger tout (.zip)
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Expected documents checklist */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {expectedTypes.map(type => {
            const uploaded = uploadedTypes.has(type)
            return (
              <Badge
                key={type}
                variant={uploaded ? 'default' : 'outline'}
                className={uploaded ? 'bg-green-600 hover:bg-green-700 text-[10px]' : 'text-[10px] border-dashed'}
              >
                {uploaded ? '✓' : '○'} {DOC_TYPE_LABELS[type] ?? type}
              </Badge>
            )
          })}
        </div>

        {/* Upload form */}
        <div className="flex items-center gap-2 mb-4">
          <Select value={uploadType} onValueChange={(v) => { if (v) setUploadType(v) }}>
            <SelectTrigger className="w-[180px]">
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
            variant="outline"
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
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Uploader
          </Button>
        </div>

        {/* Document list */}
        {documents.length > 0 ? (
          <div className="space-y-1.5">
            {documents.map(doc => {
              const name = effectiveName(doc)
              return (
                <div key={doc.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate" title={name !== doc.filename ? `Original : ${doc.filename}` : undefined}>{name}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDateTime(doc.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    {isPdf(doc.filename) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        title="Voir le document"
                        aria-label={`Voir ${name}`}
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Renommer"
                      aria-label={`Renommer ${name}`}
                      onClick={() => openRenameDialog(doc)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Télécharger le document"
                      aria-label={`Télécharger ${name}`}
                      onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Supprimer (récupérable 30 jours)"
                      aria-label={`Supprimer ${name}`}
                      onClick={() => setDeleteDoc(doc)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun document. Utilisez le bouton ci-dessus pour ajouter des pièces au dossier.
          </p>
        )}
      </CardContent>

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
            <p className="text-xs text-muted-foreground">Récupérable depuis l’historique pendant 30 jours, puis purgé définitivement.</p>
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
              onKeyDown={(e) => { if (e.key === 'Enter' && !renaming) handleRename() }}
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
    </Card>
  )
}
