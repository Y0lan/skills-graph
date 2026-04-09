import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { STATUT_LABELS } from '@/lib/constants'
import type { AllowedTransitions, CandidatureInfo, CandidatureEvent } from '@/hooks/use-candidate-data'

export interface TransitionDialog {
  candidatureId: string
  targetStatut: string
  isSkip: boolean
  skipped: string[]
  notesRequired: boolean
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
  openTransitionDialog: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[]) => void
  closeTransitionDialog: () => void
  confirmTransition: () => Promise<void>
}

export function useTransitionState(
  allowedTransitions: AllowedTransitions | null,
  setCandidatures: React.Dispatch<React.SetStateAction<CandidatureInfo[]>>,
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>,
  setAllowedTransitions: React.Dispatch<React.SetStateAction<AllowedTransitions | null>>,
): UseTransitionStateReturn {
  const [changingStatus, setChangingStatus] = useState(false)
  const [transitionDialog, setTransitionDialog] = useState<TransitionDialog | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')
  const [transitionSkipReason, setTransitionSkipReason] = useState('')
  const [transitionFile, setTransitionFile] = useState<File | null>(null)
  const [transitionSendEmail, setTransitionSendEmail] = useState(true)

  const openTransitionDialog = useCallback((candidatureId: string, targetStatut: string, isSkip = false, skipped: string[] = []) => {
    const notesRequired = allowedTransitions?.notesRequired?.includes(targetStatut) ?? false
    setTransitionDialog({ candidatureId, targetStatut, isSkip, skipped, notesRequired })
    setTransitionNotes('')
    setTransitionSkipReason('')
    setTransitionFile(null)
    setTransitionSendEmail(true)
  }, [allowedTransitions])

  const closeTransitionDialog = useCallback(() => {
    setTransitionDialog(null)
  }, [])

  const confirmTransition = useCallback(async () => {
    if (!transitionDialog) return
    const { candidatureId, targetStatut, isSkip, notesRequired } = transitionDialog

    if (notesRequired && !transitionNotes.trim()) {
      toast.error('Les notes sont obligatoires pour cette transition')
      return
    }
    if (isSkip && !transitionSkipReason.trim()) {
      toast.error('Raison requise pour sauter une étape')
      return
    }

    setChangingStatus(true)
    try {
      // Upload Aboro document if transitioning to aboro with a file
      if (targetStatut === 'aboro' && transitionFile) {
        const formData = new FormData()
        formData.append('file', transitionFile)
        formData.append('type', 'aboro')
        await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
      }

      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          statut: targetStatut,
          notes: transitionNotes.trim() || undefined,
          skipReason: isSkip ? transitionSkipReason.trim() : undefined,
          sendEmail: targetStatut === 'skill_radar_envoye' ? transitionSendEmail : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur')
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

      toast.success(`Statut changé : ${STATUT_LABELS[targetStatut] ?? targetStatut}`)
      setTransitionDialog(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de statut')
    } finally {
      setChangingStatus(false)
    }
  }, [transitionDialog, transitionNotes, transitionSkipReason, transitionFile, transitionSendEmail, setCandidatures, setEvents, setAllowedTransitions])

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
    openTransitionDialog,
    closeTransitionDialog,
    confirmTransition,
  }
}
