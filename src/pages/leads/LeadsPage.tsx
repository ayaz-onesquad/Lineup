import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import { useLeads, useLeadMutations, useLeadPipelineStats } from '@/hooks/useLeads'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Search,
  MoreVertical,
  Target,
  DollarSign,
  Calendar,
  TrendingUp,
  User,
  ExternalLink,
  Trash2,
  LayoutGrid,
  List,
  TableIcon,
  GripVertical,
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import type { LeadWithRelations, LeadStatus } from '@/types/database'

// Pipeline stages configuration
const PIPELINE_STAGES: { status: LeadStatus; label: string; color: string; bgColor: string }[] = [
  { status: 'new', label: 'New', color: 'bg-slate-500', bgColor: 'bg-slate-50' },
  { status: 'contacted', label: 'Contacted', color: 'bg-blue-500', bgColor: 'bg-blue-50' },
  { status: 'qualified', label: 'Qualified', color: 'bg-indigo-500', bgColor: 'bg-indigo-50' },
  { status: 'proposal', label: 'Proposal', color: 'bg-purple-500', bgColor: 'bg-purple-50' },
  { status: 'negotiation', label: 'Negotiation', color: 'bg-amber-500', bgColor: 'bg-amber-50' },
  { status: 'won', label: 'Won', color: 'bg-green-500', bgColor: 'bg-green-50' },
  { status: 'lost', label: 'Lost', color: 'bg-red-500', bgColor: 'bg-red-50' },
]

// Lost reason options
const LOST_REASONS = [
  'price',
  'competitor',
  'timing',
  'no_budget',
  'no_response',
  'bad_fit',
  'other',
]

