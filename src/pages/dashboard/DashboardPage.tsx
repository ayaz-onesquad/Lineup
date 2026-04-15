import { useState, useMemo } from 'react'
import {
  useMyTasksByAllPriorities,
  useMyWorkHierarchy,
  useMyWorkItems,
  useMyOpenDiscussions,
} from '@/hooks'
import { AssignedByMeWidget } from '@/components/dashboard/AssignedByMeWidget'
import { useAuthStore, useTenantStore } from '@/stores'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Layers,
  CheckSquare,
  AlertTriangle,
  TrendingDown,
  Presentation,
  Calendar,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Target,
  Flame,
  Zap,
  ListChecks,
  ArrowRight,
  Timer,
  MessageSquare,
  Users,
  FolderKanban,
  ListOrdered,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { formatDate } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { computeDisplayStatus, computeRequirementStatus, getStatusLabel, getStatusColor, isPastDueStatus } from '@/utils/statusUtils'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { MyWorkItem, EntityType } from '@/types/database'

// Entity type config for badges (partial - only for discussion-supported entities)
const ENTITY_TYPE_CONFIG: Partial<Record<EntityType, { label: string; icon: React.ElementType; color: string }>> = {
  client: { label: 'Client', icon: Users, color: 'bg-blue-100 text-blue-700' },
  project: { label: 'Project', icon: FolderKanban, color: 'bg-purple-100 text-purple-700' },
  phase: { label: 'Phase', icon: ListOrdered, color: 'bg-indigo-100 text-indigo-700' },
  set: { label: 'Set', icon: Layers, color: 'bg-pink-100 text-pink-700' },
  pitch: { label: 'Pitch', icon: Presentation, color: 'bg-cyan-100 text-cyan-700' },
  requirement: { label: 'Requirement', icon: CheckSquare, color: 'bg-orange-100 text-orange-700' },
  lead: { label: 'Lead', icon: Target, color: 'bg-green-100 text-green-700' },
}

const ENTITY_URL_MAP: Partial<Record<EntityType, string>> = {
  client: '/clients',
  project: '/projects',
  phase: '/phases',
  set: '/sets',
  pitch: '/pitches',
  requirement: '/requirements',
  lead: '/leads',
}

