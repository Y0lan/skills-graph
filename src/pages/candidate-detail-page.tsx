import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AppHeader from '@/components/app-header'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import ExtractionStatusBanner from '@/components/recruit/extraction-status-banner'
import CandidateProfileCard, { type AiProfile } from '@/components/recruit/candidate-profile-card'
import CandidateIdentityStrip from '@/components/recruit/candidate-identity-strip'
import CandidatureSwitcher from '@/components/recruit/candidature-switcher'
import CandidateApplicationMessage from '@/components/recruit/candidate-application-message'
import CandidateTagsBar from '@/components/recruit/candidate-tags-bar'
import CandidaturePosteHeader from '@/components/recruit/candidature-poste-header'
import CandidatureWorkspace from '@/components/recruit/candidature-workspace'
import CandidateStickyHeader from '@/components/recruit/candidate-sticky-header'
import ConfirmDialog from '@/components/recruit/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Loader2, Sparkles, AlertTriangle, Mail, AlertCircle, Upload, X, Calendar, FileText, Wand2, Eye } from 'lucide-react'
import { STATUT_LABELS } from '@/lib/constants'
import { useCandidateData } from '@/hooks/use-candidate-data'
import { useCandidatureEventStream } from '@/hooks/use-candidature-event-stream'
import { useTransitionState } from '@/hooks/use-transition-state'
import { useNavigate } from 'react-router-dom'
import { authClient } from '@/lib/auth-client'
import { findMember } from '@/data/team-roster'

