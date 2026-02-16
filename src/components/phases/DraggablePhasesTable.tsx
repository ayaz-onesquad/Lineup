import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePhaseMutations } from '@/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ChevronRight,
  GripVertical,
  MoreVertical,
  ExternalLink,
  Edit,
  Plus,
  Layers,
} from 'lucide-react'
import { getStatusColor, formatDate } from '@/lib/utils'
import type { ProjectPhase } from '@/types/database'

interface DraggablePhasesTableProps {
  projectId: string
  phases: ProjectPhase[]
  expandedPhases: Set<string>
  togglePhase: (phaseId: string) => void
  expandedSets: Set<string>
  toggleSet: (setId: string) => void
  openCreateModal: (type: string, context?: Record<string, string>) => void
}

interface SortablePhaseRowProps {
  phase: ProjectPhase
  index: number
  isExpanded: boolean
  togglePhase: (phaseId: string) => void
  expandedSets: Set<string>
  toggleSet: (setId: string) => void
  openCreateModal: (type: string, context?: Record<string, string>) => void
  projectId: string
}

function SortablePhaseRow({
  phase,
  index,
  isExpanded,
  togglePhase,
  expandedSets,
  toggleSet,
  openCreateModal,
  projectId,
}: SortablePhaseRowProps) {
  const navigate = useNavigate()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: phase.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card ref={setNodeRef} style={style}>
      <Collapsible open={isExpanded} onOpenChange={() => togglePhase(phase.id)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono w-8">
                  #{index + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 cursor-grab active:cursor-grabbing"
                  {...attributes}
                  {...listeners}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{phase.name}</CardTitle>
                  <Badge className={getStatusColor(phase.status)}>
                    {phase.status.replace('_', ' ')}
                  </Badge>
                </div>
                <CardDescription>
                  {phase.sets?.length || 0} sets • {phase.completion_percentage}%
                  complete
                  {phase.expected_end_date && (
                    <> • Due {formatDate(phase.expected_end_date)}</>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={phase.completion_percentage} className="w-24 h-2" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/phases/${phase.id}`)
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Detail Page
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/phases/${phase.id}?edit=true`)
                      }}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Phase
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete phase "${phase.name}"?`)) {
                          // TODO: implement deletePhase mutation
                          console.log('Delete phase:', phase.id)
                        }
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pl-12">
            {phase.sets?.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">No sets yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openCreateModal('set', {
                      project_id: projectId,
                      phase_id: phase.id,
                    })
                  }
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Add Set
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {phase.sets
                  ?.sort((a, b) => a.set_order - b.set_order)
                  .map((set) => (
                    <Collapsible
                      key={set.id}
                      open={expandedSets.has(set.id)}
                      onOpenChange={() => toggleSet(set.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${
                              expandedSets.has(set.id) ? 'rotate-90' : ''
                            }`}
                          />
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{set.name}</span>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  set.urgency === 'high' && set.importance === 'high'
                                    ? 'border-red-500 text-red-700'
                                    : ''
                                }`}
                              >
                                U:{set.urgency[0].toUpperCase()} I:
                                {set.importance[0].toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {set.requirements?.length || 0} requirements
                            </div>
                          </div>
                          <Progress value={set.completion_percentage} className="w-20 h-1.5" />
                        </div>
                      </CollapsibleTrigger>
                    </Collapsible>
                  ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

export function DraggablePhasesTable({
  projectId,
  phases,
  expandedPhases,
  togglePhase,
  expandedSets,
  toggleSet,
  openCreateModal,
}: DraggablePhasesTableProps) {
  const [items, setItems] = useState(phases)
  const { reorderPhases } = usePhaseMutations()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Update local items when phases prop changes
  useState(() => {
    setItems(phases.sort((a, b) => a.phase_order - b.phase_order))
  })

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)

    const newItems = arrayMove(items, oldIndex, newIndex)
    setItems(newItems)

    // Persist order to database
    const phaseIds = newItems.map((item) => item.id)
    await reorderPhases.mutateAsync({ projectId, phaseIds })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {items.map((phase, index) => (
            <SortablePhaseRow
              key={phase.id}
              phase={phase}
              index={index}
              isExpanded={expandedPhases.has(phase.id)}
              togglePhase={togglePhase}
              expandedSets={expandedSets}
              toggleSet={toggleSet}
              openCreateModal={openCreateModal}
              projectId={projectId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
