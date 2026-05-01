import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { STATUT_LABELS } from '@/lib/constants'
import type { AllowedTransitions, CandidatureInfo, CandidatureEvent } from '@/hooks/use-candidate-data'

export interface TransitionDialog {
  candidatureId: string
  currentStatut: string
  targetStatut: string
  isSkip: boolean
  skipped: string[]
  notesRequired: boolean
  candidateName: string
  role: string
  /** Pre-built link the email body should embed for skill_radar_envoye etc.
   *  Without this the template preview falls back to "(#)" — the recipient
   *  then receives a broken email link. */
  evaluationUrl?: string
  emailAlreadySent?: boolean
}

export interface UseTransitionStateReturn {
  changingStatus: boolean
  transitionDialog: TransitionDialog | null
  transitionNotes: string
  setTransitionNotes: React.Dispatch<React.SetStateAction<string>>
  transitionSkipReason: string
  setTransitionSkipReason: React.Dispatch<React.SetStateAction<string>>
  transitionFile: File | null
  setTransitionFile: React.Dispatch<React.SetStateAction<File | null>>
  transitionSendEmail: boolean
  setTransitionSendEmail: React.Dispatch<React.SetStateAction<boolean>>
  transitionEmailCc: string
  setTransitionEmailCc: React.Dispatch<React.SetStateAction<string>>
  transitionSkipEmailReason: string
  setTransitionSkipEmailReason: React.Dispatch<React.SetStateAction<string>>
  transitionIncludeReason: boolean
  setTransitionIncludeReason: React.Dispatch<React.SetStateAction<boolean>>
  transitionEmailSubject: string
  setTransitionEmailSubject: React.Dispatch<React.SetStateAction<string>>
  transitionEmailBody: string
  setTransitionEmailBody: React.Dispatch<React.SetStateAction<string>>
  transitionEmailExpanded: boolean
  setTransitionEmailExpanded: React.Dispatch<React.SetStateAction<boolean>>
  transitionShowMarkdownPreview: boolean
  setTransitionShowMarkdownPreview: React.Dispatch<React.SetStateAction<boolean>>
  transitionAboroDate: string
  setTransitionAboroDate: React.Dispatch<React.SetStateAction<string>>
  transitionHasEmailTemplate: boolean
  transitionEmailLoading: boolean
  transitionFileError: string | null
  openTransitionDialog: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], candidateName?: string, role?: string, currentStatut?: string, evaluationUrl?: string, emailAlreadySent?: boolean) => void
  closeTransitionDialog: () => void
  confirmTransition: () => Promise<void>
}

