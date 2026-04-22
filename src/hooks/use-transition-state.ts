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
  openTransitionDialog: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], candidateName?: string, role?: string, currentStatut?: string, evaluationUrl?: string) => void
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
  ) => {
    const notesRequired = allowedTransitions?.notesRequired?.includes(targetStatut) ?? false
    setTransitionDialog({ candidatureId, currentStatut, targetStatut, isSkip, skipped, notesRequired, candidateName, role, evaluationUrl })
    setTransitionNotes('')
    setTransitionSkipReason('')
    setTransitionFile(null)
    setTransitionSendEmail(true)
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
  }, [allowedTransitions])

  const closeTransitionDialog = useCallback(() => {
    setTransitionDialog(null)
    setTransitionFileError(null)
    setTransitionStatusApplied(false)
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
    try {
      // Upload file if present (for aboro or any transition with attachment).
      // Runs on every Confirm — including the retry-after-status-already-applied
      // path, which is the whole point of this retry mechanic.
      let fileUploadFailed = false
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
          const fileRes = await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
          })
          if (!fileRes.ok) {
            fileUploadFailed = true
          }
        } catch {
          fileUploadFailed = true
        }
      }

      // Skip the PATCH if a previous attempt already changed the status —
      // the server would 409 (stale currentStatut) AND the state machine
      // would reject a same-statut transition. The user is just retrying
      // the upload here; the status change is already done.
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
              ? transitionSkipEmailReason.trim() || undefined
              : undefined,
            includeReasonInEmail: targetStatut === 'refuse' ? transitionIncludeReason : undefined,
            customBody: transitionHasEmailTemplate && transitionEmailBody.trim() ? transitionEmailBody.trim() : undefined,
            aboroDate: targetStatut === 'aboro' && transitionAboroDate ? transitionAboroDate : undefined,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Erreur')
        }
        setTransitionStatusApplied(true)
      }

      setCandidatures(prev => prev.map(c =>
        c.id === candidatureId ? { ...c, statut: targetStatut } : c
      ))

      // Refresh events + transitions
      const [detail, transitions] = await Promise.all([
        fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/recruitment/candidatures/${candidatureId}/transitions`, { credentials: 'include' }).then(r => r.json()),
      ])
      if (detail?.events) setEvents(detail.events)
      if (transitions) setAllowedTransitions(transitions)
      // Also refresh the per-candidature map the stepper reads from — otherwise
      // the UI shows stale events/transitions until a manual reload.
      if (setCandidatureDataMap && (detail?.events || transitions || detail?.documents)) {
        setCandidatureDataMap(prev => ({
          ...prev,
          [candidatureId]: {
            events: detail?.events ?? prev[candidatureId]?.events ?? [],
            allowedTransitions: transitions ?? prev[candidatureId]?.allowedTransitions ?? null,
            documents: detail?.documents ?? prev[candidatureId]?.documents ?? [],
          },
        }))
      }

      // If file upload failed but the status PATCH was either already done
      // (retry path) or just succeeded, keep the dialog open so the user
      // can retry the upload alone.
      if (fileUploadFailed) {
        setTransitionFileError('Le fichier n\'a pas pu être uploadé. Vous pouvez réessayer ou fermer la boîte de dialogue.')
        toast.warning(transitionStatusApplied
          ? 'Nouvelle tentative d\u2019upload échouée'
          : 'Statut changé, mais l\u2019upload du fichier a échoué')
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
  }, [transitionDialog, transitionNotes, transitionSkipReason, transitionFile, transitionSendEmail, transitionSkipEmailReason, transitionIncludeReason, transitionEmailBody, transitionHasEmailTemplate, transitionAboroDate, transitionStatusApplied, setCandidatures, setEvents, setAllowedTransitions, setCandidatureDataMap])

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