export function LeadsPage() {
  const [search, setSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [lostDialogOpen, setLostDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<LeadWithRelations | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const navigate = useNavigate()
  const { data: leads, isLoading } = useLeads()
  const { data: stats } = useLeadPipelineStats()
  const { updateLeadStatus, deleteLead } = useLeadMutations()
  const { openCreateModal, leadsViewMode, setLeadsViewMode } = useUIStore()

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Filter leads by search
  const filteredLeads = useMemo(() => {
    if (!leads) return []
    return leads.filter(
      (lead) =>
        lead.lead_name.toLowerCase().includes(search.toLowerCase()) ||
        (lead.email && lead.email.toLowerCase().includes(search.toLowerCase())) ||
        (lead.industry && lead.industry.toLowerCase().includes(search.toLowerCase()))
    )
  }, [leads, search])

  // Group leads by status
  const leadsByStatus = useMemo(() => {
    const grouped: Record<string, LeadWithRelations[]> = {}
    for (const stage of PIPELINE_STAGES) {
      grouped[stage.status] = filteredLeads.filter((l) => l.status === stage.status)
    }
    return grouped
  }, [filteredLeads])

  // Visible stages (hide won/lost if not showing closed)
  const visibleStages = showClosed
    ? PIPELINE_STAGES
    : PIPELINE_STAGES.filter((s) => s.status !== 'won' && s.status !== 'lost')

  // Active lead for drag overlay
  const activeLead = useMemo(
    () => leads?.find((l) => l.id === activeId) || null,
    [leads, activeId]
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by CSS
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const leadId = active.id as string
    const lead = leads?.find((l) => l.id === leadId)
    if (!lead) return

    // Check if over.id is a valid pipeline status (column drop)
    const isValidStatus = PIPELINE_STAGES.some((s) => s.status === over.id)

    let targetStatus: LeadStatus
    if (isValidStatus) {
      // Dropped on a column
      targetStatus = over.id as LeadStatus
    } else {
      // Dropped on a card - find the card's column status
      const targetLead = leads?.find((l) => l.id === over.id)
      if (!targetLead) return
      targetStatus = targetLead.status
    }

    // Only update if status changed
    if (lead.status !== targetStatus) {
      if (targetStatus === 'lost') {
        setSelectedLead(lead)
        setLostDialogOpen(true)
      } else {
        await updateLeadStatus.mutateAsync({ id: leadId, status: targetStatus })
      }
    }
  }

  const handleConfirmLost = async () => {
    if (!selectedLead || !lostReason) return

    await updateLeadStatus.mutateAsync({
      id: selectedLead.id,
      status: 'lost',
      additionalData: {
        lost_reason: lostReason,
        lost_reason_notes: lostNotes,
      },
    })

    setLostDialogOpen(false)
    setSelectedLead(null)
    setLostReason('')
    setLostNotes('')
  }

  const getStageValue = (status: string) => {
    return stats?.byStatus[status]?.value || 0
  }

  const getStageCount = (status: string) => {
    return stats?.byStatus[status]?.count || 0
  }

  return (
    <div className="page-carbon min-h-screen">
      {/* Fixed Header */}
      <div className="sticky top-0 z-20 bg-[#f4f4f4] border-b px-6 py-4 space-y-4">
        {/* Title Row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-[system-ui]">Sales Pipeline</h1>
            <p className="text-muted-foreground">Manage leads and track your sales funnel</p>
          </div>
          <Button
            onClick={() => openCreateModal('lead')}
            className="shadow-lg rounded-lg"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Lead
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-md rounded-xl border-0">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Pipeline Value</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatCurrency(stats?.totalValue || 0)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-md rounded-xl border-0">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Won Value</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-green-600">
                {formatCurrency(stats?.wonValue || 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-md rounded-xl border-0">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-red-600" />
                <span className="text-sm text-muted-foreground">Lost Value</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-red-600">
                {formatCurrency(stats?.lostValue || 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-md rounded-xl border-0">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Conversion Rate</span>
              </div>
              <p className="text-2xl font-bold mt-1">{(stats?.conversionRate || 0).toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and View Toggle */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-lg shadow-sm"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center border rounded-lg bg-white shadow-sm p-1">
            <Button
              variant={leadsViewMode === 'pipeline' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLeadsViewMode('pipeline')}
              className="gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
              Pipeline
            </Button>
            <Button
              variant={leadsViewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLeadsViewMode('list')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              List
            </Button>
            <Button
              variant={leadsViewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLeadsViewMode('table')}
              className="gap-2"
            >
              <TableIcon className="h-4 w-4" />
              Table
            </Button>
          </div>

          <Button
            variant={showClosed ? 'secondary' : 'outline'}
            onClick={() => setShowClosed(!showClosed)}
            className="rounded-lg"
          >
            {showClosed ? 'Hide Closed' : 'Show Closed'}
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-96 w-full rounded-xl" />
            ))}
          </div>
        ) : leadsViewMode === 'pipeline' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {visibleStages.map((stage) => (
                <KanbanColumn
                  key={stage.status}
                  stage={stage}
                  leads={leadsByStatus[stage.status] || []}
                  count={getStageCount(stage.status)}
                  value={getStageValue(stage.status)}
                  onNavigate={(id) => navigate(`/leads/${id}`)}
                  onDelete={(id) => deleteLead.mutate(id)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeLead && <LeadCardOverlay lead={activeLead} />}
            </DragOverlay>
          </DndContext>
        ) : leadsViewMode === 'list' ? (
          <LeadsListView
            leads={filteredLeads}
            stages={visibleStages}
            onNavigate={(id) => navigate(`/leads/${id}`)}
          />
        ) : (
          <LeadsTableView
            leads={filteredLeads}
            onNavigate={(id) => navigate(`/leads/${id}`)}
            onDelete={(id) => deleteLead.mutate(id)}
          />
        )}
      </div>

      {/* Lost Reason Dialog */}
      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Mark Lead as Lost</DialogTitle>
            <DialogDescription>
              Please select a reason for losing this lead: {selectedLead?.lead_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Lost Reason *</Label>
              <div className="flex flex-wrap gap-2">
                {LOST_REASONS.map((reason) => (
                  <Badge
                    key={reason}
                    variant={lostReason === reason ? 'default' : 'outline'}
                    className="cursor-pointer capitalize rounded-lg"
                    onClick={() => setLostReason(reason)}
                  >
                    {reason.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Any additional details..."
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                className="rounded-lg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogOpen(false)} className="rounded-lg">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmLost}
              disabled={!lostReason || updateLeadStatus.isPending}
              className="rounded-lg"
            >
              Mark as Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Kanban Column Component with droppable
function KanbanColumn({
  stage,
  leads,
  count,
  value,
  onNavigate,
  onDelete,
}: {
  stage: (typeof PIPELINE_STAGES)[0]
  leads: LeadWithRelations[]
  count: number
  value: number
  onNavigate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.status,
  })

  return (
    <div className="flex-shrink-0 w-72">
      <Card
        className={`rounded-xl border-0 shadow-md transition-all ${stage.bgColor} ${
          isOver ? 'ring-2 ring-primary ring-offset-2' : ''
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${stage.color}`} />
              <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
            </div>
            <Badge variant="secondary" className="rounded-lg font-mono text-xs">
              {count} | {formatCurrency(value)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent
          ref={setNodeRef}
          className="space-y-3 min-h-[200px] max-h-[calc(100vh-450px)] overflow-y-auto"
        >
          <SortableContext
            items={leads.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Drop leads here
              </p>
            ) : (
              leads.map((lead) => (
                <SortableLeadCard
                  key={lead.id}
                  lead={lead}
                  onNavigate={onNavigate}
                  onDelete={onDelete}
                />
              ))
            )}
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  )
}

// Sortable Lead Card for drag-and-drop
function SortableLeadCard({
  lead,
  onNavigate,
  onDelete,
}: {
  lead: LeadWithRelations
  onNavigate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const primaryContact = lead.lead_contacts?.find((c) => c.is_primary)?.contacts

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`cursor-grab active:cursor-grabbing bg-white hover:shadow-lg transition-all rounded-xl border shadow-sm ${
        isDragging ? 'shadow-xl ring-2 ring-primary' : ''
      }`}
      onClick={() => onNavigate(lead.id)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header with drag handle */}
        <div className="flex items-start justify-between">
          <div
            {...attributes}
            {...listeners}
            className="p-1 -m-1 cursor-grab touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0 ml-2">
            <p className="font-semibold text-sm truncate">{lead.lead_name}</p>
            {lead.lead_id_display && (
              <p className="text-xs text-muted-foreground">{lead.lead_id_display}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-lg">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onNavigate(lead.id)
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(lead.id)
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Value and Close Date */}
        <div className="flex items-center justify-between text-xs">
          {lead.estimated_value && (
            <span className="font-semibold text-green-700">
              {formatCurrency(lead.estimated_value)}
            </span>
          )}
          {lead.estimated_close_date && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(lead.estimated_close_date)}
            </span>
          )}
        </div>

        {/* Primary Contact */}
        {primaryContact && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[8px]">
                {primaryContact.first_name?.[0]}
                {primaryContact.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">
              {primaryContact.first_name} {primaryContact.last_name}
            </span>
          </div>
        )}

        {/* Owner */}
        {lead.lead_owner && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{lead.lead_owner.full_name}</span>
          </div>
        )}

        {/* Industry Tag */}
        {lead.industry && (
          <Badge variant="outline" className="text-xs py-0 rounded-md">
            {lead.industry}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

// Overlay card for dragging
function LeadCardOverlay({ lead }: { lead: LeadWithRelations }) {
  const primaryContact = lead.lead_contacts?.find((c) => c.is_primary)?.contacts

  return (
    <Card className="w-72 bg-white shadow-2xl rounded-xl border-2 border-primary cursor-grabbing">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-semibold text-sm truncate">{lead.lead_name}</p>
            {lead.lead_id_display && (
              <p className="text-xs text-muted-foreground">{lead.lead_id_display}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          {lead.estimated_value && (
            <span className="font-semibold text-green-700">
              {formatCurrency(lead.estimated_value)}
            </span>
          )}
          {lead.estimated_close_date && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(lead.estimated_close_date)}
            </span>
          )}
        </div>
        {primaryContact && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[8px]">
                {primaryContact.first_name?.[0]}
                {primaryContact.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">
              {primaryContact.first_name} {primaryContact.last_name}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// List View Component
function LeadsListView({
  leads,
  stages,
  onNavigate,
}: {
  leads: LeadWithRelations[]
  stages: (typeof PIPELINE_STAGES)
  onNavigate: (id: string) => void
}) {
  const leadsByStatus = useMemo(() => {
    const grouped: Record<string, LeadWithRelations[]> = {}
    for (const stage of stages) {
      grouped[stage.status] = leads.filter((l) => l.status === stage.status)
    }
    return grouped
  }, [leads, stages])

  return (
    <div className="space-y-6">
      {stages.map((stage) => (
        <div key={stage.status}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-3 h-3 rounded-full ${stage.color}`} />
            <h2 className="font-semibold">{stage.label}</h2>
            <Badge variant="secondary" className="rounded-lg">
              {leadsByStatus[stage.status]?.length || 0}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leadsByStatus[stage.status]?.map((lead) => (
              <Card
                key={lead.id}
                className="cursor-pointer hover:shadow-lg transition-all rounded-xl"
                onClick={() => onNavigate(lead.id)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{lead.lead_name}</p>
                      {lead.lead_id_display && (
                        <p className="text-xs text-muted-foreground">{lead.lead_id_display}</p>
                      )}
                    </div>
                    {lead.estimated_value && (
                      <Badge variant="secondary" className="font-mono">
                        {formatCurrency(lead.estimated_value)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {lead.industry && <span>{lead.industry}</span>}
                    {lead.estimated_close_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(lead.estimated_close_date)}
                      </span>
                    )}
                  </div>
                  {lead.lead_owner && (
                    <div className="flex items-center gap-2 text-sm">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {lead.lead_owner.full_name
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span>{lead.lead_owner.full_name}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {(!leadsByStatus[stage.status] || leadsByStatus[stage.status].length === 0) && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No leads in this stage
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// Table View Component
function LeadsTableView({
  leads,
  onNavigate,
  onDelete,
}: {
  leads: LeadWithRelations[]
  onNavigate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const statusColor = (status: LeadStatus) => {
    const stage = PIPELINE_STAGES.find((s) => s.status === status)
    return stage?.color || 'bg-gray-500'
  }

  return (
    <Card className="rounded-xl shadow-md border-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Close Date</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow
                key={lead.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onNavigate(lead.id)}
              >
                <TableCell>
                  <div>
                    <p className="font-semibold">{lead.lead_name}</p>
                    {lead.lead_id_display && (
                      <p className="text-xs text-muted-foreground">{lead.lead_id_display}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1.5 rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${statusColor(lead.status)}`} />
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {lead.estimated_value ? formatCurrency(lead.estimated_value) : '—'}
                </TableCell>
                <TableCell>{lead.industry || '—'}</TableCell>
                <TableCell>
                  {lead.estimated_close_date ? formatDate(lead.estimated_close_date) : '—'}
                </TableCell>
                <TableCell>
                  {lead.lead_owner ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {lead.lead_owner.full_name
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{lead.lead_owner.full_name}</span>
                    </div>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-lg">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNavigate(lead.id) }}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDelete(lead.id) }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
