import { useState, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useLeadAutomations,
  useAutomationRuns,
  useLeadAutomationMutations,
  type LeadAutomation,
  type AutomationRun,
} from '@/hooks/useLeadAutomations'
import { useUIStore } from '@/stores'
import { LeadAutomationForm } from '@/components/forms/LeadAutomationForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { useBulkDelete } from '@/hooks/useBulkDelete'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Zap,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Play,
  Pause,
  Users,
  History,
  Globe,
  Loader2,
  X,
  Info,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

export function LeadGeneratorPage() {
  const navigate = useNavigate()
  const { data: automations, isLoading } = useLeadAutomations()
  const { openCreateModal } = useUIStore()
  const [editingAutomation, setEditingAutomation] = useState<LeadAutomation | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [automationToDelete, setAutomationToDelete] = useState<string | null>(null)
  const [historyAutomation, setHistoryAutomation] = useState<LeadAutomation | null>(null)
  const { deleteAutomation, toggleActive } = useLeadAutomationMutations()
  const onBulkDelete = useBulkDelete(deleteAutomation.mutateAsync, {
    singular: 'automation',
    plural: 'automations',
    queryKey: ['lead_automations'],
  })

  // Check if any automation has completed a run
  const hasAnyCompletedRun = useMemo(() => {
    return automations?.some((a) => a.last_run_at !== null) ?? false
  }, [automations])

  const handleDelete = async () => {
    if (automationToDelete) {
      await deleteAutomation.mutateAsync(automationToDelete)
      setDeleteDialogOpen(false)
      setAutomationToDelete(null)
    }
  }

  const confirmDelete = (id: string) => {
    setAutomationToDelete(id)
    setDeleteDialogOpen(true)
  }

  const automationColumns = useMemo<DataGridColumn<LeadAutomation>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        accessor: (a) => a.display_id,
        numeric: true,
        hideOnMobile: true,
        width: '80px',
      },
      {
        id: 'name',
        header: 'Name',
        accessor: (a) => a.name,
        cell: (a) => <span className="font-semibold">{a.name}</span>,
        priority: 'primary',
        minWidth: '200px',
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (a) => (a.is_active ? 'Active' : 'Paused'),
        cell: (a) => (
          <Badge variant={a.is_active ? 'default' : 'secondary'}>
            {a.is_active ? 'Active' : 'Paused'}
          </Badge>
        ),
        priority: 'secondary',
        width: '110px',
      },
      {
        id: 'search',
        header: 'Search',
        accessor: (a) => `${a.search_query} in ${a.location}`,
        cell: (a) => (
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">"{a.search_query}"</span> in{' '}
            <span className="font-medium text-foreground">{a.location}</span>
          </span>
        ),
        priority: 'secondary',
        minWidth: '240px',
      },
      {
        id: 'filters',
        header: 'Filters',
        accessor: (a) => automationFilterLabels(a).join(', '),
        cell: (a) => {
          const labels = automationFilterLabels(a)
          if (labels.length === 0) return <span className="text-muted-foreground">—</span>
          return (
            <div className="flex flex-wrap gap-1">
              {a.filter_no_website && (
                <Badge variant="outline" className="text-xs">
                  <Globe className="h-3 w-3 mr-1 line-through opacity-50" />
                  No website
                </Badge>
              )}
              {a.filter_min_rating && (
                <Badge variant="outline" className="text-xs">
                  {a.filter_min_rating}+ rating
                </Badge>
              )}
              {a.filter_category && (
                <Badge variant="outline" className="text-xs">
                  {a.filter_category}
                </Badge>
              )}
            </div>
          )
        },
        minWidth: '180px',
      },
      {
        id: 'frequency',
        header: 'Frequency',
        accessor: (a) => (a.frequency === 'manual' ? 'Manual only' : a.frequency),
        cell: (a) => (
          <Badge variant="outline" className="text-xs capitalize">
            {a.frequency === 'manual' ? 'Manual only' : a.frequency}
          </Badge>
        ),
        width: '130px',
      },
      {
        id: 'max_leads',
        header: 'Max Leads',
        accessor: (a) => a.max_leads,
        numeric: true,
        width: '110px',
      },
      {
        id: 'total_leads',
        header: 'Leads Generated',
        mobileLabel: 'Leads',
        accessor: (a) => a.total_leads_generated,
        numeric: true,
        priority: 'secondary',
        width: '150px',
      },
      {
        id: 'last_run',
        header: 'Last Run',
        accessor: (a) => (a.last_run_at ? new Date(a.last_run_at) : null),
        exportValue: (a) => (a.last_run_at ? format(new Date(a.last_run_at), 'yyyy-MM-dd HH:mm') : ''),
        cell: (a) =>
          a.last_run_at ? (
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-muted-foreground">Never</span>
          ),
        width: '150px',
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Lead Generator</h1>
            <p className="text-muted-foreground">
              Automated lead discovery from Google Maps
            </p>
          </div>
        </div>
        <Button onClick={() => openCreateModal('lead_automation')}>
          <Plus className="mr-2 h-4 w-4" />
          New Automation
        </Button>
      </div>

      {/* Setup banner — shown only when no completed runs exist yet */}
      {!hasAnyCompletedRun && <SetupBanner />}

      {/* Content */}
      {!isLoading && automations?.length === 0 ? (
        <EmptyState />
      ) : (
        <DataGrid
          columns={automationColumns}
          data={automations}
          getRowId={(a) => a.id}
          isLoading={isLoading}
          onRowOpen={(a) => setEditingAutomation(a)}
          defaultSort={{ columnId: 'name', direction: 'asc' }}
          rowActions={(a) => (
            <AutomationRowActions
              automation={a}
              onEdit={() => setEditingAutomation(a)}
              onDelete={() => confirmDelete(a.id)}
              onToggleActive={() =>
                toggleActive.mutate({ id: a.id, is_active: !a.is_active })
              }
              onNavigateToLeads={() => navigate(`/leads?automation=${a.id}`)}
              onShowHistory={() => setHistoryAutomation(a)}
            />
          )}
          mobileCardActions={(a) => (
            <AutomationQuickActions
              automation={a}
              onShowHistory={() => setHistoryAutomation(a)}
              onNavigateToLeads={() => navigate(`/leads?automation=${a.id}`)}
            />
          )}
          emptyState={{ icon: Zap, title: 'No automations yet' }}
          bulkDelete={{ entityName: 'automation', onDelete: onBulkDelete }}
          exportOptions={{ fileName: 'Lead Automations' }}
          ariaLabel="Lead automations"
        />
      )}

      {/* Run History Dialog */}
      <Dialog
        open={!!historyAutomation}
        onOpenChange={(open) => !open && setHistoryAutomation(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run History</DialogTitle>
            <DialogDescription>{historyAutomation?.name}</DialogDescription>
          </DialogHeader>
          {historyAutomation && <RunHistoryTable automation={historyAutomation} />}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingAutomation} onOpenChange={(open) => !open && setEditingAutomation(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Automation</DialogTitle>
          </DialogHeader>
          {editingAutomation && (
            <LeadAutomationForm
              editingAutomation={editingAutomation}
              onSuccess={() => setEditingAutomation(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this automation. Leads already created will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Setup Banner Component
function SetupBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3 items-start">
      <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-blue-900 mb-1">One-time setup required</p>
        <p className="text-blue-800 mb-2">
          Lead Generator uses Apify to scrape Google Maps. You need a free Apify API token added
          to your Supabase Edge Function secrets before running automations.
        </p>
        <div className="flex gap-3 flex-wrap">
          <a
            href="https://apify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline text-xs"
          >
            1. Get free Apify account
          </a>
          <span className="text-blue-600 text-xs">
            2. Add APIFY_API_TOKEN to Supabase Edge Function secrets
          </span>
          <span className="text-blue-600 text-xs">
            3. Deploy: supabase functions deploy run-lead-automation
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// Empty State Component
function EmptyState() {
  const { openCreateModal } = useUIStore()

  return (
    <div className="text-center py-20 border-2 border-dashed rounded-lg">
      <Zap className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
      <h3 className="text-xl font-semibold mb-2">No automations yet</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-2">
        Create an automation to start finding leads automatically from Google Maps. Set your
        search criteria once — LineUp handles the rest.
      </p>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        Example: "Find all dental clinics in Munster, IN with no website"
      </p>
      <Button onClick={() => openCreateModal('lead_automation')}>
        <Plus className="h-4 w-4 mr-2" />
        Create First Automation
      </Button>
    </div>
  )
}

function automationFilterLabels(a: LeadAutomation): string[] {
  const labels: string[] = []
  if (a.filter_no_website) labels.push('No website')
  if (a.filter_min_rating) labels.push(`${a.filter_min_rating}+ rating`)
  if (a.filter_category) labels.push(a.filter_category)
  return labels
}

// Run Now button. Owns its own run query so it can show the running state.
function RunNowButton({ automation }: { automation: LeadAutomation }) {
  const { triggerRun } = useLeadAutomationMutations()
  const { data: runs } = useAutomationRuns(automation.id)
  const isRunning = runs?.[0]?.status === 'running' || triggerRun.isPending

  return (
    <Button
      size="sm"
      onClick={(e) => {
        e.stopPropagation()
        triggerRun.mutate({ automationId: automation.id })
      }}
      disabled={isRunning}
    >
      {isRunning ? (
        <>
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          Running...
        </>
      ) : (
        <>
          <Play className="h-3.5 w-3.5 mr-1" />
          Run Now
        </>
      )}
    </Button>
  )
}

// Essential actions pinned to a mobile card
function AutomationQuickActions({
  automation,
  onShowHistory,
  onNavigateToLeads,
}: {
  automation: LeadAutomation
  onShowHistory: () => void
  onNavigateToLeads: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <RunNowButton automation={automation} />
      <Button variant="outline" size="sm" onClick={onNavigateToLeads}>
        <Users className="h-3.5 w-3.5 mr-1" />
        Leads
      </Button>
      <Button variant="ghost" size="sm" onClick={onShowHistory}>
        <History className="h-3.5 w-3.5 mr-1" />
        History
      </Button>
    </div>
  )
}

// Desktop row actions: Run Now plus the existing menu
function AutomationRowActions({
  automation,
  onEdit,
  onDelete,
  onToggleActive,
  onNavigateToLeads,
  onShowHistory,
}: {
  automation: LeadAutomation
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  onNavigateToLeads: () => void
  onShowHistory: () => void
}): ReactNode {
  return (
    <div className="flex items-center justify-end gap-1">
      <RunNowButton automation={automation} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Automation actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNavigateToLeads}>
            <Users className="h-4 w-4 mr-2" />
            View Leads
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShowHistory}>
            <History className="h-4 w-4 mr-2" />
            Run History
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleActive}>
            {automation.is_active ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Activate
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const getDuration = (run: AutomationRun) => {
  if (!run.completed_at) return null
  const start = new Date(run.started_at).getTime()
  const end = new Date(run.completed_at).getTime()
  return Math.round((end - start) / 1000)
}

const RUN_COLUMNS: DataGridColumn<AutomationRun>[] = [
  {
    id: 'started',
    header: 'Started',
    accessor: (run) => new Date(run.started_at),
    exportValue: (run) => format(new Date(run.started_at), 'yyyy-MM-dd HH:mm'),
    cell: (run) => (
      <span className="text-sm">{format(new Date(run.started_at), 'MMM d, h:mm a')}</span>
    ),
    priority: 'primary',
    minWidth: '150px',
  },
  {
    id: 'duration',
    header: 'Duration (s)',
    mobileLabel: 'Duration',
    accessor: (run) => getDuration(run),
    cell: (run) => {
      const seconds = getDuration(run)
      return <span className="text-sm">{seconds === null ? '—' : `${seconds}s`}</span>
    },
    numeric: true,
    width: '120px',
  },
  {
    id: 'status',
    header: 'Status',
    accessor: (run) => run.status,
    cell: (run) => (
      <Badge
        variant={
          run.status === 'success'
            ? 'default'
            : run.status === 'running'
              ? 'secondary'
              : run.status === 'failed'
                ? 'destructive'
                : 'outline'
        }
        className="text-xs capitalize"
      >
        {run.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        {run.status}
      </Badge>
    ),
    priority: 'secondary',
    width: '120px',
  },
  {
    id: 'found',
    header: 'Found',
    accessor: (run) => run.leads_found,
    numeric: true,
    priority: 'secondary',
    width: '90px',
  },
  {
    id: 'created',
    header: 'Created',
    accessor: (run) => run.leads_created,
    cell: (run) => <span className="font-medium text-green-700">+{run.leads_created}</span>,
    numeric: true,
    priority: 'secondary',
    width: '90px',
  },
  {
    id: 'skipped',
    header: 'Skipped',
    accessor: (run) => run.leads_skipped,
    cell: (run) => <span className="text-muted-foreground">{run.leads_skipped}</span>,
    numeric: true,
    priority: 'secondary',
    width: '90px',
  },
]

// Run History Table Component
function RunHistoryTable({ automation }: { automation: LeadAutomation }) {
  const { data: runs, isLoading } = useAutomationRuns(automation.id)

  return (
    <DataGrid
      columns={RUN_COLUMNS}
      data={runs}
      getRowId={(run) => run.id}
      isLoading={isLoading}
      defaultSort={{ columnId: 'started', direction: 'desc' }}
      emptyState={{ icon: History, title: 'No runs yet.' }}
      exportOptions={{ fileName: `${automation.name} - Run History` }}
      ariaLabel={`Run history for ${automation.name}`}
    />
  )
}
