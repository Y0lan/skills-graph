import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { CandidatureDocument, CandidatureEvent } from '@/hooks/use-candidate-data'

export interface UseDocumentUploadReturn {
  uploading: boolean
  uploadType: string
  setUploadType: React.Dispatch<React.SetStateAction<string>>
  uploadDocument: (file: File) => Promise<void>
}

export function useDocumentUpload(
  candidatureId: string,
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>,
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>,
): UseDocumentUploadReturn {
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

  return {
    uploading,
    uploadType,
    setUploadType,
    uploadDocument,
  }
}