function AiInstructionBar({
  value,
  onChange,
  onApply,
  onCancel,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  onApply: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border border-primary/30 bg-primary/5">
      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-1.5" />
      <Textarea
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && value.trim() && !loading) {
            e.preventDefault()
            onApply()
          }
        }}
        placeholder="Demandez à l'IA de modifier le mail (ex : rends le ton plus chaleureux, ajoute qu'on revient vers lui sous 48h…)"
        rows={2}
        className="text-xs resize-none flex-1"
        disabled={loading}
        autoFocus
      />
      <div className="flex flex-col gap-1 shrink-0">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={onApply}
          disabled={loading || !value.trim()}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Appliquer'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={onCancel}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </div>
  )
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    candidate, setCandidate,
    teamData,
    categories,
    loading,
    candidatures, setCandidatures,
    events, setEvents,
    documents, setDocuments,
    aboroProfile, setAboroProfile,
    allowedTransitions, setAllowedTransitions,
    multiPosteCompatibility,
    bonusSkills,
    notes, setNotes,
    candidatureDataMap,
    setCandidatureDataMap,
  } = useCandidateData(id)

  const {
    changingStatus,
    transitionDialog,
    transitionNotes, setTransitionNotes,
    transitionSkipReason, setTransitionSkipReason,
    transitionFile, setTransitionFile,
    transitionSendEmail, setTransitionSendEmail,
    transitionSkipEmailReason, setTransitionSkipEmailReason,
    transitionIncludeReason, setTransitionIncludeReason,
    transitionEmailSubject,
    transitionEmailBody, setTransitionEmailBody,
    transitionEmailExpanded, setTransitionEmailExpanded,
    transitionShowMarkdownPreview, setTransitionShowMarkdownPreview,
    transitionAboroDate, setTransitionAboroDate,
    transitionHasEmailTemplate,
    transitionEmailLoading,
    transitionFileError,
    openTransitionDialog,
    closeTransitionDialog,
    confirmTransition,
  } = useTransitionState(allowedTransitions, setCandidatures, setEvents, setAllowedTransitions, setCandidatureDataMap)

  const [analyzing, setAnalyzing] = useState(false)
  const [reextracting, setReextracting] = useState(false)
  const [revertingStatus, setRevertingStatus] = useState<string | null>(null)
  const [sendingNow, setSendingNow] = useState<string | null>(null)

  // Confirm dialogs (replacement for native window.confirm — accessible,
  // styled, focus-trapped). Each action type owns its own pending state
  // so we don't conflate a "revert in progress" with an "unconfirmed
  // send-now" in the same boolean.
  const [pendingRevert, setPendingRevert] = useState<{ candidatureId: string; emailState: 'sent' | 'scheduled' | 'none' } | null>(null)
  const [pendingSendNow, setPendingSendNow] = useState<string | null>(null)
  // v5.1: bumped by the SSE handler when `stage_data_changed` fires for
  // the selected candidature. Forwarded through the workspace down to
  // <StageFiche> + <NextCriticalFactPill> to invalidate their fetches.
  const [stageDataRefetchSignal, setStageDataRefetchSignal] = useState<number>(0)

  // Profile disclosure state is stored PER candidate so the recruiter's
  // "I want to see the full dossier" decision doesn't bleed from one
  // person to the next. A one-time migration seeds the per-candidate key
  // from the legacy global key so folks who had it open before the change
  // keep their preference.
  const profileStorageKey = candidate ? `candidate-profile-expanded:${candidate.id}` : null
  const [profileExpanded, setProfileExpanded] = useState<boolean>(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !profileStorageKey) return
    const perCandidate = localStorage.getItem(profileStorageKey)
    if (perCandidate === 'true' || perCandidate === 'false') {
      setProfileExpanded(perCandidate === 'true')
      return
    }
    // No per-candidate entry yet. Seed from the legacy global flag once so
    // existing users aren't surprised by a fresh-collapse after deploy.
    const legacy = localStorage.getItem('candidate-profile-expanded')
    const initial = legacy === 'true'
    setProfileExpanded(initial)
    localStorage.setItem(profileStorageKey, String(initial))
  }, [profileStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !profileStorageKey) return
    localStorage.setItem(profileStorageKey, String(profileExpanded))
  }, [profileExpanded, profileStorageKey])

  // Current recruiter identity — used by the quick-note composer to render
  // its own avatar next to the textarea. Authoritative creator lookup is
  // performed server-side; this is purely cosmetic.
  const { data: session } = authClient.useSession()
  const currentUserSlug = (session?.user?.slug as string | undefined) ?? 'unknown'
  const currentUserName = useMemo(() => {
    const member = findMember(currentUserSlug)
    return member?.name ?? (session?.user?.email as string | undefined) ?? null
  }, [currentUserSlug, session?.user?.email])

  // Currently selected candidature id (for multi-candidature candidates).
  // Synced to URL query ?c=<id> via useSearchParams so deep-links work
  // AND the browser back/forward buttons restore the previous selection.
  // Invalid ids get canonicalized once candidatures load.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCandidatureId = searchParams.get('c')
  const setSelectedCandidatureId = useCallback((nextId: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('c', nextId)
      return next
    }, { replace: false })
  }, [setSearchParams])

  // Gmail-style AI edit + HTML preview shared across transition dialog paths.
  const [aiInstructionOpen, setAiInstructionOpen] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false)
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false)
  const [emailPreviewHtml, setEmailPreviewHtml] = useState('')
  const [emailPreviewSubject, setEmailPreviewSubject] = useState('')

  const resetEmailAssistants = useCallback(() => {
    setAiInstructionOpen(false)
    setAiInstruction('')
    setAiLoading(false)
    setEmailPreviewOpen(false)
    setEmailPreviewHtml('')
    setEmailPreviewSubject('')
  }, [])

  const handleApplyAi = useCallback(async () => {
    if (!transitionDialog) return
    const instruction = aiInstruction.trim()
    if (!instruction) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/recruitment/emails/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          candidatureId: transitionDialog.candidatureId,
          statut: transitionDialog.targetStatut,
          currentBody: transitionEmailBody.trim() || undefined,
          instruction,
          contextNote: transitionNotes.trim() || undefined,
          refuseReason: transitionDialog.targetStatut === 'refuse' ? transitionNotes.trim() : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const { bodyMarkdown } = (await res.json()) as { bodyMarkdown: string }
      setTransitionEmailBody(bodyMarkdown)
      setAiInstruction('')
      setAiInstructionOpen(false)
      toast.success("Email mis à jour par l'IA — relisez avant d'envoyer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur IA')
    } finally {
      setAiLoading(false)
    }
  }, [transitionDialog, aiInstruction, transitionEmailBody, transitionNotes, setTransitionEmailBody])

  const handleOpenPreview = useCallback(async () => {
    if (!transitionDialog) return
    setEmailPreviewLoading(true)
    setEmailPreviewOpen(true)
    setEmailPreviewHtml('')
    try {
      const res = await fetch('/api/recruitment/emails/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          candidatureId: transitionDialog.candidatureId,
          statut: transitionDialog.targetStatut,
          customBody: transitionEmailBody.trim() || undefined,
          notes: transitionNotes.trim() || undefined,
          includeReasonInEmail: transitionIncludeReason,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const { subject, html } = (await res.json()) as { subject: string; html: string }
      setEmailPreviewSubject(subject)
      setEmailPreviewHtml(html)
    } catch (err) {
      setEmailPreviewOpen(false)
      toast.error(err instanceof Error ? err.message : 'Erreur aperçu')
    } finally {
      setEmailPreviewLoading(false)
    }
  }, [transitionDialog, transitionEmailBody, transitionNotes, transitionIncludeReason])

  // Effective selected candidature id: the URL/state value if it still
  // matches a loaded candidature, otherwise fall back to the first one.
  // This is also the id we subscribe to for SSE updates.
  const effectiveSelectedId = (() => {
    if (selectedCandidatureId && candidatures.some(c => c.id === selectedCandidatureId)) {
      return selectedCandidatureId
    }
    return candidatures[0]?.id ?? null
  })()

  // Canonicalize an invalid ?c=<id> once candidatures have loaded. If
  // the URL carries an id that doesn't exist (typo, stale bookmark,
  // deleted candidature), strip it so the URL matches what's actually
  // rendered. Runs once per candidatures change; uses replace to avoid
  // polluting history with the invalid state.
  useEffect(() => {
    if (!selectedCandidatureId) return
    if (candidatures.length === 0) return
    if (candidatures.some(c => c.id === selectedCandidatureId)) return
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('c')
      return next
    }, { replace: true })
  }, [selectedCandidatureId, candidatures, setSearchParams])

  // Subscribe to the SELECTED candidature's SSE stream (was: first
  // candidature only). When the user switches candidatures in the
  // workspace switcher, the hook's internal cleanup tears down the
  // previous stream and opens a new one. Handlers receive the
  // subscribed candidatureId as the first argument — we key every
  // state update by THAT id (never by the outer-scope effectiveSelectedId
  // closure), so a late event from the previous stream can't
  // accidentally mutate the newly-selected candidature.
  useCandidatureEventStream(effectiveSelectedId ?? undefined, {
    onDocumentScanUpdated: (subscribedId, p) => {
      const nextStatus = p.scanStatus as 'pending' | 'clean' | 'infected' | 'error' | 'skipped'
      // Update the per-candidature map (authoritative for the rail +
      // workspace) AND the flat state (backward compat for anything
      // still reading it).
      setCandidatureDataMap(prev => {
        const entry = prev[subscribedId]
        if (!entry) return prev
        return {
          ...prev,
          [subscribedId]: {
            ...entry,
            documents: entry.documents.map(d => d.id === p.documentId ? { ...d, scan_status: nextStatus } : d),
          },
        }
      })
      setDocuments(prev => prev.map(d => d.id === p.documentId
        ? { ...d, scan_status: nextStatus }
        : d))
    },
    onStatusChanged: (subscribedId, p) => {
      // Update candidatures list (source of truth for statut).
      setCandidatures(prev => prev.map(c => c.id === subscribedId
        ? { ...c, statut: p.statutTo }
        : c))
      // Refresh events + transitions + documents for this candidature so
      // the rail's revert-window, the actions column, the documents
      // slot checklist, and the history all stay in sync after an
      // auto-advance fired outside this tab (typical case: the candidate
      // submitted their Skill Radar). NOTE: the detail endpoint returns
      // events but NOT documents — we fetch `/documents` explicitly.
      // Matches the pattern in use-transition-state.ts.
      Promise.all([
        fetch(`/api/recruitment/candidatures/${subscribedId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch(`/api/recruitment/candidatures/${subscribedId}/transitions`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch(`/api/recruitment/candidatures/${subscribedId}/documents`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]).then(([detail, transitions, freshDocs]) => {
        setCandidatureDataMap(prev => {
          const entry = prev[subscribedId] ?? { events: [], allowedTransitions: null, documents: [] }
          return {
            ...prev,
            [subscribedId]: {
              events: detail?.events ?? entry.events,
              allowedTransitions: transitions ?? entry.allowedTransitions,
              documents: Array.isArray(freshDocs) ? freshDocs : entry.documents,
            },
          }
        })
        // Flat-state sync for the currently selected candidature only.
        if (detail?.events && subscribedId === effectiveSelectedId) setEvents(detail.events)
        if (transitions && subscribedId === effectiveSelectedId) setAllowedTransitions(transitions)
        if (Array.isArray(freshDocs) && subscribedId === effectiveSelectedId) setDocuments(freshDocs)
      }).catch(() => { /* non-fatal */ })
    },
    onStageDataChanged: (subscribedId) => {
      // Only the selected candidature actually has fiche components
      // mounted. For others the bump is harmless — they'll refetch on
      // mount when the user switches into them.
      if (subscribedId === effectiveSelectedId) {
        setStageDataRefetchSignal(s => s + 1)
      }
    },
    onCanalChanged: (subscribedId, p) => {
      // Update the candidatures list so the page-level header
      // (CandidaturePosteHeader → CanalToggle) re-derives priorNonCabinet
      // from the fresh canal value. Without this, a stale tab\'s
      // optimistic state could overwrite a newer canal value with its
      // old fallback (codex post-deploy P2).
      setCandidatures(prev => prev.map(c => c.id === subscribedId
        ? { ...c, canal: p.canalTo }
        : c))
    },
  })

  // Refresh candidate + candidatures on window focus. The SSE stream only
  // covers the SELECTED candidature, so an unselected candidature can go
  // stale if the recruiter returns to the tab after an auto-advance (e.g.
  // the candidate submitted their Skill Radar while this tab was in the
  // background). Cheap global safety net.
  useEffect(() => {
    if (!id) return
    const onFocus = () => {
      fetch(`/api/recruitment/candidatures?candidateId=${encodeURIComponent(id)}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((fresh: typeof candidatures | null) => {
          if (Array.isArray(fresh)) setCandidatures(fresh)
        })
        .catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [id, setCandidatures])

  const handleRevertStatus = useCallback((candidatureId: string, emailState: 'sent' | 'scheduled' | 'none') => {
    // Queue the revert in pending state so ConfirmDialog can ask the
    // recruiter before we hit the backend. The actual revert work is in
    // `confirmRevertStatus` below; we separate the two so the UI stays
    // responsive while the dialog is open.
    setPendingRevert({ candidatureId, emailState })
  }, [])

  const confirmRevertStatus = useCallback(async () => {
    if (!pendingRevert) return
    const { candidatureId } = pendingRevert
    setPendingRevert(null)
    setRevertingStatus(candidatureId)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/revert-status`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const { statut } = await res.json() as { statut: string }
      setCandidatures(prev => prev.map(c => c.id === candidatureId ? { ...c, statut } : c))
      // Refresh events + transitions for this candidature
      const [detail, transitions] = await Promise.all([
        fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/recruitment/candidatures/${candidatureId}/transitions`, { credentials: 'include' }).then(r => r.json()),
      ])
      if (detail?.events) setEvents(detail.events)
      if (transitions) setAllowedTransitions(transitions)
      setCandidatureDataMap(prev => ({
        ...prev,
        [candidatureId]: {
          events: detail?.events ?? prev[candidatureId]?.events ?? [],
          allowedTransitions: transitions ?? prev[candidatureId]?.allowedTransitions ?? null,
          documents: detail?.documents ?? prev[candidatureId]?.documents ?? [],
        },
      }))
      toast.success(`Transition annulée — retour à ${statut}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setRevertingStatus(null)
    }
  }, [pendingRevert, setCandidatures, setEvents, setAllowedTransitions, setCandidatureDataMap])

  const handleSendNow = useCallback((candidatureId: string) => {
    setPendingSendNow(candidatureId)
  }, [])

  const confirmSendNow = useCallback(async () => {
    const candidatureId = pendingSendNow
    if (!candidatureId) return
    setPendingSendNow(null)
    setSendingNow(candidatureId)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/email/send-now`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // Refresh events so the timeline swaps email_scheduled → email_sent.
      const detail = await fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json())
      if (detail?.events) setEvents(detail.events)
      setCandidatureDataMap(prev => ({
        ...prev,
        [candidatureId]: {
          events: detail?.events ?? prev[candidatureId]?.events ?? [],
          allowedTransitions: prev[candidatureId]?.allowedTransitions ?? null,
          documents: detail?.documents ?? prev[candidatureId]?.documents ?? [],
        },
      }))
      toast.success('Email envoyé')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSendingNow(null)
    }
  }, [pendingSendNow, setEvents, setCandidatureDataMap])

  // Wrap openTransitionDialog to inject candidate name & role & currentStatut
  // and the evaluationUrl for transitions that link the candidate to the
  // skill-radar form (otherwise the email body shows "[Commencer](#)").
  const handleOpenTransition = useCallback((candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], currentStatut?: string) => {
    const evaluationUrl = targetStatut === 'skill_radar_envoye' && candidate?.id
      ? `${window.location.origin}/evaluate/${candidate.id}`
      : undefined
    openTransitionDialog(
      candidatureId,
      targetStatut,
      isSkip,
      skipped,
      candidate?.name ?? '',
      candidate?.role ?? '',
      currentStatut,
      evaluationUrl,
    )
  }, [openTransitionDialog, candidate])

  // Fetch sibling candidates for prev/next navigation. Side effects in a
  // `useState` initializer are wrong in React — Strict Mode can call
  // initializers twice, the closure captures stale state, and there is no
  // cleanup path. This is the proper effect with an AbortController so a
  // tab switch doesn't race with a mount unmount and call setState on a
  // torn-down component.
  const [siblings, setSiblings] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/candidates', { credentials: 'include', signal: ac.signal })
      .then(r => r.ok ? r.json() : [])
      .then((all: unknown) => {
        if (ac.signal.aborted) return
        if (Array.isArray(all)) setSiblings(all as { id: string; name: string }[])
      })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return
        console.error('Failed to load sibling candidates:', err)
      })
    return () => ac.abort()
  }, [])
  const currentIndex = siblings.findIndex(c => c.id === id)
  const prevCandidate = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const nextCandidate = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null

  const generateAnalysis = useCallback(async () => {
    if (!id) return
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/candidates/${id}/analyze`, { method: 'POST' })
      if (!res.ok) throw new Error('Erreur lors de l\'analyse')
      const data = await res.json()
      setCandidate(prev => prev ? { ...prev, aiReport: data.report } : null)
      toast.success('Analyse generee')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setAnalyzing(false)
    }
  }, [id, setCandidate])

  // File drop handler for the transition dialog
  const handleFileDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) setTransitionFile(file)
  }, [setTransitionFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setTransitionFile(file)
  }, [setTransitionFile])

  // Gap analysis: where candidate fills team gaps (memoized)
  const gapAnalysis = useMemo(() => {
    if (!candidate) return []
    return categories.flatMap(cat =>
      cat.skills.map(skill => {
        const candidateScore = candidate.ratings[skill.id] ?? 0
        if (candidateScore === 0) return null
        const memberScores = teamData?.members?.map(m => {
          return m.skillRatings?.[skill.id] ?? 0
        }) ?? []
        const validScores = memberScores.filter(v => v > 0)
        const teamAvg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0
        const gap = candidateScore - teamAvg
        return { skill: skill.label, category: cat.label, candidateScore, teamAvg: Math.round(teamAvg * 10) / 10, gap: Math.round(gap * 10) / 10 }
      }).filter(Boolean)
    ).sort((a, b) => (b?.gap ?? 0) - (a?.gap ?? 0))
  }, [candidate, categories, teamData])

  const topSkills = useMemo(() => {
    if (!candidate) return []
    const source =
      (candidate.ratings && Object.keys(candidate.ratings).length > 0)
        ? candidate.ratings
        : (candidate.aiSuggestions ?? {})
    if (!source || Object.keys(source).length === 0) return []
    const labelById = new Map<string, string>()
    categories.forEach(cat => cat.skills.forEach(s => labelById.set(s.id, s.label)))
    return Object.entries(source)
      .filter(([, rating]) => rating > 0)
      .map(([skillId, rating]) => ({
        skillId,
        skillLabel: labelById.get(skillId) ?? skillId,
        rating,
      }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5)
  }, [candidate, categories])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">Candidat introuvable</h1>
            <Link to="/recruit" className="mt-4 inline-block text-primary underline">
              Retour au recrutement
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Compute category-level averages for radar
  const candidateRadar: RadarDataPoint[] = categories.map(cat => {
    const skills = cat.skills.map(s => candidate.ratings[s.id] ?? 0)
    const rated = skills.filter(v => v > 0)
    return {
      label: cat.label.replace(/&/g, '\n&'),
      value: rated.length > 0 ? rated.reduce((a, b) => a + b, 0) / rated.length : 0,
      fullMark: 5,
    }
  })

  const teamRadar: RadarDataPoint[] = categories.map(cat => {
    if (!teamData?.members?.length) return { label: cat.label, value: 0, fullMark: 5 }
    const memberAvgs = teamData.members.map(m => m.categoryAverages?.[cat.id] ?? 0)
    const validAvgs = memberAvgs.filter(v => v > 0)
    return {
      label: cat.label.replace(/&/g, '\n&'),
      value: validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0,
      fullMark: 5,
    }
  })

  const isPending = !candidate.submittedAt

  const showEmailSection = transitionDialog &&
    transitionDialog.targetStatut !== 'skill_radar_complete' &&
    (transitionHasEmailTemplate || transitionEmailLoading)

  // Resolve the currently selected candidature object from the effective id.
  // DO NOT cross-candidature-fallback to the flat state. The flat
  // `events`/`documents`/`allowedTransitions` come from candidatures[0]
  // for backward compatibility — falling back when the SELECTED
  // candidature's map entry is missing would render (and worse: revert /
  // send against) the WRONG candidature's data. Only fall back to the
  // flat state when the selected IS candidatures[0].
  const selectedCandidature = candidatures.find(c => c.id === effectiveSelectedId) ?? null
  const selectedCData = selectedCandidature && candidatureDataMap
    ? candidatureDataMap[selectedCandidature.id]
    : null
  const isSelectedFirst = selectedCandidature && candidatures[0]?.id === selectedCandidature.id
  const selectedEvents = selectedCData?.events ?? (isSelectedFirst ? events : [])
  const selectedDocuments = selectedCData?.documents ?? (isSelectedFirst ? documents : [])
  const selectedTransitions = selectedCData?.allowedTransitions ?? (isSelectedFirst ? allowedTransitions : null)
  const selectedIsHydrating = !!selectedCandidature && !selectedCData && !isSelectedFirst

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {/* Sticky compact header that slides in once the identity strip has
          scrolled off. Primary CTA is derived from allowedTransitions so a
          terminal candidate or one awaiting the candidate never shows a
          dead button. Respects prefers-reduced-motion via the component. */}
      <CandidateStickyHeader
        candidateName={candidate.name}
        candidature={selectedCandidature}
        allowedTransitions={selectedTransitions}
        changingStatus={changingStatus}
        onOpenTransition={(candidatureId, targetStatut, currentStatut) =>
          handleOpenTransition(candidatureId, targetStatut, false, [], currentStatut)
        }
      />
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-8">
        {/* ── BACK + NAVIGATION ── */}
        <div className="flex items-center justify-between mb-4">
          <Link to="/recruit" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          {siblings.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!prevCandidate}
                onClick={() => prevCandidate && navigate(`/recruit/${prevCandidate.id}`)}
                className="gap-1 h-7 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">{prevCandidate?.name ?? 'Prec.'}</span>
              </Button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {currentIndex + 1}/{siblings.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!nextCandidate}
                onClick={() => nextCandidate && navigate(`/recruit/${nextCandidate.id}`)}
                className="gap-1 h-7 px-2"
              >
                <span className="text-xs hidden sm:inline">{nextCandidate?.name ?? 'Suiv.'}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* ══════════ ABOVE THE FOLD ══════════ */}

        {/* Identity hero — avatar + name + contact + top skills + meta. */}
        <CandidateIdentityStrip
          candidate={candidate}
          candidatures={candidatures}
          topSkills={topSkills}
          onToggleProfile={candidate.aiProfile ? () => setProfileExpanded(v => !v) : undefined}
          profileExpanded={profileExpanded}
        />

        {/* v5.3 tags bar — lives at the candidate level so labels survive
            multi-poste applications. Used for "rappeler-2027",
            "ex-CIO", "talent-pool", etc. */}
        {candidate.id && (
          <div className="mb-3">
            <CandidateTagsBar candidateId={candidate.id} />
          </div>
        )}

        {/* v5.1.x A.3 (re-positioned per codex /design-review):
            MESSAGE DU CANDIDAT lives at the TOP, between the
            tags bar and the profile-card disclosure — visible in
            the 5-second scan, never lost between operational rails. */}
        {candidate && (
          <CandidateApplicationMessage
            notes={candidate.notes ?? null}
            filterPosteTitre={selectedCandidature?.posteTitre ?? ''}
          />
        )}

        {/* v5.2 (post-design-review): candidature posture header lifted
            from inside <CandidatureWorkspace> to here, so the recruiter
            sees "Dev Java Senior · Postulé · sinapse.nc · 24/04 · YM
            Activité il y a 3 j" within the first viewport. The
            workspace below keeps the operational rails (DOSSIER,
            command bar, scores, historique). */}
        {selectedCandidature && (
          <CandidaturePosteHeader
            candidature={selectedCandidature}
            isPending={!candidate.submittedAt}
            submitted={!!candidate.submittedAt}
            analysed={!!candidate.submittedAt && !!candidate.aiReport}
            events={selectedEvents}
            stageDataRefetchSignal={stageDataRefetchSignal}
          />
        )}

        {/* Full LinkedIn-style profile card — lives RIGHT UNDER the
            identity strip as a disclosure so it's easy to find but
            doesn't clutter the scan. The id matches `aria-controls` on
            the toggle in CandidateIdentityStrip so screen readers can
            navigate the disclosure properly. */}
        {candidate.aiProfile && profileExpanded && (
          <div className="mb-6" id="candidate-profile-disclosure">
            <CandidateProfileCard
              candidateId={candidate.id}
              profile={candidate.aiProfile as unknown as AiProfile}
              topSkills={topSkills}
              compact
            />
          </div>
        )}

        {/* CV extraction status banner — inline under the identity strip,
            only when the extraction is in a non-trivial state. */}
        {candidate.extractionStatus && candidate.extractionStatus !== 'idle' && candidate.extractionStatus !== 'succeeded' ? (
          <div className="mb-6">
            <ExtractionStatusBanner
              status={candidate.extractionStatus}
              attempts={candidate.extractionAttempts}
              lastError={candidate.lastExtractionError}
              lastExtractionAt={candidate.lastExtractionAt}
              canRetry={candidate.canRetryExtraction ?? true}
              retrying={reextracting}
              onRetry={async () => {
                setReextracting(true)
                try {
                  const res = await fetch(`/api/recruitment/candidates/${candidate.id}/reextract`, {
                    method: 'POST',
                    credentials: 'include',
                  })
                  const body = await res.json()
                  if (!res.ok) {
                    toast.error(body.error ?? `HTTP ${res.status}`)
                  } else {
                    toast.success(`Extraction ${body.status}`)
                    setTimeout(() => window.location.reload(), 800)
                  }
                } finally {
                  setReextracting(false)
                }
              }}
            />
          </div>
        ) : null}

        {/* Candidatures switcher — only renders when candidate has ≥2
            candidatures. Collapses what used to be N stacked cards into a
            single dense row selector. */}
        {candidatures.length >= 2 && (
          <CandidatureSwitcher
            candidatures={candidatures}
            selectedId={effectiveSelectedId ?? ''}
            isPendingRadar={(c) => isPending && c.statut === 'skill_radar_envoye'}
            onSelect={setSelectedCandidatureId}
          />
        )}

        {/* v5.1.x A.3 — Hoisted from inside <CandidatureWorkspace>. The
            (MESSAGE DU CANDIDAT relocated to top-of-page above the
            profile card — see the placement note next to the tags
            bar.) */}

        {/* Empty state: candidate with no candidature (manual create). */}
        {candidatures.length === 0 && (
          <div className="border rounded-md p-8 text-center text-sm text-muted-foreground mb-6">
            Ce candidat n'a encore aucune candidature active.
          </div>
        )}

        {/* 2-column layout: workspace (left) + action rail (right,
            sticky). On narrow viewports the rail falls below the
            workspace — the primary action is also repeated in the
            workspace's status band so the F-pattern scan still works. */}
        {selectedCandidature && selectedIsHydrating && (
          <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Chargement de la candidature…
          </div>
        )}

        {selectedCandidature && !selectedIsHydrating && (
          <CandidatureWorkspace
            /* Key by candidature id so switching remounts the whole
               workspace subtree. Keeps CandidateNotesSection and any
               other component that caches per-candidature state in
               useState(() => initial) from leaking state across
               candidature switches. Cheap — mount cost is small. */
            key={selectedCandidature.id}
            candidature={selectedCandidature}
            candidate={candidate}
            events={selectedEvents}
            setEvents={setEvents}
            documents={selectedDocuments}
            setDocuments={setDocuments}
            setCandidatureDataMap={setCandidatureDataMap}
            notes={notes}
            setNotes={setNotes}
            aboroProfile={aboroProfile}
            setAboroProfile={setAboroProfile}
            allowedTransitions={selectedTransitions}
            candidateRadar={candidateRadar}
            teamRadar={teamRadar}
            gapAnalysis={gapAnalysis}
            bonusSkills={bonusSkills}
            multiPosteCompatibility={multiPosteCompatibility}
            analyzing={analyzing}
            onGenerateAnalysis={generateAnalysis}
            sendingNow={sendingNow}
            revertingStatus={revertingStatus}
            changingStatus={changingStatus}
            onOpenTransition={handleOpenTransition}
            onRevert={handleRevertStatus}
            onSendNow={handleSendNow}
            currentUserSlug={currentUserSlug}
            currentUserName={currentUserName}
            stageDataRefetchSignal={stageDataRefetchSignal}
          />
        )}

        {/* ── TRANSITION DIALOG ──
            Upgraded from size="lg" to size="2xl" and split into two
            columns: left = read-only context the recruiter wants to
            reference while composing (candidate, scores, dossier,
            warnings); right = the form fields. This replaces the
            kitchen-sink single-column layout — now recruiters can see
            scores + doc state while they write the email. */}
        <AlertDialog open={!!transitionDialog} onOpenChange={(open) => { if (!open) { closeTransitionDialog(); resetEmailAssistants() } }}>
          <AlertDialogContent size="2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {transitionDialog?.targetStatut === 'refuse'
                  ? 'Refuser cette candidature ?'
                  : transitionDialog?.targetStatut === 'embauche'
                    ? 'Confirmer l\'embauche ?'
                    : `Passer a : ${STATUT_LABELS[transitionDialog?.targetStatut ?? ''] ?? transitionDialog?.targetStatut}`
                }
              </AlertDialogTitle>
              <AlertDialogDescription>
                {transitionDialog?.isSkip && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mb-2">
                    <AlertCircle className="h-4 w-4" />
                    Vous sautez : {transitionDialog.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')}
                  </span>
                )}
                {transitionDialog?.targetStatut === 'embauche' && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Cette action est definitive.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Mobile context header — shown ONLY below md. The aside
                below is hidden on mobile, so without this compact header
                the recruiter composes an email without any scores or
                dossier indicators to anchor the decision. */}
            {transitionDialog && (() => {
              const tCand = candidatures.find(c => c.id === transitionDialog.candidatureId)
              const tDocs = tCand ? (candidatureDataMap?.[tCand.id]?.documents ?? documents) : []
              const has = (type: string) => tDocs.some(d => d.type === type && !d.deleted_at)
              const current = transitionDialog.currentStatut ?? tCand?.statut ?? ''
              const target = transitionDialog.targetStatut
              return (
                <div className="md:hidden rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1 mb-2">
                  <p className="font-medium text-foreground truncate">{candidate.name}</p>
                  {tCand && <p className="text-muted-foreground truncate">{tCand.posteTitre}</p>}
                  <p className="text-muted-foreground">
                    {STATUT_LABELS[current] ?? current} → <span className="font-medium text-foreground">{STATUT_LABELS[target] ?? target}</span>
                  </p>
                  {tCand && (tCand.tauxGlobal !== null || tCand.tauxPoste !== null || tCand.tauxEquipe !== null) && (
                    <p className="tabular-nums">
                      {tCand.tauxGlobal !== null && <>Global <span className="text-foreground font-medium">{Math.round(tCand.tauxGlobal)}%</span> · </>}
                      {tCand.tauxPoste !== null && <>Poste <span className="text-foreground font-medium">{Math.round(tCand.tauxPoste)}%</span> · </>}
                      {tCand.tauxEquipe !== null && <>Équipe <span className="text-foreground font-medium">{Math.round(tCand.tauxEquipe)}%</span></>}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    CV {has('cv') ? '✓' : '—'} · Lettre {has('lettre') ? '✓' : '—'} · Aboro {has('aboro') ? '✓' : '—'}
                  </p>
                </div>
              )
            })()}

            <div className="py-2 grid gap-5 md:grid-cols-[240px_1fr]">
              {/* LEFT COLUMN — read-only context. The recruiter can glance
                  at the candidate's scores + doc state while composing
                  the email on the right. Rebuilt from the selected
                  candidature; hidden on narrow viewports to keep the
                  dialog usable. */}
              {transitionDialog && (() => {
                const tCand = candidatures.find(c => c.id === transitionDialog.candidatureId)
                const tDocs = tCand ? (candidatureDataMap?.[tCand.id]?.documents ?? documents) : []
                const has = (type: string) => tDocs.some(d => d.type === type && !d.deleted_at)
                const slots = {
                  cv: has('cv'), lettre: has('lettre'), aboro: has('aboro'),
                  others: tDocs.filter(d => !d.deleted_at && !['cv', 'lettre', 'aboro'].includes(d.type)).length,
                }
                return (
                  <aside className="hidden md:flex md:flex-col gap-4 text-xs text-muted-foreground border-r pr-5">
                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-1">Candidat</p>
                      <p className="text-foreground font-medium">{candidate.name}</p>
                      {tCand && <p className="text-muted-foreground">{tCand.posteTitre}</p>}
                    </div>

                    {tCand && (tCand.tauxPoste !== null || tCand.tauxEquipe !== null || tCand.tauxGlobal !== null) && (
                      <div>
                        <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-1">Scores</p>
                        <div className="space-y-0.5 tabular-nums">
                          {tCand.tauxPoste !== null && <p>Poste <span className="float-right text-foreground font-medium">{Math.round(tCand.tauxPoste)}%</span></p>}
                          {tCand.tauxEquipe !== null && <p>Équipe <span className="float-right text-foreground font-medium">{Math.round(tCand.tauxEquipe)}%</span></p>}
                          {tCand.tauxSoft !== null && tCand.tauxSoft !== undefined && <p>Soft <span className="float-right text-foreground font-medium">{Math.round(tCand.tauxSoft)}%</span></p>}
                          {tCand.tauxGlobal !== null && <p>Global <span className="float-right text-foreground font-medium">{Math.round(tCand.tauxGlobal)}%</span></p>}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-1">Dossier</p>
                      <div className="space-y-0.5">
                        <p><span className={slots.cv ? 'text-emerald-600' : 'text-muted-foreground/50'}>{slots.cv ? '✓' : '—'} CV</span></p>
                        <p><span className={slots.lettre ? 'text-emerald-600' : 'text-muted-foreground/50'}>{slots.lettre ? '✓' : '—'} Lettre</span></p>
                        <p><span className={slots.aboro ? 'text-emerald-600' : 'text-muted-foreground/50'}>{slots.aboro ? '✓' : '—'} Aboro</span></p>
                        {slots.others > 0 && <p className="text-muted-foreground">+ {slots.others} autre{slots.others > 1 ? 's' : ''}</p>}
                      </div>
                    </div>

                    {transitionDialog.isSkip && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-amber-600 dark:text-amber-400">
                        <p className="text-[10px] font-semibold uppercase tracking-wide">Attention</p>
                        <p className="mt-0.5 text-[11px] leading-snug">Étapes sautées : {transitionDialog.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')}</p>
                      </div>
                    )}

                    {transitionDialog.targetStatut === 'embauche' && (
                      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-emerald-600 dark:text-emerald-400">
                        <p className="text-[10px] font-semibold uppercase tracking-wide">Définitif</p>
                        <p className="mt-0.5 text-[11px] leading-snug">L'embauche est une action terminale.</p>
                      </div>
                    )}

                    {transitionDialog.targetStatut === 'refuse' && (
                      <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-rose-600 dark:text-rose-400">
                        <p className="text-[10px] font-semibold uppercase tracking-wide">Définitif</p>
                        <p className="mt-0.5 text-[11px] leading-snug">Un email de refus sera envoyé (obligatoire).</p>
                      </div>
                    )}
                  </aside>
                )
              })()}

              {/* RIGHT COLUMN — form fields (unchanged behavior, just
                  hosted in the second grid column). */}
              <div className="space-y-4 min-w-0">
              {/* 1. Email preview section (first -- external consequence) */}
              {showEmailSection && (
                <div className="rounded-lg border">
                  {transitionEmailLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement du modele d'email...
                    </div>
                  ) : transitionHasEmailTemplate && (
                    <>
                      {/* Send-email toggle (hidden for refuse — always sends) */}
                      {transitionDialog?.targetStatut !== 'refuse' && (
                        <label className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 border-b bg-muted/20">
                          <input
                            type="checkbox"
                            checked={transitionSendEmail}
                            onChange={(e) => setTransitionSendEmail(e.target.checked)}
                            className="rounded border-input"
                          />
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium flex-1">Envoyer l'email au candidat</span>
                          {transitionEmailSubject && transitionSendEmail && (
                            <span className="text-muted-foreground truncate text-xs max-w-[55%]">— {transitionEmailSubject}</span>
                          )}
                        </label>
                      )}
                      {/* Skip-reason input when toggle off */}
                      {transitionDialog?.targetStatut !== 'refuse' && !transitionSendEmail && (
                        <div className="p-3 space-y-1">
                          <label htmlFor="skip-email-reason-a" className="text-xs font-medium text-muted-foreground">
                            Raison de ne pas envoyer (10 caractères min, audit-loggée)
                          </label>
                          <Textarea
                            id="skip-email-reason-a"
                            value={transitionSkipEmailReason}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionSkipEmailReason(e.target.value)}
                            placeholder="ex. Email envoyé manuellement hier soir"
                            rows={2}
                            maxLength={500}
                            className="text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground">{transitionSkipEmailReason.length}/500</p>
                        </div>
                      )}
                      {/* For refuse only: keep the separate collapsible header (no send toggle) */}
                      {transitionDialog?.targetStatut === 'refuse' && (
                        <button
                          type="button"
                          onClick={() => setTransitionEmailExpanded(!transitionEmailExpanded)}
                          className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">Email au candidat</span>
                          {transitionEmailSubject && (
                            <span className="text-muted-foreground truncate ml-1 text-xs">— {transitionEmailSubject}</span>
                          )}
                          {transitionEmailExpanded
                            ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground shrink-0" />
                          }
                        </button>
                      )}

                      {/* Expanded content (auto-open when sending) */}
                      {(transitionSendEmail || (transitionDialog?.targetStatut === 'refuse' && transitionEmailExpanded)) && (
                        <div className="px-3 py-3 space-y-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Corps du message</label>
                            <Textarea
                              value={transitionEmailBody}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionEmailBody(e.target.value)}
                              rows={6}
                              className="mt-1 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => setAiInstructionOpen(v => !v)}
                              disabled={aiLoading}
                            >
                              <Wand2 className="h-3 w-3" />
                              Modifier avec l'IA
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={handleOpenPreview}
                              disabled={emailPreviewLoading}
                            >
                              {emailPreviewLoading
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Eye className="h-3 w-3" />}
                              Aperçu HTML
                            </Button>
                          </div>
                          {aiInstructionOpen && (
                            <AiInstructionBar
                              value={aiInstruction}
                              onChange={setAiInstruction}
                              onApply={handleApplyAi}
                              onCancel={() => { setAiInstructionOpen(false); setAiInstruction('') }}
                              loading={aiLoading}
                            />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Email toggle for statuses without templates (non skill_radar_complete) */}
              {transitionDialog?.targetStatut &&
                transitionDialog.targetStatut !== 'skill_radar_complete' &&
                !transitionHasEmailTemplate &&
                !transitionEmailLoading &&
                transitionDialog.targetStatut !== 'refuse' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={transitionSendEmail}
                        onChange={(e) => setTransitionSendEmail(e.target.checked)}
                        className="rounded border-input"
                      />
                      <span className="text-sm">
                        {transitionDialog.targetStatut === 'skill_radar_envoye'
                          ? "Envoyer le lien d'évaluation par email au candidat"
                          : 'Envoyer un email de notification au candidat'}
                      </span>
                    </label>
                    {transitionSendEmail && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setAiInstructionOpen(v => !v)}
                          disabled={aiLoading}
                        >
                          <Wand2 className="h-3 w-3 mr-1" />
                          Modifier avec l'IA
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleOpenPreview}
                          disabled={emailPreviewLoading}
                        >
                          {emailPreviewLoading
                            ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            : <Eye className="h-3 w-3 mr-1" />}
                          Aperçu HTML
                        </Button>
                      </div>
                    )}
                  </div>
                  {transitionSendEmail && aiInstructionOpen && (
                    <AiInstructionBar
                      value={aiInstruction}
                      onChange={setAiInstruction}
                      onApply={handleApplyAi}
                      onCancel={() => { setAiInstructionOpen(false); setAiInstruction('') }}
                      loading={aiLoading}
                    />
                  )}
                  {!transitionSendEmail && (
                    <div>
                      <label htmlFor="skip-email-reason" className="text-xs font-medium text-muted-foreground">
                        Raison de ne pas envoyer (10 caractères min, audit-loggée)
                      </label>
                      <Textarea
                        id="skip-email-reason"
                        value={transitionSkipEmailReason}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionSkipEmailReason(e.target.value)}
                        placeholder="ex. Email envoyé manuellement à Marie hier soir"
                        rows={2}
                        maxLength={500}
                        className="mt-1 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{transitionSkipEmailReason.length}/500</p>
                    </div>
                  )}
                </div>
              )}

              {/* Include reason checkbox for refuse */}
              {transitionDialog?.targetStatut === 'refuse' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transitionIncludeReason}
                    onChange={(e) => setTransitionIncludeReason(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">Inclure le motif dans l'email au candidat</span>
                </label>
              )}

              {/* Skip reason */}
              {transitionDialog?.isSkip && (
                <div>
                  <label className="text-sm font-medium">Raison du saut (obligatoire)</label>
                  <Textarea
                    value={transitionSkipReason}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionSkipReason(e.target.value)}
                    placeholder="Pourquoi sauter cette etape ?"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              )}

              {/* 2. Notes section (markdown) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">
                    Notes internes{' '}
                    {transitionDialog?.notesRequired && (
                      <span className="text-muted-foreground font-normal">(obligatoire)</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setTransitionShowMarkdownPreview(!transitionShowMarkdownPreview)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {transitionShowMarkdownPreview ? 'Editer' : 'Apercu'}
                  </button>
                </div>
                {transitionShowMarkdownPreview ? (
                  <div className="rounded-md border px-3 py-2 min-h-[80px] prose prose-sm dark:prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                    {transitionNotes.trim() ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{transitionNotes}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">Aucune note</p>
                    )}
                  </div>
                ) : (
                  <Textarea
                    value={transitionNotes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionNotes(e.target.value)}
                    placeholder="Notes en markdown..."
                    rows={3}
                  />
                )}
              </div>

              {/* 3. Files section */}
              <div className="space-y-2">
                {/* Aboro date picker */}
                {transitionDialog?.targetStatut === 'aboro' && (
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Date de passage Aboro
                    </label>
                    <Input
                      type="date"
                      value={transitionAboroDate}
                      onChange={(e) => setTransitionAboroDate(e.target.value)}
                      className="mt-1 w-auto"
                    />
                  </div>
                )}

                {/* File drop zone */}
                <div>
                  {transitionFile ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1.5 text-xs py-1 px-2">
                        <FileText className="h-3 w-3" />
                        {transitionFile.name}
                        <button
                          type="button"
                          onClick={() => setTransitionFile(null)}
                          className="ml-1 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    </div>
                  ) : (
                    <label
                      htmlFor="transition-file-input"
                      onDrop={handleFileDrop}
                      onDragOver={(e) => e.preventDefault()}
                      className="block border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors focus-within:ring-2 focus-within:ring-primary/50"
                    >
                      <Upload className="h-4 w-4 mx-auto text-muted-foreground" aria-hidden />
                      <p className="text-xs text-muted-foreground mt-1">
                        Glisser un fichier ou cliquer pour ajouter
                      </p>
                      <input
                        id="transition-file-input"
                        type="file"
                        className="sr-only"
                        onChange={handleFileSelect}
                      />
                    </label>
                  )}
                </div>

                {/* File error */}
                {transitionFileError && (
                  <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{transitionFileError}</span>
                  </div>
                )}
              </div>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={changingStatus}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmTransition}
                disabled={changingStatus}
                className={transitionDialog?.targetStatut === 'refuse' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              >
                {changingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {transitionDialog?.targetStatut === 'refuse' ? 'Refuser' :
                 transitionDialog?.targetStatut === 'embauche' ? 'Confirmer l\'embauche' :
                 'Confirmer'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={emailPreviewOpen} onOpenChange={setEmailPreviewOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="text-base">
                Aperçu — {emailPreviewSubject || 'Email'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Rendu HTML complet, tel que le candidat le recevra (en-tête, pied de page et logo inclus).
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 rounded-md border bg-white overflow-hidden">
              {emailPreviewLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <iframe
                  title="Aperçu de l'email"
                  srcDoc={emailPreviewHtml}
                  className="w-full h-[70vh] bg-white"
                  sandbox=""
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm dialogs replacing native window.confirm(). Focus trap,
            ESC close, and AA-contrast styling come from the base-ui
            AlertDialog primitive. Copy varies by emailState so the
            recruiter reads the exact consequence before confirming. */}
        <ConfirmDialog
          open={!!pendingRevert}
          onOpenChange={(open) => { if (!open) setPendingRevert(null) }}
          title="Annuler la dernière transition ?"
          description={
            pendingRevert?.emailState === 'sent'
              ? "L'email a déjà été envoyé au candidat. L'annulation corrige uniquement l'état interne — elle ne rappelle pas l'email."
              : pendingRevert?.emailState === 'scheduled'
                ? "L'email programmé sera annulé avant envoi, et la candidature reviendra au statut précédent."
                : "La candidature revient au statut précédent. Aucun email n'est envoyé automatiquement."
          }
          confirmLabel="Confirmer l'annulation"
          tone={pendingRevert?.emailState === 'sent' ? 'destructive' : 'default'}
          confirmDisabled={!!revertingStatus}
          onConfirm={() => { void confirmRevertStatus() }}
        />

        <ConfirmDialog
          open={!!pendingSendNow}
          onOpenChange={(open) => { if (!open) setPendingSendNow(null) }}
          title="Envoyer l'email maintenant ?"
          description="Cette action est irréversible — le candidat recevra l'email immédiatement, sans attendre la fin de la fenêtre de 10 minutes."
          confirmLabel="Envoyer maintenant"
          tone="default"
          confirmDisabled={!!sendingNow}
          onConfirm={() => { void confirmSendNow() }}
        />

      </div>
    </div>
  )
}
