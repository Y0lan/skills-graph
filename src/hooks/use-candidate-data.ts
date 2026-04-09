import { useEffect, useState } from 'react'

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
}

export interface TeamAggregate {
  members: { slug: string; categoryAverages: Record<string, number> }[]
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
  createdBy: string
  createdAt: string
}

export interface CandidatureDocument {
  id: string
  type: string
  filename: string
  uploaded_by: string
  created_at: string
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

export interface UseCandidateDataReturn {
  candidate: CandidateDetail | null
  setCandidate: React.Dispatch<React.SetStateAction<CandidateDetail | null>>
  teamData: TeamAggregate | null
  categories: CategoryInfo[]
  loading: boolean
  candidatures: CandidatureInfo[]
  setCandidatures: React.Dispatch<React.SetStateAction<CandidatureInfo[]>>
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
      .catch(() => {})

    // Fetch candidatures for this candidate
    fetch('/api/recruitment/candidatures', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((all: CandidatureInfo[]) => {
        const mine = all.filter((c: CandidatureInfo) => c.candidateId === candidateId)
        setCandidatures(mine)
        if (mine.length > 0) {
          // Fetch events + allowed transitions + documents for the first candidature
          Promise.all([
            fetch(`/api/recruitment/candidatures/${mine[0].id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch(`/api/recruitment/candidatures/${mine[0].id}/transitions`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch(`/api/recruitment/candidatures/${mine[0].id}/documents`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
          ]).then(([detail, transitions, docs]) => {
            if (detail?.events) setEvents(detail.events)
            if (detail?.multiPosteCompatibility) setMultiPosteCompatibility(detail.multiPosteCompatibility)
            if (detail?.bonusSkills) setBonusSkills(detail.bonusSkills)
            if (transitions) setAllowedTransitions(transitions)
            setDocuments(docs ?? [])
          })
        }
      })
      .catch(() => {})
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
  }
}