// Priority level configuration for 6-level Eisenhower Matrix (aligned with CLAUDE.md standards)
const PRIORITY_LEVELS = [
  { level: 1, label: 'Critical', sublabel: 'Do First / Crisis', icon: Flame, color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-200' },
  { level: 2, label: 'High', sublabel: 'Do First / Urgent', icon: Zap, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-100' },
  { level: 3, label: 'Medium-High', sublabel: 'Schedule', icon: Calendar, color: 'text-amber-600', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' },
  { level: 4, label: 'Medium', sublabel: 'Plan', icon: ListChecks, color: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  { level: 5, label: 'Medium-Low', sublabel: 'Delegate', icon: ArrowRight, color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  { level: 6, label: 'Low', sublabel: 'Eliminate', icon: Timer, color: 'text-slate-500', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
]

// Item with computed status for drill-down display
interface DrillDownItem {
  id: string
  name: string
  client_name?: string
  status: string
  dueDate?: string
  itemType: 'set' | 'pitch' | 'task' | 'requirement'
}

// KPI Drill-down Modal - uses pre-filtered data passed as props
function KpiDrillDownModal({
  open,
  onOpenChange,
  type,
  title,
  activeItems,
  pastDueItems,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'sets' | 'pitches' | 'tasks' | 'requirements'
  title: string
  activeItems: DrillDownItem[]
  pastDueItems: DrillDownItem[]
  isLoading: boolean
}) {
  const [activeTab, setActiveTab] = useState<'active' | 'past_due'>('active')
  const navigate = useNavigate()

  const items = activeTab === 'active' ? activeItems : pastDueItems

  const getItemPath = (item: DrillDownItem) => {
    switch (item.itemType) {
      case 'set': return `/sets/${item.id}`
      case 'pitch': return `/pitches/${item.id}`
      case 'task':
      case 'requirement': return `/requirements/${item.id}`
      default: return '#'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            View your {type} by status
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'past_due')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              Active ({activeItems.length})
            </TabsTrigger>
            <TabsTrigger value="past_due" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Past Due ({pastDueItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !items.length ? (
                <div className="text-center text-muted-foreground py-12">
                  <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No {activeTab === 'past_due' ? 'past due' : 'active'} {type} found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          navigate(getItemPath(item))
                          onOpenChange(false)
                        }}
                      >
                        <TableCell className="font-medium">{item.name || 'Untitled'}</TableCell>
                        <TableCell>{item.client_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.dueDate ? (
                            <span className={cn(isPastDueStatus(item.status) && 'text-red-600 font-medium')}>
                              {formatDate(item.dueDate)}
                              {isPastDueStatus(item.status) && ' (Past Due)'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Premium KPI Card component with comparison metrics - NOW CLICKABLE
function KpiCard({
  title,
  icon: Icon,
  active,
  pastDue,
  color,
  bgColor,
  isLoading,
  onClick,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  active: number
  pastDue: number
  color: string
  bgColor: string
  isLoading?: boolean
  onClick?: () => void
}) {
  const percentage = active > 0 ? Math.round((pastDue / active) * 100) : 0
  const hasIssues = pastDue > 0

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/30"
      )}
      onClick={onClick}
    >
      {/* Subtle gradient accent */}
      <div className={cn('absolute top-0 left-0 right-0 h-1', bgColor)} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className={cn('p-2 rounded-lg', bgColor)}>
            <Icon className={cn('h-4 w-4', color)} />
          </div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
        {hasIssues && (
          <Badge variant="destructive" className="text-xs">
            {pastDue} Past Due
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold">{active}</span>
              <span className="text-sm text-muted-foreground">active</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={cn(hasIssues ? 'text-red-600' : 'text-muted-foreground')}>
                  {hasIssues ? `${percentage}% past due` : 'All on track'}
                </span>
                <span className="text-muted-foreground">
                  {pastDue} / {active}
                </span>
              </div>
              <Progress
                value={hasIssues ? percentage : 100}
                className={cn('h-1.5', hasIssues && '[&>div]:bg-red-500')}
              />
            </div>
            {onClick && (
              <p className="text-xs text-muted-foreground mt-2 text-center">Click to view details</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Collapsible Priority Section for 6-level grouping
function CollapsiblePrioritySection({
  config,
  count,
  children,
  defaultOpen = false,
}: {
  config: typeof PRIORITY_LEVELS[0]
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const Icon = config.icon

  if (count === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-3">
      <CollapsibleTrigger className="w-full">
        <div className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-lg mb-1 transition-colors hover:opacity-80',
          config.bgColor,
          config.borderColor,
          'border'
        )}>
          <div className="p-1.5 rounded bg-white/50">
            <Icon className={cn('h-3.5 w-3.5', config.color)} />
          </div>
          <div className="flex-1 text-left">
            <span className={cn('text-sm font-semibold', config.color)}>{config.label}</span>
            <span className="text-xs text-muted-foreground ml-2">{config.sublabel}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border rounded-lg overflow-hidden ml-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Task item component for the tasks column
function TaskItem({
  task,
}: {
  task: {
    id: string
    title: string
    status: string
    computed_status?: string | null
    priority?: number
    expected_due_date?: string | null
    clients?: { name?: string } // Direct client relation
    sets?: { clients?: { name?: string } }
  }
}) {
  // Use computed_status from the query which is already calculated
  const status = task.computed_status || 'future'
  const isPriority1or2 = task.priority && task.priority <= 2

  return (
    <Link
      to={`/requirements/${task.id}`}
      className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
    >
      <Checkbox
        checked={status === 'completed'}
        className="mt-0.5"
        disabled
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium leading-tight truncate">{task.title}</p>
          {isPriority1or2 && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {task.clients?.name || task.sets?.clients?.name || 'No client'}
        </p>
        {task.expected_due_date && (
          <p
            className={cn(
              'text-xs flex items-center gap-1 mt-1',
              isPastDueStatus(status) ? 'text-red-600' : 'text-muted-foreground'
            )}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(task.expected_due_date)}
            {isPastDueStatus(status) && ' (Past Due)'}
          </p>
        )}
      </div>
      <Badge variant="outline" className={cn('text-xs shrink-0', getStatusColor(status))}>
        {getStatusLabel(status)}
      </Badge>
    </Link>
  )
}

// Expandable Set component with child Pitches and Requirements
function ExpandableSet({
  set,
  defaultOpen = false,
}: {
  set: MyWorkItem & {
    childPitches: Array<MyWorkItem & { childRequirements: MyWorkItem[] }>
    directRequirements: MyWorkItem[]
  }
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const hasChildren = set.childPitches.length > 0 || set.directRequirements.length > 0
  const isPriority1or2 = set.priority && set.priority <= 2
  // Use computed_status from the view which is already calculated
  // If not available, default to 'future'
  const status = set.computed_status || 'future'

  // Check if set has direct requirements but no pitches assigned to user
  const hasDirectReqsButNoPitches = set.directRequirements.length > 0 && set.childPitches.length === 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b">
      <div className="flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors">
        {hasChildren ? (
          <CollapsibleTrigger className="p-1 hover:bg-muted rounded">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
        ) : (
          <div className="w-6" />
        )}

        <div className={cn('p-1.5 rounded', 'bg-purple-100')}>
          <Layers className="h-3.5 w-3.5 text-purple-600" />
        </div>

        <Link to={`/sets/${set.id}`} className="flex-1 min-w-0 hover:underline">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{set.name}</span>
            {isPriority1or2 && <Flame className="h-3 w-3 text-orange-500" />}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {set.client_name}
            {set.project_name && ` • ${set.project_name}`}
          </p>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          {set.expected_due_date && (
            <span
              className={cn(
                'text-xs flex items-center gap-1',
                isPastDueStatus(status) ? 'text-red-600' : 'text-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(set.expected_due_date)}
            </span>
          )}
          <Badge variant="outline" className={cn('text-xs', getStatusColor(status))}>
            {getStatusLabel(status)}
          </Badge>
          {hasChildren && (
            <Badge variant="secondary" className="text-xs">
              {set.childPitches.length + set.directRequirements.length}
            </Badge>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="ml-6 pl-4 pb-2 border-l-2 border-purple-200">
          {/* Child Pitches */}
          {set.childPitches.map((pitch) => (
            <ExpandablePitch key={pitch.id} pitch={pitch} />
          ))}

          {/* "No Assigned Pitches" placeholder when set has direct reqs but no pitches */}
          {hasDirectReqsButNoPitches && (
            <div className="flex items-center gap-2 p-2 bg-muted/30 border-b text-muted-foreground relative">
              <div className="absolute -left-[17px] top-1/2 w-3 h-px bg-purple-200" />
              <div className="w-5" />
              <div className="p-1 rounded bg-slate-100">
                <Presentation className="h-3 w-3 text-slate-400" />
              </div>
              <span className="text-xs italic">No Assigned Pitches</span>
            </div>
          )}

          {/* Direct Requirements (no pitch parent) */}
          {set.directRequirements.map((req) => (
            <RequirementRow key={req.id} requirement={req} indent={0} showConnector />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Expandable Pitch component with child Requirements
function ExpandablePitch({
  pitch,
}: {
  pitch: MyWorkItem & { childRequirements: MyWorkItem[] }
}) {
  const [isOpen, setIsOpen] = useState(false)
  const hasChildren = pitch.childRequirements.length > 0
  const isPriority1or2 = pitch.priority && pitch.priority <= 2
  // Use computed_status from the view which is already calculated
  // If not available, default to 'future'
  const status = pitch.computed_status || 'future'

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b last:border-b-0 relative">
      {/* Horizontal connector from parent Set's border */}
      <div className="absolute -left-[17px] top-[18px] w-3 h-px bg-purple-200" />
      <div className="flex items-center gap-2 p-2 hover:bg-muted/30 transition-colors">
        {hasChildren ? (
          <CollapsibleTrigger className="p-1 hover:bg-muted rounded">
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
        ) : (
          <div className="w-5" />
        )}

        <div className={cn('p-1 rounded', 'bg-blue-100')}>
          <Presentation className="h-3 w-3 text-blue-600" />
        </div>

        <Link to={`/pitches/${pitch.id}`} className="flex-1 min-w-0 hover:underline">
          <div className="flex items-center gap-2">
            <span className="text-sm truncate">{pitch.name}</span>
            {isPriority1or2 && <Flame className="h-3 w-3 text-orange-500" />}
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          {pitch.expected_due_date && (
            <span
              className={cn(
                'text-xs flex items-center gap-1',
                isPastDueStatus(status) ? 'text-red-600' : 'text-muted-foreground'
              )}
            >
              {formatDate(pitch.expected_due_date)}
            </span>
          )}
          <Badge variant="outline" className={cn('text-xs', getStatusColor(status))}>
            {getStatusLabel(status)}
          </Badge>
          {hasChildren && (
            <Badge variant="secondary" className="text-xs">
              {pitch.childRequirements.length}
            </Badge>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="ml-5 pl-4 pb-1 border-l-2 border-blue-200">
          {pitch.childRequirements.map((req) => (
            <RequirementRow key={req.id} requirement={req} indent={0} showConnector />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Simple Requirement row
function RequirementRow({
  requirement,
  indent = 0,
  showConnector = false,
}: {
  requirement: MyWorkItem
  indent?: number
  showConnector?: boolean
}) {
  const isPriority1or2 = requirement.priority && requirement.priority <= 2
  // Use computed_status from the view which is already calculated
  // If not available, default to 'future'
  const status = requirement.computed_status || 'future'

  return (
    <Link
      to={`/requirements/${requirement.id}`}
      className="flex items-center gap-2 p-2 hover:bg-muted/30 transition-colors border-b last:border-b-0 relative"
      style={{ paddingLeft: `${8 + indent * 16}px` }}
    >
      {showConnector && (
        <div className="absolute -left-[17px] top-1/2 w-3 h-px bg-current opacity-30" />
      )}
      <div className={cn('p-1 rounded', 'bg-orange-100')}>
        <Target className="h-3 w-3 text-orange-600" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{requirement.name}</span>
          {isPriority1or2 && <Flame className="h-3 w-3 text-orange-500" />}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {requirement.expected_due_date && (
          <span
            className={cn(
              'text-xs',
              isPastDueStatus(status) ? 'text-red-600' : 'text-muted-foreground'
            )}
          >
            {formatDate(requirement.expected_due_date)}
          </span>
        )}
        <Badge variant="outline" className={cn('text-xs', getStatusColor(status))}>
          {getStatusLabel(status)}
        </Badge>
      </div>
    </Link>
  )
}

// My Open Discussions Widget
function MyOpenDiscussionsWidget() {
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const navigate = useNavigate()

  const { data: discussions, isLoading } = useMyOpenDiscussions(user?.id, currentTenant?.id, 10)

  // Collect unique entity IDs by type for batch name resolution
  const entityIdsByType = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    discussions?.forEach(d => {
      if (!map[d.entity_type]) map[d.entity_type] = new Set()
      map[d.entity_type].add(d.entity_id)
    })
    return map
  }, [discussions])

  // Batch fetch entity names
  const { data: entityNames } = useQuery({
    queryKey: ['entity-names-dashboard', Object.fromEntries(
      Object.entries(entityIdsByType).map(([k, v]) => [k, Array.from(v)])
    )],
    queryFn: async () => {
      const nameMap = new Map<string, string>()

      if (entityIdsByType.client?.size) {
        const { data } = await supabase.from('clients').select('id, name').in('id', Array.from(entityIdsByType.client))
        data?.forEach(c => nameMap.set(c.id, c.name))
      }
      if (entityIdsByType.project?.size) {
        const { data } = await supabase.from('projects').select('id, name').in('id', Array.from(entityIdsByType.project))
        data?.forEach(p => nameMap.set(p.id, p.name))
      }
      if (entityIdsByType.phase?.size) {
        const { data } = await supabase.from('phases').select('id, name').in('id', Array.from(entityIdsByType.phase))
        data?.forEach(p => nameMap.set(p.id, p.name))
      }
      if (entityIdsByType.set?.size) {
        const { data } = await supabase.from('sets').select('id, name').in('id', Array.from(entityIdsByType.set))
        data?.forEach(s => nameMap.set(s.id, s.name))
      }
      if (entityIdsByType.pitch?.size) {
        const { data } = await supabase.from('pitches').select('id, name').in('id', Array.from(entityIdsByType.pitch))
        data?.forEach(p => nameMap.set(p.id, p.name))
      }
      if (entityIdsByType.requirement?.size) {
        const { data } = await supabase.from('requirements').select('id, title').in('id', Array.from(entityIdsByType.requirement))
        data?.forEach(r => nameMap.set(r.id, r.title || 'Untitled'))
      }
      if (entityIdsByType.lead?.size) {
        const { data } = await supabase.from('leads').select('id, company_name').in('id', Array.from(entityIdsByType.lead))
        data?.forEach(l => nameMap.set(l.id, l.company_name || 'Untitled'))
      }

      return nameMap
    },
    enabled: !!discussions && discussions.length > 0,
  })

  const handleRowClick = (discussion: NonNullable<typeof discussions>[0]) => {
    const basePath = ENTITY_URL_MAP[discussion.entity_type as EntityType] || '/clients'
    navigate(`${basePath}/${discussion.entity_id}?tab=discussions`)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">My Open Discussions</CardTitle>
          </div>
          <Link
            to="/discussions"
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        <CardDescription>Unresolved discussions you started</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !discussions?.length ? (
          <div className="text-center text-muted-foreground py-8 px-4">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No open discussions</p>
            <p className="text-xs mt-1">Start a discussion from any entity's detail page</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="divide-y">
              {discussions.map((discussion) => {
                const config = ENTITY_TYPE_CONFIG[discussion.entity_type as EntityType]
                const Icon = config?.icon || MessageSquare
                const entityName = entityNames?.get(discussion.entity_id) || discussion.entity_id.slice(0, 8)

                return (
                  <div
                    key={discussion.id}
                    className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(discussion)}
                  >
                    <Badge
                      variant="secondary"
                      className={cn('text-xs gap-1 shrink-0', config?.color)}
                    >
                      <Icon className="h-3 w-3" />
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{entityName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {discussion.content.slice(0, 60)}
                        {discussion.content.length > 60 && '...'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(discussion.created_at), { addSuffix: true })}
                    </span>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const { profile } = useAuthStore()
  const { currentTenant } = useTenantStore()

  // Fetch all work items for client-side KPI computation
  const { data: workItems, isLoading: workItemsLoading } = useMyWorkItems({ limit: 500 })

  // Tasks grouped by all 6 priority levels
  const { data: tasks, isLoading: tasksLoading } = useMyTasksByAllPriorities(100)

  // Hierarchical work items
  const { hierarchy, byPriority, isLoading: workLoading, totalOrphans } = useMyWorkHierarchy()

  // Compute KPIs and drill-down items client-side
  // Uses the SAME computeDisplayStatus/computeRequirementStatus functions as detail pages
  const kpiData = useMemo(() => {
    if (!workItems) return null

    const sets = workItems.filter(item => item.item_type === 'set')
    const pitches = workItems.filter(item => item.item_type === 'pitch')
    const requirements = workItems.filter(item => item.item_type === 'requirement')

    // Filter and transform items for sets/pitches
    const filterSetPitchItems = (items: typeof sets, itemType: 'set' | 'pitch') => {
      const activeItems: DrillDownItem[] = []
      const pastDueItems: DrillDownItem[] = []

      for (const item of items) {
        // Use the SAME computeDisplayStatus function as detail pages
        // Pass pre-computed key dates as actual dates (they already represent the key dates)
        const status = computeDisplayStatus({
          actual_start_date: item.key_start_date,
          actual_end_date: item.key_end_date,
        })

        const drillDownItem: DrillDownItem = {
          id: item.id,
          name: item.name,
          client_name: item.client_name,
          status,
          dueDate: item.key_end_date || item.expected_due_date,
          itemType,
        }

        // "Active" includes both 'active' and 'on_deck' (operational view)
        if (status === 'active' || status === 'on_deck') {
          activeItems.push(drillDownItem)
        } else if (isPastDueStatus(status)) {
          pastDueItems.push(drillDownItem)
        }
        // 'completed' and 'future' are excluded
      }

      return { activeItems, pastDueItems }
    }

    // Filter and transform items for requirements
    const filterRequirementItems = (items: typeof requirements) => {
      const activeItems: DrillDownItem[] = []
      const pastDueItems: DrillDownItem[] = []

      for (const item of items) {
        // Use the SAME computeRequirementStatus function as detail pages
        // Pass pre-computed key_due_date as actual_due_date
        const status = computeRequirementStatus({
          actual_due_date: item.key_due_date,
        })

        const drillDownItem: DrillDownItem = {
          id: item.id,
          name: item.name,
          client_name: item.client_name,
          status,
          dueDate: item.key_due_date || item.expected_due_date,
          itemType: 'requirement',
        }

        // "Active" includes both 'active' and 'on_deck' (operational view)
        if (status === 'active' || status === 'on_deck') {
          activeItems.push(drillDownItem)
        } else if (isPastDueStatus(status)) {
          pastDueItems.push(drillDownItem)
        }
        // 'completed' and 'future' are excluded
      }

      return { activeItems, pastDueItems }
    }

    const setsData = filterSetPitchItems(sets, 'set')
    const pitchesData = filterSetPitchItems(pitches, 'pitch')
    const requirementsData = filterRequirementItems(requirements)

    return {
      sets: {
        active: setsData.activeItems.length,
        past_due: setsData.pastDueItems.length,
        activeItems: setsData.activeItems,
        pastDueItems: setsData.pastDueItems,
      },
      pitches: {
        active: pitchesData.activeItems.length,
        past_due: pitchesData.pastDueItems.length,
        activeItems: pitchesData.activeItems,
        pastDueItems: pitchesData.pastDueItems,
      },
      requirements: {
        active: requirementsData.activeItems.length,
        past_due: requirementsData.pastDueItems.length,
        activeItems: requirementsData.activeItems,
        pastDueItems: requirementsData.pastDueItems,
      },
    }
  }, [workItems])

  // Compute tasks KPI and drill-down items from the dedicated tasks query
  const tasksData = useMemo(() => {
    if (!tasks?.all) return { active: 0, past_due: 0, activeItems: [], pastDueItems: [] }

    const activeItems: DrillDownItem[] = []
    const pastDueItems: DrillDownItem[] = []

    for (const task of tasks.all) {
      // Use computeRequirementStatus for tasks (which are requirements)
      const status = computeRequirementStatus({
        completed_date: task.completed_date || null,
        actual_due_date: task.actual_due_date || null,
        expected_due_date: task.expected_due_date || null,
        actual_start_date: task.actual_start_date || null,
        expected_start_date: task.expected_start_date || null,
      })

      const drillDownItem: DrillDownItem = {
        id: task.id,
        name: task.title || task.name || 'Untitled',
        client_name: task.sets?.clients?.name,
        status,
        dueDate: task.actual_due_date || task.expected_due_date,
        itemType: 'task',
      }

      // "Active" includes both 'active' and 'on_deck' (operational view)
      if (status === 'active' || status === 'on_deck') {
        activeItems.push(drillDownItem)
      } else if (isPastDueStatus(status)) {
        pastDueItems.push(drillDownItem)
      }
    }

    return {
      active: activeItems.length,
      past_due: pastDueItems.length,
      activeItems,
      pastDueItems,
    }
  }, [tasks])

  // Combined KPIs for display
  const finalKpis = useMemo(() => {
    if (!kpiData) return null
    return {
      sets: { active: kpiData.sets.active, past_due: kpiData.sets.past_due },
      pitches: { active: kpiData.pitches.active, past_due: kpiData.pitches.past_due },
      tasks: { active: tasksData.active, past_due: tasksData.past_due },
      requirements: { active: kpiData.requirements.active, past_due: kpiData.requirements.past_due },
    }
  }, [kpiData, tasksData])

  // Drill-down items for the modal
  const drillDownItems = useMemo(() => ({
    sets: { activeItems: kpiData?.sets.activeItems || [], pastDueItems: kpiData?.sets.pastDueItems || [] },
    pitches: { activeItems: kpiData?.pitches.activeItems || [], pastDueItems: kpiData?.pitches.pastDueItems || [] },
    tasks: { activeItems: tasksData.activeItems, pastDueItems: tasksData.pastDueItems },
    requirements: { activeItems: kpiData?.requirements.activeItems || [], pastDueItems: kpiData?.requirements.pastDueItems || [] },
  }), [kpiData, tasksData])

  const kpisLoading = workItemsLoading || tasksLoading

  // KPI Drill-down modal state
  const [drillDownModal, setDrillDownModal] = useState<{
    open: boolean
    type: 'sets' | 'pitches' | 'tasks' | 'requirements'
    title: string
  }>({
    open: false,
    type: 'sets',
    title: '',
  })

  const openDrillDown = (type: 'sets' | 'pitches' | 'tasks' | 'requirements', title: string) => {
    setDrillDownModal({ open: true, type, title })
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {profile?.first_name || profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's your work overview in {currentTenant?.name}
        </p>
      </div>

      {/* Premium KPI Cards - Past Due vs Active - NOW CLICKABLE */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="My Sets"
          icon={Layers}
          active={finalKpis?.sets.active || 0}
          pastDue={finalKpis?.sets.past_due || 0}
          color="text-purple-600"
          bgColor="bg-purple-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('sets', 'My Sets')}
        />
        <KpiCard
          title="My Pitches"
          icon={Presentation}
          active={finalKpis?.pitches.active || 0}
          pastDue={finalKpis?.pitches.past_due || 0}
          color="text-blue-600"
          bgColor="bg-blue-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('pitches', 'My Pitches')}
        />
        <KpiCard
          title="My Tasks"
          icon={CheckSquare}
          active={finalKpis?.tasks.active || 0}
          pastDue={finalKpis?.tasks.past_due || 0}
          color="text-green-600"
          bgColor="bg-green-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('tasks', 'My Tasks')}
        />
        <KpiCard
          title="My Requirements"
          icon={Target}
          active={finalKpis?.requirements.active || 0}
          pastDue={finalKpis?.requirements.past_due || 0}
          color="text-orange-600"
          bgColor="bg-orange-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('requirements', 'My Requirements')}
        />
      </div>

      {/* KPI Drill-down Modal */}
      <KpiDrillDownModal
        open={drillDownModal.open}
        onOpenChange={(open) => setDrillDownModal(prev => ({ ...prev, open }))}
        type={drillDownModal.type}
        title={drillDownModal.title}
        activeItems={drillDownItems[drillDownModal.type].activeItems}
        pastDueItems={drillDownItems[drillDownModal.type].pastDueItems}
        isLoading={kpisLoading}
      />

      {/* Main Content: Tasks + My Work */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* All Tasks - Grouped by All 6 Priority Levels */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="h-4 w-4" />
              All Tasks
            </CardTitle>
            <CardDescription>Tasks grouped by 6 priority levels</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[550px]">
              {tasksLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !tasks?.all.length ? (
                <div className="text-center text-muted-foreground py-12 px-4">
                  <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No tasks assigned</p>
                  <p className="text-xs mt-1">Mark requirements as tasks to see them here</p>
                </div>
              ) : (
                <div className="p-3">
                  {PRIORITY_LEVELS.map((config, index) => {
                    const priorityKey = `priority${config.level}` as keyof typeof tasks
                    const priorityTasks = tasks[priorityKey] as typeof tasks.priority1

                    return (
                      <CollapsiblePrioritySection
                        key={config.level}
                        config={config}
                        count={priorityTasks?.length || 0}
                        defaultOpen={index < 2} // Open first 2 levels by default
                      >
                        {priorityTasks?.map((task) => (
                          <TaskItem key={task.id} task={task} />
                        ))}
                      </CollapsiblePrioritySection>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Hierarchical My Work Section */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <CircleDot className="h-5 w-5" />
              My Work
            </CardTitle>
            <CardDescription>
              Expandable view: Sets → Pitches → Requirements (6 priority levels)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[550px]">
              {workLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : hierarchy.sets.length === 0 &&
                hierarchy.orphanPitches.length === 0 &&
                hierarchy.orphanRequirements.length === 0 ? (
                <div className="text-center text-muted-foreground py-16 px-4">
                  <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No work assigned</p>
                  <p className="text-sm mt-1">
                    You'll see sets, pitches, and requirements here when assigned to you
                  </p>
                </div>
              ) : (
                <div className="p-3">
                  {/* All 6 Priority Levels */}
                  {PRIORITY_LEVELS.map((config, index) => {
                    const priorityKey = `priority${config.level}` as keyof typeof byPriority
                    const prioritySets = byPriority[priorityKey] as typeof byPriority.priority1

                    return (
                      <CollapsiblePrioritySection
                        key={config.level}
                        config={config}
                        count={prioritySets?.length || 0}
                        defaultOpen={index < 2} // Open first 2 levels by default
                      >
                        {prioritySets?.map((set) => (
                          <ExpandableSet key={set.id} set={set} defaultOpen={config.level <= 2} />
                        ))}
                      </CollapsiblePrioritySection>
                    )
                  })}

                  {/* Independent Items (Orphans) */}
                  {totalOrphans > 0 && (
                    <div className="mt-4 p-3 bg-amber-50/50 rounded-lg">
                      <div className="flex items-center gap-2 py-2 px-3 bg-amber-100/50 rounded-lg mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-semibold">Independent Items</span>
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {totalOrphans}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 px-1">
                        Pitches without a Set, or Requirements without a Set or Pitch
                      </p>

                      <div className="border rounded-lg overflow-hidden bg-white">
                        {/* Orphan Pitches */}
                        {hierarchy.orphanPitches.map((pitch) => (
                          <ExpandablePitch key={pitch.id} pitch={pitch} />
                        ))}

                        {/* Orphan Requirements */}
                        {hierarchy.orphanRequirements.map((req) => (
                          <RequirementRow key={req.id} requirement={req} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Assigned By Me + My Open Discussions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AssignedByMeWidget />
        <MyOpenDiscussionsWidget />
      </div>
    </div>
  )
}
