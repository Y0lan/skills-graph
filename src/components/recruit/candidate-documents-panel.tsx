import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Upload, FileText, Download, FolderArchive } from 'lucide-react'
import { formatDateShort } from '@/lib/constants'
import type { CandidatureDocument, CandidatureEvent } from '@/hooks/use-candidate-data'

const DOC_TYPE_LABELS: Record<string, string> = {
  cv: 'CV',
  lettre: 'Lettre de motivation',
  aboro: 'Rapport Âboro',
  entretien: 'Compte-rendu entretien',
  proposition: 'Proposition',
  administratif: 'Administratif',
  other: 'Autre',
}

export interface CandidateDocumentsPanelProps {
  candidatureId: string
  documents: CandidatureDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>
}

export default function CandidateDocumentsPanel({
  candidatureId,
  documents,
  setDocuments,
  setEvents,
}: CandidateDocumentsPanelProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState('other')

  const uploadDocument = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', uploadType)
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) throw new Error('Erreur upload')
      const doc = await res.json()
      setDocuments(prev => [{ id: doc.id, type: doc.type, filename: doc.filename, uploaded_by: 'moi', created_at: new Date().toISOString() }, ...prev])
      setUploadType('other')
      toast.success(`Document uploadé : ${doc.filename}`)
      // Refresh events (upload creates a timeline event)
      fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(detail => { if (detail?.events) setEvents(detail.events) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur upload')
    } finally {
      setUploading(false)
    }
  }, [candidatureId, uploadType, setDocuments, setEvents])

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
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
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{doc.filename}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDateShort(doc.created_at)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0"
                  onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun document. Utilisez le bouton ci-dessus pour ajouter des pièces au dossier.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
