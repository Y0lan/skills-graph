import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { STATUT_LABELS, STATUT_COLORS } from '@/lib/constants'

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

export interface KanbanCandidature {
  id: string
  candidateId: string
  candidateName: string
  posteTitre: string
  statut: string
  tauxPoste: number | null
  tauxGlobal: number | null
}

export interface KanbanBoardProps {
  candidatures: KanbanCandidature[]
  onTransition: (candidatureId: string, newStatut: string) => void
}

// ---------------------------------------------------------------------------
// Sortable Card
// ---------------------------------------------------------------------------

function KanbanCard({ item, isDragOverlay }: { item: KanbanCandidature; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const scoreColor = (v: number | null) =>
    v == null ? '' : v >= 70 ? 'text-green-500' : v >= 40 ? 'text-amber-500' : 'text-red-500'

  const card = (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
      className={`rounded-lg border bg-card p-2.5 cursor-grab active:cursor-grabbing select-none
        ${isDragOverlay ? 'shadow-lg ring-2 ring-primary/30' : 'hover:bg-muted/30'}
        transition-colors`}
    >
      <p className="text-sm font-medium truncate">{item.candidateName}</p>
      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.posteTitre}</p>
      {item.tauxPoste != null && (
        <p className={`text-xs font-medium mt-1 ${scoreColor(item.tauxPoste)}`}>
          Poste {item.tauxPoste}%
        </p>
      )}
    </div>
  )

  return card
}

// ---------------------------------------------------------------------------
// Droppable Column
// ---------------------------------------------------------------------------

function KanbanColumn({ statut, items }: { statut: string; items: KanbanCandidature[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${statut}` })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border ${COLUMN_BG[statut] ?? 'bg-muted/5'}
        ${isOver ? 'ring-2 ring-primary/40' : ''} min-w-[220px] w-[220px] shrink-0`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <Badge variant="secondary" className={`text-[11px] px-1.5 py-0 ${STATUT_COLORS[statut] ?? ''}`}>
          {STATUT_LABELS[statut] ?? statut}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">{items.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <KanbanCard key={item.id} item={item} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="text-[11px] text-muted-foreground/50 text-center pt-8">Aucun</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export default function KanbanBoard({ candidatures, onTransition }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

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

  const activeItem = activeId ? candidatures.find(c => c.id === activeId) : null

  // Resolve which column a droppable id belongs to
  function resolveColumn(droppableId: string | undefined): string | null {
    if (!droppableId) return null
    // Direct column drop zone
    if (droppableId.startsWith('column-')) return droppableId.replace('column-', '')
    // Dropped on a card — find that card's column
    const target = candidatures.find(c => c.id === droppableId)
    return target?.statut ?? null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const draggedItem = candidatures.find(c => c.id === active.id)
    if (!draggedItem) return

    const targetColumn = resolveColumn(over.id as string)
    if (!targetColumn || targetColumn === draggedItem.statut) return

    onTransition(draggedItem.id, targetColumn)
  }

  function handleDragCancel() {
    setActiveId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMN_ORDER.map(statut => (
          <KanbanColumn
            key={statut}
            statut={statut}
            items={columns.get(statut) ?? []}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem ? <KanbanCard item={activeItem} isDragOverlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
