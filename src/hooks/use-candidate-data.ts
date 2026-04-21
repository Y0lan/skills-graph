import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export interface CandidateDetail {
  id: string
  name: string
  role: string
  roleId: string | null
  email: string | null
  telephone: string | null
  pays: string | null
  linkedinUrl: string | null
  githubUrl: string | null
  hasCv: boolean
  canal: string | null
  createdAt: string
  expiresAt: string
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  submittedAt: string | null
  aiReport: string | null
  notes: string | null
  extractionStatus?: 'idle' | 'running' | 'succeeded' | 'partial' | 'failed'
  extractionAttempts?: number
  lastExtractionAt?: string | null
  lastExtractionError?: string | null
  promptVersion?: number
  aiProfile?: Record<string, unknown> | null
  aiSuggestions?: Record<string, number> | null
  photoUrl?: string | null
}

export interface TeamAggregate {
  members: { slug: string; categoryAverages: Record<string, number>; skillRatings?: Record<string, number> }[]
}

export interface CategoryInfo {
  id: string
  label: string
  skills: { id: string; label: string }[]
}

export interface CandidatureInfo {
  id: string
  candidateId: string
  posteId: string
  posteTitre: string
  postePole: string
  statut: string
  canal: string
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  softSkillAlerts: { trait: string; value: number; threshold: number; message: string }[] | null
  tauxGlobal: number | null
  notesDirecteur: string | null
  createdAt: string
}

export interface CandidatureEvent {
  id: number
  type: string
  statutFrom: string | null
  statutTo: string | null
  notes: string | null
  contentMd: string | null
  emailSnapshot: string | null
  createdBy: string
  createdAt: string
}

export interface CandidatureDocument {
  id: string
  type: string
  filename: string
  display_filename?: string | null
  uploaded_by: string
  created_at: string
  scan_status?: 'pending' | 'clean' | 'infected' | 'error' | 'skipped'
  scanned_at?: string
  deleted_at?: string | null
  size_bytes?: number | null
}

export interface AboroProfile {
  traits: Record<string, Record<string, number>>
  talent_cloud: Record<string, string>
  talents: string[]
  axes_developpement: string[]
  matrices?: { dimension: string; naturel: string; mobilisable: string }[]
}

export interface AllowedTransitions {
  allowedTransitions: string[]
  skipTransitions: { statut: string; skipped: string[] }[]
  notesRequired: string[]
}

export interface BonusSkill {
  skillId: string
  skillLabel: string
  categoryLabel: string
  score: number
}

export interface MultiPosteEntry {
  posteId: string
  posteTitre: string
  tauxPoste: number
}

/** Per-candidature data: events, transitions, documents */
export interface CandidatureData {
  events: CandidatureEvent[]
  allowedTransitions: AllowedTransitions | null
  documents: CandidatureDocument[]
}

export interface UseCandidateDataReturn {
  candidate: CandidateDetail | null
  setCandidate: React.Dispatch<React.SetStateAction<CandidateDetail | null>>
  teamData: TeamAggregate | null
  categories: CategoryInfo[]
  loading: boolean
  candidatures: CandidatureInfo[]
  setCandidatures: React.Dispatch<React.SetStateAction<CandidatureInfo[]>>
  /** @deprecated Use candidatureDataMap instead for per-candidature events */
  events: CandidatureEvent[]
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>
  documents: CandidatureDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>
  aboroProfile: AboroProfile | null
  setAboroProfile: React.Dispatch<React.SetStateAction<AboroProfile | null>>
  allowedTransitions: AllowedTransitions | null
  setAllowedTransitions: React.Dispatch<React.SetStateAction<AllowedTransitions | null>>
  multiPosteCompatibility: MultiPosteEntry[]
  bonusSkills: BonusSkill[]
  notes: string
  setNotes: React.Dispatch<React.SetStateAction<string>>
  candidatureDataMap: Record<string, CandidatureData>
  setCandidatureDataMap: React.Dispatch<React.SetStateAction<Record<string, CandidatureData>>>
}

