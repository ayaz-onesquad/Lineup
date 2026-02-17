import { useState } from 'react'
import {
  useMyWorkKpis,
  useMyTasksByAllPriorities,
  useMyWorkHierarchy,
  useKpiDrillDownItems,
} from '@/hooks'
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
} from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { MyWorkItem } from '@/types/database'

// Priority level configuration for 6-level Eisenhower Matrix (aligned with CLAUDE.md standards)
const PRIORITY_LEVELS = [
  { level: 1, label: 'Critical', sublabel: 'Do First / Crisis', icon: Flame, color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-200' },
  { level: 2, label: 'High', sublabel: 'Do First / Urgent', icon: Zap, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-100' },
  { level: 3, label: 'Medium-High', sublabel: 'Schedule', icon: Calendar, color: 'text-amber-600', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' },
  { level: 4, label: 'Medium', sublabel: 'Plan', icon: ListChecks, color: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  { level: 5, label: 'Medium-Low', sublabel: 'Delegate', icon: ArrowRight, color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  { level: 6, label: 'Low', sublabel: 'Eliminate', icon: Timer, color: 'text-slate-500', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
]

// KPI Drill-down Modal
function KpiDrillDownModal({
  open,
  onOpenChange,
  type,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'sets' | 'pitches' | 'tasks' | 'requirements'
  title: string
}) {
  const [activeTab, setActiveTab] = useState<'active' | 'past_due'>('active')
  const { data: items, isLoading } = useKpiDrillDownItems(type, activeTab)
  const navigate = useNavigate()

  const getItemPath = (item: { id: string }) => {
    switch (type) {
      case 'sets': return `/sets/${item.id}`
      case 'pitches': return `/pitches/${item.id}`
      case 'tasks':
      case 'requirements': return `/requirements/${item.id}`
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
              Active / On Track
            </TabsTrigger>
            <TabsTrigger value="past_due" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Past Due
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
              ) : !items?.length ? (
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
                    {items.map((item: Record<string, unknown>) => {
                      const name = (item.name || item.title) as string
                      const clientsData = item.clients as Record<string, unknown> | undefined
                      const setsData = item.sets as Record<string, unknown> | undefined
                      const setsClientsData = setsData?.clients as Record<string, unknown> | undefined
                      const clientName = type === 'sets'
                        ? clientsData?.name as string
                        : type === 'pitches'
                        ? setsClientsData?.name as string
                        : setsClientsData?.name as string
                      const dueDate = type === 'sets' || type === 'pitches'
                        ? item.expected_end_date as string
                        : item.expected_due_date as string
                      const isPastDue = dueDate && new Date(dueDate) < new Date()

                      return (
                        <TableRow
                          key={item.id as string}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            navigate(getItemPath(item as { id: string }))
                            onOpenChange(false)
                          }}
                        >
                          <TableCell className="font-medium">{name || 'Untitled'}</TableCell>
                          <TableCell>{clientName || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusColor(item.status as string)}>
                              {(item.status as string)?.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {dueDate ? (
                              <span className={cn(isPastDue && 'text-red-600 font-medium')}>
                                {formatDate(dueDate)}
                                {isPastDue && ' (Past Due)'}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
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
    priority?: number
    expected_due_date?: string | null
    sets?: { clients?: { name?: string } }
  }
}) {
  const isPastDue = task.expected_due_date && new Date(task.expected_due_date) < new Date()
  const isPriority1or2 = task.priority && task.priority <= 2

  return (
    <Link
      to={`/requirements/${task.id}`}
      className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
    >
      <Checkbox
        checked={task.status === 'completed'}
        className="mt-0.5"
        disabled
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium leading-tight truncate">{task.title}</p>
          {isPriority1or2 && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {task.sets?.clients?.name || 'No client'}
        </p>
        {task.expected_due_date && (
          <p
            className={cn(
              'text-xs flex items-center gap-1 mt-1',
              isPastDue ? 'text-red-600' : 'text-muted-foreground'
            )}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(task.expected_due_date)}
            {isPastDue && ' (Past Due)'}
          </p>
        )}
      </div>
      <Badge
        variant="outline"
        className={cn('text-xs shrink-0', getStatusColor(task.status))}
      >
        {task.status.replace('_', ' ')}
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
  const isPastDue = set.expected_due_date && new Date(set.expected_due_date) < new Date()

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
                isPastDue ? 'text-red-600' : 'text-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(set.expected_due_date)}
            </span>
          )}
          <Badge variant="outline" className={cn('text-xs', getStatusColor(set.status))}>
            {set.status.replace('_', ' ')}
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
  const isPastDue = pitch.expected_due_date && new Date(pitch.expected_due_date) < new Date()

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
                isPastDue ? 'text-red-600' : 'text-muted-foreground'
              )}
            >
              {formatDate(pitch.expected_due_date)}
            </span>
          )}
          <Badge variant="outline" className={cn('text-xs', getStatusColor(pitch.status))}>
            {pitch.status.replace('_', ' ')}
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
  const isPastDue =
    requirement.expected_due_date && new Date(requirement.expected_due_date) < new Date()

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
              isPastDue ? 'text-red-600' : 'text-muted-foreground'
            )}
          >
            {formatDate(requirement.expected_due_date)}
          </span>
        )}
        <Badge variant="outline" className={cn('text-xs', getStatusColor(requirement.status))}>
          {requirement.status.replace('_', ' ')}
        </Badge>
      </div>
    </Link>
  )
}

export function DashboardPage() {
  const { profile } = useAuthStore()
  const { currentTenant } = useTenantStore()

  // KPIs data
  const { data: kpis, isLoading: kpisLoading } = useMyWorkKpis()

  // Tasks grouped by all 6 priority levels
  const { data: tasks, isLoading: tasksLoading } = useMyTasksByAllPriorities(100)

  // Hierarchical work items
  const { hierarchy, byPriority, isLoading: workLoading, totalOrphans } = useMyWorkHierarchy()

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
          Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
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
          active={kpis?.sets.active || 0}
          pastDue={kpis?.sets.past_due || 0}
          color="text-purple-600"
          bgColor="bg-purple-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('sets', 'My Sets')}
        />
        <KpiCard
          title="My Pitches"
          icon={Presentation}
          active={kpis?.pitches.active || 0}
          pastDue={kpis?.pitches.past_due || 0}
          color="text-blue-600"
          bgColor="bg-blue-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('pitches', 'My Pitches')}
        />
        <KpiCard
          title="My Tasks"
          icon={CheckSquare}
          active={kpis?.tasks.active || 0}
          pastDue={kpis?.tasks.past_due || 0}
          color="text-green-600"
          bgColor="bg-green-100"
          isLoading={kpisLoading}
          onClick={() => openDrillDown('tasks', 'My Tasks')}
        />
        <KpiCard
          title="My Requirements"
          icon={Target}
          active={kpis?.requirements.active || 0}
          pastDue={kpis?.requirements.past_due || 0}
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
    </div>
  )
}
