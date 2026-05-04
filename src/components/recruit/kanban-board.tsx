import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STATUT_LABELS, STATUT_COLORS, parseAppDate } from '@/lib/constants'
import { scoreColor } from '@/lib/score-utils'

/** Pipeline column order (refuse excluded — filtered out) */
const COLUMN_ORDER = [
  'postule',
  'preselectionne',
  'skill_radar_envoye',
  'skill_radar_complete',
  'entretien_1',
  'aboro',
  'entretien_2',
  'proposition',
  'embauche',
] as const

/** Very-low-opacity column background colors (dark-mode friendly) */
const COLUMN_BG: Record<string, string> = {
  postule: 'bg-gray-500/5',
  preselectionne: 'bg-sky-500/5',
  skill_radar_envoye: 'bg-violet-500/5',
  skill_radar_complete: 'bg-indigo-500/5',
  entretien_1: 'bg-orange-500/5',
  aboro: 'bg-pink-500/5',
  entretien_2: 'bg-amber-500/5',
  proposition: 'bg-teal-500/5',
  embauche: 'bg-green-500/5',
}

/** One-line descriptions for each pipeline stage */
const COLUMN_DESCRIPTIONS: Record<string, string> = {
  postule: 'En attente de tri initial',
  preselectionne: 'Profil retenu pour évaluation',
  skill_radar_envoye: 'Lien d\'évaluation envoyé au candidat',
  skill_radar_complete: 'Évaluation complétée par le candidat',
  entretien_1: 'Premier entretien planifié ou réalisé',
  aboro: 'Test comportemental en cours',
  entretien_2: 'Second entretien planifié ou réalisé',
  proposition: 'Offre en cours ou transmise',
  embauche: 'Candidat embauché',
}

export interface KanbanCandidature {
  id: string
  candidateId: string
  candidateName: string
  posteTitre: string
  statut: string
  tauxPoste: number | null
  tauxGlobal: number | null
  lastStatusChange?: string
}

export interface KanbanBoardProps {
  candidatures: KanbanCandidature[]
  onDelete?: (candidatureId: string, candidateName: string, posteTitre: string) => void
}

// ---------------------------------------------------------------------------
// Card (clickable link to candidate detail, with optional delete)
// ---------------------------------------------------------------------------

function KanbanCard({ item, now, onDelete }: { item: KanbanCandidature; now: number; onDelete?: (candidatureId: string, candidateName: string, posteTitre: string) => void }) {
  const daysInStatus = item.lastStatusChange
    ? Math.floor((now - (parseAppDate(item.lastStatusChange)?.getTime() ?? now)) / 86_400_000)
    : null

  return (
    <div className="relative group">
      <Link
        to={`/recruit/${item.candidateId}`}
        className="block rounded-lg border bg-card p-2.5 cursor-pointer hover:bg-muted/30 hover:border-primary/30 transition-colors"
      >
        <p className="font-medium text-sm truncate group-hover:text-primary transition-colors pr-6">
          {item.candidateName}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.posteTitre}</p>
        <div className="flex items-center gap-2 mt-1">
          {item.tauxPoste != null && (
            <span className={`text-xs font-medium ${scoreColor(item.tauxPoste)}`}>
              {item.tauxPoste}%
            </span>
          )}
          {daysInStatus != null && daysInStatus > 0 && (
            <span className="text-[10px] text-muted-foreground/60 ml-auto">
              {daysInStatus}j
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors mt-1">
          &rarr; Voir le profil
        </p>
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete(item.id, item.candidateName, item.posteTitre)
          }}
          className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-opacity"
          title="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function KanbanColumn({ statut, items, now, onDelete }: { statut: string; items: KanbanCandidature[]; now: number; onDelete?: (candidatureId: string, candidateName: string, posteTitre: string) => void }) {
  return (
    <div className={`flex flex-col rounded-xl border ${COLUMN_BG[statut] ?? 'bg-muted/5'} min-w-[220px] w-[220px] shrink-0 h-full`}>
      {/* Column header */}
      <div className="sticky top-0 z-10 px-3 py-2.5 border-b rounded-t-xl bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`text-[11px] px-1.5 py-0 ${STATUT_COLORS[statut] ?? ''}`}>
            {STATUT_LABELS[statut] ?? statut}
          </Badge>
          <span className="text-xs font-medium text-muted-foreground ml-auto tabular-nums">{items.length}</span>
        </div>
        {COLUMN_DESCRIPTIONS[statut] && (
          <p className="text-[10px] text-muted-foreground/60 mt-1 leading-tight">
            {COLUMN_DESCRIPTIONS[statut]}
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {items.map(item => (
          <KanbanCard key={item.id} item={item} now={now} onDelete={onDelete} />
        ))}
        {items.length === 0 && (
          <p className="text-[11px] text-muted-foreground/40 text-center pt-8">Aucun candidat</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export default function KanbanBoard({ candidatures, onDelete }: KanbanBoardProps) {
  const [now] = useState(() => Date.now())

  // Group candidatures by status, excluding refuse
  const columns = new Map<string, KanbanCandidature[]>()
  for (const s of COLUMN_ORDER) {
    columns.set(s, [])
  }
  for (const c of candidatures) {
    if (c.statut === 'refuse') continue
    const col = columns.get(c.statut)
    if (col) col.push(c)
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[420px] gap-3 overflow-x-auto pb-4">
      {COLUMN_ORDER.map(statut => (
        <KanbanColumn
          key={statut}
          statut={statut}
          items={columns.get(statut) ?? []}
          now={now}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