export function useCandidateData(candidateId: string | undefined): UseCandidateDataReturn {
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [teamData, setTeamData] = useState<TeamAggregate | null>(null)
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [candidatures, setCandidatures] = useState<CandidatureInfo[]>([])
  const [events, setEvents] = useState<CandidatureEvent[]>([])
  const [aboroProfile, setAboroProfile] = useState<AboroProfile | null>(null)
  const [allowedTransitions, setAllowedTransitions] = useState<AllowedTransitions | null>(null)
  const [documents, setDocuments] = useState<CandidatureDocument[]>([])
  const [multiPosteCompatibility, setMultiPosteCompatibility] = useState<MultiPosteEntry[]>([])
  const [bonusSkills, setBonusSkills] = useState<BonusSkill[]>([])
  const [candidatureDataMap, setCandidatureDataMap] = useState<Record<string, CandidatureData>>({})

  useEffect(() => {
    if (!candidateId) return
    Promise.all([
      fetch(`/api/candidates/${candidateId}`).then(r => r.ok ? r.json() : null),
      fetch('/api/aggregates').then(r => r.ok ? r.json() : null),
      fetch('/api/catalog').then(r => r.ok ? r.json() : null),
    ]).then(([cand, team, catalog]) => {
      setCandidate(cand)
      setTeamData(team)
      setCategories(catalog?.categories ?? [])
      setNotes(cand?.notes ?? '')
    }).finally(() => setLoading(false))

    // Fetch Aboro profile
    fetch(`/api/recruitment/candidates/${candidateId}/aboro`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.profile) setAboroProfile(data.profile) })
      .catch((err) => {
        console.error('[Fetch] Error:', err)
        toast.error('Erreur de chargement')
      })

    // Fetch candidatures for this candidate
    fetch(`/api/recruitment/candidatures?candidateId=${encodeURIComponent(candidateId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((mine: CandidatureInfo[]) => {
        setCandidatures(mine)
        if (mine.length > 0) {
          // Fetch events + transitions + documents for ALL candidatures
          Promise.all(
            mine.map(c =>
              Promise.all([
                fetch(`/api/recruitment/candidatures/${c.id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
                fetch(`/api/recruitment/candidatures/${c.id}/transitions`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
                fetch(`/api/recruitment/candidatures/${c.id}/documents`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
              ]).then(([detail, transitions, docs]) => ({
                candidatureId: c.id,
                detail,
                transitions,
                docs,
              }))
            )
          ).then(results => {
            const dataMap: Record<string, CandidatureData> = {}
            for (const r of results) {
              dataMap[r.candidatureId] = {
                events: r.detail?.events ?? [],
                allowedTransitions: r.transitions ?? null,
                documents: r.docs ?? [],
              }
            }
            setCandidatureDataMap(dataMap)

            // Keep backward-compat: set flat state from first candidature
            const first = results[0]
            if (first) {
              if (first.detail?.events) setEvents(first.detail.events)
              if (first.detail?.multiPosteCompatibility) setMultiPosteCompatibility(first.detail.multiPosteCompatibility)
              if (first.detail?.bonusSkills) setBonusSkills(first.detail.bonusSkills)
              if (first.transitions) setAllowedTransitions(first.transitions)
              setDocuments(first.docs ?? [])
            }
          })
        }
      })
      .catch((err) => {
        console.error('[Fetch] Error:', err)
        toast.error('Erreur de chargement')
      })
  }, [candidateId])

  return {
    candidate,
    setCandidate,
    teamData,
    categories,
    loading,
    candidatures,
    setCandidatures,
    events,
    setEvents,
    documents,
    setDocuments,
    aboroProfile,
    setAboroProfile,
    allowedTransitions,
    setAllowedTransitions,
    multiPosteCompatibility,
    bonusSkills,
    notes,
    setNotes,
    candidatureDataMap,
    setCandidatureDataMap,
  }
}
