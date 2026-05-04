import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { AboroProfile, CandidatureDocument, CandidatureEvent, CandidatureData, CandidatureInfo } from '@/hooks/use-candidate-data'

export interface UseDocumentUploadReturn {
  uploading: boolean
  uploadType: string
  setUploadType: React.Dispatch<React.SetStateAction<string>>
  /** Upload `file` as `typeOverride` if given, otherwise as `uploadType`
   *  (the hook's internal state — used by the Admin bucket Select + Uploader). */
  uploadDocument: (file: File, typeOverride?: string) => Promise<void>
}

export function useDocumentUpload(
  candidatureId: string,
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>,
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>,
  setCandidatureDataMap?: React.Dispatch<React.SetStateAction<Record<string, CandidatureData>>>,
  onCandidatureUpdated?: (candidature: CandidatureInfo) => void,
  onAboroProfileUpdated?: (profile: AboroProfile) => void,
): UseDocumentUploadReturn {
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState('other')

  const uploadDocument = useCallback(async (file: File, typeOverride?: string) => {
    const effectiveType = typeOverride ?? uploadType
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', effectiveType)
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      const uploaded = await res.json().catch(() => null) as { aboroProfile?: AboroProfile | null } | null
      if (uploaded?.aboroProfile && onAboroProfileUpdated) {
        onAboroProfileUpdated({
          ...uploaded.aboroProfile,
          _meta: {
            ...uploaded.aboroProfile._meta,
            source: 'pdf',
            sourceDocumentName: file.name,
          },
        })
      }

      // Refetch the authoritative doc list so the UI gets server-assigned
      // display_filename / scan_status / uploaded_by and any soft-delete of
      // a replaced slot doc. Avoids the ghost-row issue Codex flagged where
      // we used to fabricate an incomplete client row.
      const [listRes, detailRes] = await Promise.all([
        fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, { credentials: 'include' }),
        fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }),
      ])
      if (listRes.ok) {
        const fresh = await listRes.json() as CandidatureDocument[]
        setDocuments(fresh)
        if (setCandidatureDataMap) {
          setCandidatureDataMap(prev => ({
            ...prev,
            [candidatureId]: { ...prev[candidatureId], documents: fresh } as CandidatureData,
          }))
        }
      }
      if (detailRes.ok) {
        const detail = await detailRes.json() as { events?: CandidatureEvent[]; candidature?: CandidatureInfo }
        if (detail?.events) setEvents(detail.events)
        if (detail?.candidature && onCandidatureUpdated) onCandidatureUpdated(detail.candidature)
      }

      if (!typeOverride) setUploadType('other')
      toast.success(`Document uploadé : ${file.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur upload')
    } finally {
      setUploading(false)
    }
  }, [candidatureId, uploadType, setDocuments, setEvents, setCandidatureDataMap, onCandidatureUpdated, onAboroProfileUpdated])

  return {
    uploading,
    uploadType,
    setUploadType,
    uploadDocument,
  }
}