export function useTransitionState(
  allowedTransitions: AllowedTransitions | null,
  setCandidatures: React.Dispatch<React.SetStateAction<CandidatureInfo[]>>,
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>,
  setAllowedTransitions: React.Dispatch<React.SetStateAction<AllowedTransitions | null>>,
  setCandidatureDataMap?: React.Dispatch<React.SetStateAction<Record<string, import('./use-candidate-data').CandidatureData>>>,
): UseTransitionStateReturn {
  const [changingStatus, setChangingStatus] = useState(false)
  const [transitionDialog, setTransitionDialog] = useState<TransitionDialog | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')
  const [transitionSkipReason, setTransitionSkipReason] = useState('')
  const [transitionFile, setTransitionFile] = useState<File | null>(null)
  const [transitionSendEmail, setTransitionSendEmail] = useState(true)
  const [transitionEmailCc, setTransitionEmailCc] = useState('contact@sinapse.nc')
  const [transitionSkipEmailReason, setTransitionSkipEmailReason] = useState('')
  const [transitionIncludeReason, setTransitionIncludeReason] = useState(false)
  const [transitionEmailSubject, setTransitionEmailSubject] = useState('')
  const [transitionEmailBody, setTransitionEmailBody] = useState('')
  const [transitionEmailExpanded, setTransitionEmailExpanded] = useState(false)
  const [transitionShowMarkdownPreview, setTransitionShowMarkdownPreview] = useState(false)
  const [transitionAboroDate, setTransitionAboroDate] = useState('')
  const [transitionHasEmailTemplate, setTransitionHasEmailTemplate] = useState(false)
  const [transitionEmailLoading, setTransitionEmailLoading] = useState(false)
  const [transitionFileError, setTransitionFileError] = useState<string | null>(null)
  // Tracks whether the PATCH /status already succeeded for the current
  // dialog. If the status change succeeds but the file upload fails, we
  // keep the dialog open so the user can retry the upload — but the next
  // Confirm click must NOT re-PATCH (server would 409 on stale currentStatut
  // and the state machine would reject the same-statut transition).
  const [transitionStatusApplied, setTransitionStatusApplied] = useState(false)
  // The candidature_events row id emitted by the successful PATCH /status.
  // Carried so a retry-upload after a failed upload can still stamp the same
  // event id on the document, and the per-stage history can attach the doc
  // to its transition row deterministically.
  const [appliedStatusEventId, setAppliedStatusEventId] = useState<number | null>(null)

  // Fetch email template when dialog opens
  useEffect(() => {
    if (!transitionDialog) return
    const { targetStatut, candidateName, role, evaluationUrl } = transitionDialog

    // No email for skill_radar_complete
    if (targetStatut === 'skill_radar_complete') {
      setTransitionHasEmailTemplate(false)
      return
    }

    setTransitionEmailLoading(true)
    const params = new URLSearchParams({ candidateName, role })
    if (evaluationUrl) params.set('evaluationUrl', evaluationUrl)
    fetch(`/api/recruitment/email-template/${targetStatut}?${params.toString()}`, {
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data !== 'no_template' && data.subject) {
          setTransitionEmailSubject(data.subject)
          setTransitionEmailBody(data.body ?? '')
          setTransitionHasEmailTemplate(true)
        } else {
          setTransitionHasEmailTemplate(false)
        }
      })
      .catch(() => {
        setTransitionHasEmailTemplate(false)
      })
      .finally(() => {
        setTransitionEmailLoading(false)
      })
  }, [transitionDialog])

  const openTransitionDialog = useCallback((
    candidatureId: string,
    targetStatut: string,
    isSkip = false,
    skipped: string[] = [],
    candidateName = '',
    role = '',
    currentStatut = '',
    evaluationUrl?: string,
    emailAlreadySent = false,
  ) => {
    const notesRequired = allowedTransitions?.notesRequired?.includes(targetStatut) ?? false
    setTransitionDialog({ candidatureId, currentStatut, targetStatut, isSkip, skipped, notesRequired, candidateName, role, evaluationUrl, emailAlreadySent })
    setTransitionNotes('')
    setTransitionSkipReason('')
    setTransitionFile(null)
    setTransitionSendEmail(targetStatut === 'refuse' || !emailAlreadySent)
    setTransitionEmailCc('contact@sinapse.nc')
    setTransitionSkipEmailReason('')
    setTransitionIncludeReason(false)
    setTransitionEmailSubject('')
    setTransitionEmailBody('')
    setTransitionEmailExpanded(true)
    setTransitionShowMarkdownPreview(false)
    setTransitionAboroDate('')
    setTransitionHasEmailTemplate(false)
    setTransitionEmailLoading(false)
    setTransitionFileError(null)
    setTransitionStatusApplied(false)
    setAppliedStatusEventId(null)
  }, [allowedTransitions])

  const closeTransitionDialog = useCallback(() => {
    setTransitionDialog(null)
    setTransitionFileError(null)
    setTransitionStatusApplied(false)
    setAppliedStatusEventId(null)
  }, [])

  const confirmTransition = useCallback(async () => {
    if (!transitionDialog) return
    const { candidatureId, currentStatut, targetStatut, isSkip, notesRequired } = transitionDialog

    if (notesRequired && !transitionNotes.trim()) {
      toast.error('Les notes sont obligatoires pour cette transition')
      return
    }
    if (isSkip && !transitionSkipReason.trim()) {
      toast.error('Raison requise pour sauter une étape')
      return
    }

    setChangingStatus(true)
    setTransitionFileError(null)
    // Local mirror of appliedStatusEventId so the upload block below picks
    // up the id just minted by the PATCH in the same call — the state
    // setter queues the update for the next render.
    let statusEventIdLocal: number | null = appliedStatusEventId
    try {
      // PATCH status FIRST, THEN upload. This ordering matters for the
      // per-stage history view: if we upload before the status_change row is
      // committed, the document's created_at falls within the PREVIOUS stage
      // and the timeline shows it under the wrong stage forever (codex P1).
      // Retry path: transitionStatusApplied=true means an earlier attempt
      // already applied the status — skip the PATCH and go straight to the
      // upload retry (state machine rejects same-statut transitions anyway).
      if (!transitionStatusApplied) {
        const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            statut: targetStatut,
            currentStatut: currentStatut || undefined,
            notes: transitionNotes.trim() || undefined,
            skipReason: isSkip ? transitionSkipReason.trim() : undefined,
            sendEmail: targetStatut !== 'skill_radar_complete' ? transitionSendEmail : undefined,
            skipEmailReason: targetStatut !== 'skill_radar_complete' && targetStatut !== 'refuse' && !transitionSendEmail
              ? transitionDialog.emailAlreadySent
                ? 'Email déjà envoyé pour cette étape.'
                : transitionSkipEmailReason.trim() || undefined
              : undefined,
            emailCc: targetStatut !== 'skill_radar_complete' && transitionSendEmail ? transitionEmailCc : undefined,
            includeReasonInEmail: targetStatut === 'refuse' ? transitionIncludeReason : undefined,
            customBody: transitionHasEmailTemplate && transitionEmailBody.trim() ? transitionEmailBody.trim() : undefined,
            aboroDate: targetStatut === 'aboro' && transitionAboroDate ? transitionAboroDate : undefined,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Erreur')
        }
        const body = await res.json() as { statusEventId?: number | null }
        if (typeof body.statusEventId === 'number') {
          statusEventIdLocal = body.statusEventId
          setAppliedStatusEventId(body.statusEventId)
        }
        setTransitionStatusApplied(true)
      }

      // Upload file AFTER the status PATCH so the doc lands in the right
      // stage bucket. Runs on every Confirm — the retry path uses this
      // alone after skipping the PATCH above.
      let fileUploadFailed = false
      let uploadErrorMsg: string | null = null
      if (transitionFile) {
        try {
          const formData = new FormData()
          formData.append('file', transitionFile)
          // Server rejects unknown doc types (ALLOWED_DOC_TYPES whitelist:
          // cv / lettre / aboro / entretien / proposition / administratif /
          // other). Map transition types to a valid bucket so the upload
          // doesn't silently 400 — that bug masqueraded as "upload échoué".
          const docType = targetStatut === 'aboro' ? 'aboro'
            : targetStatut === 'proposition' ? 'proposition'
            : targetStatut.startsWith('entretien') ? 'entretien'
            : 'other'
          formData.append('type', docType)
          // Stamp the upload with the status_change event that caused it so
          // the per-stage history can attach the doc to its transition row
          // deterministically (no timestamp guessing). Server validates the
          // event id belongs to this candidature.
          if (statusEventIdLocal) formData.append('eventId', String(statusEventIdLocal))
          const fileRes = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
          })
          if (!fileRes.ok) {
            fileUploadFailed = true
            try {
              const body = await fileRes.json() as { error?: string }
              if (body.error) uploadErrorMsg = body.error
            } catch { /* body wasn't JSON, keep the generic fallback */ }
          }
        } catch (err) {
          fileUploadFailed = true
          uploadErrorMsg = err instanceof Error ? err.message : null
        }
      }

      setCandidatures(prev => prev.map(c =>
        c.id === candidatureId ? { ...c, statut: targetStatut } : c
      ))

      // Refresh events + transitions + documents. The detail endpoint does
      // NOT return documents, so fetch /documents explicitly — otherwise
      // candidatureDataMap.documents stays stale and the per-stage history
      // never sees the file we just uploaded.
      const [detail, transitions, freshDocs] = await Promise.all([
        fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/recruitment/candidatures/${candidatureId}/transitions`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ])
      if (detail?.events) setEvents(detail.events)
      if (transitions) setAllowedTransitions(transitions)
      // Also refresh the per-candidature map the stepper reads from — otherwise
      // the UI shows stale events/transitions until a manual reload.
      if (setCandidatureDataMap) {
        setCandidatureDataMap(prev => ({
          ...prev,
          [candidatureId]: {
            events: detail?.events ?? prev[candidatureId]?.events ?? [],
            allowedTransitions: transitions ?? prev[candidatureId]?.allowedTransitions ?? null,
            documents: Array.isArray(freshDocs)
              ? freshDocs
              : detail?.documents ?? prev[candidatureId]?.documents ?? [],
          },
        }))
      }

      // If file upload failed but the status PATCH was either already done
      // (retry path) or just succeeded, keep the dialog open so the user
      // can retry the upload alone.
      if (fileUploadFailed) {
        const detail = uploadErrorMsg ?? 'raison inconnue'
        setTransitionFileError(`Upload du fichier échoué : ${detail}. Vous pouvez modifier le fichier et réessayer, ou fermer la boîte.`)
        toast.warning(transitionStatusApplied
          ? `Upload échoué : ${detail}`
          : `Statut changé — upload du fichier échoué : ${detail}`)
        setChangingStatus(false)
        return
      }

      // Toast must reflect what actually happened. Three flavours:
      //   - First-time success with file:   "Statut changé"
      //   - First-time success without file: "Statut changé"
      //   - Retry with file uploaded:       "Document uploadé"
      //   - Retry with NO file (user cleared it): "Boîte fermée — statut déjà changé"
      //     (otherwise we used to lie with a "Document uploadé" badge.)
      const toastMsg = transitionStatusApplied
        ? (transitionFile ? 'Document uploadé' : 'Statut déjà changé — fermeture de la boîte')
        : `Statut changé : ${STATUT_LABELS[targetStatut] ?? targetStatut}`
      toast.success(toastMsg)
      setTransitionDialog(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de statut')
    } finally {
      setChangingStatus(false)
    }
  }, [transitionDialog, transitionNotes, transitionSkipReason, transitionFile, transitionSendEmail, transitionEmailCc, transitionSkipEmailReason, transitionIncludeReason, transitionEmailBody, transitionHasEmailTemplate, transitionAboroDate, transitionStatusApplied, appliedStatusEventId, setCandidatures, setEvents, setAllowedTransitions, setCandidatureDataMap])

  return {
    changingStatus,
    transitionDialog,
    transitionNotes,
    setTransitionNotes,
    transitionSkipReason,
    setTransitionSkipReason,
    transitionFile,
    setTransitionFile,
    transitionSendEmail,
    setTransitionSendEmail,
    transitionEmailCc,
    setTransitionEmailCc,
    transitionSkipEmailReason,
    setTransitionSkipEmailReason,
    transitionIncludeReason,
    setTransitionIncludeReason,
    transitionEmailSubject,
    setTransitionEmailSubject,
    transitionEmailBody,
    setTransitionEmailBody,
    transitionEmailExpanded,
    setTransitionEmailExpanded,
    transitionShowMarkdownPreview,
    setTransitionShowMarkdownPreview,
    transitionAboroDate,
    setTransitionAboroDate,
    transitionHasEmailTemplate,
    transitionEmailLoading,
    transitionFileError,
    openTransitionDialog,
    closeTransitionDialog,
    confirmTransition,
  }
}
