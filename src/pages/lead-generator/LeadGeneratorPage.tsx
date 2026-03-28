import { useState, useMemo } from 'react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  ChevronDown,
  Globe,
  Loader2,
  X,
  Info,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

export function LeadGeneratorPage() {
  const navigate = useNavigate()
  const { data: automations, isLoading } = useLeadAutomations()
  const { openCreateModal } = useUIStore()
  const [editingAutomation, setEditingAutomation] = useState<LeadAutomation | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [automationToDelete, setAutomationToDelete] = useState<string | null>(null)
  const { deleteAutomation } = useLeadAutomationMutations()

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

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lead Generator</h1>
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
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : automations?.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {automations?.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onEdit={() => setEditingAutomation(a)}
              onDelete={() => confirmDelete(a.id)}
              onNavigateToLeads={() => navigate(`/leads?automation=${a.id}`)}
            />
          ))}
        </div>
      )}

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

// Automation Card Component
function AutomationCard({
  automation,
  onEdit,
  onDelete,
  onNavigateToLeads,
}: {
  automation: LeadAutomation
  onEdit: () => void
  onDelete: () => void
  onNavigateToLeads: () => void
}) {
  const { triggerRun, toggleActive } = useLeadAutomationMutations()
  const { data: runs } = useAutomationRuns(automation.id)
  const [showRuns, setShowRuns] = useState(false)

  const latestRun = runs?.[0]
  const isRunning = latestRun?.status === 'running' || triggerRun.isPending

  const handleToggleActive = () => {
    toggleActive.mutate({ id: automation.id, is_active: !automation.is_active })
  }

  const handleTriggerRun = () => {
    triggerRun.mutate({ automationId: automation.id })
  }

  return (
    <Card className="card-carbon">
      <CardContent className="pt-4 pb-4">
        {/* Top row: status badge + name + menu */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant={automation.is_active ? 'default' : 'secondary'}>
              {automation.is_active ? 'Active' : 'Paused'}
            </Badge>
            <h3 className="font-semibold text-lg">{automation.name}</h3>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleActive}>
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

        {/* Search config summary */}
        <p className="text-sm text-muted-foreground mb-1">
          <span className="font-medium text-foreground">"{automation.search_query}"</span> in{' '}
          <span className="font-medium text-foreground">{automation.location}</span>
        </p>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {automation.filter_no_website && (
            <Badge variant="outline" className="text-xs">
              <Globe className="h-3 w-3 mr-1 line-through opacity-50" />
              No website
            </Badge>
          )}
          {automation.filter_min_rating && (
            <Badge variant="outline" className="text-xs">
              {automation.filter_min_rating}+ rating
            </Badge>
          )}
          {automation.filter_category && (
            <Badge variant="outline" className="text-xs">
              {automation.filter_category}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            max {automation.max_leads} leads
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {automation.frequency === 'manual' ? 'Manual only' : automation.frequency}
          </Badge>
        </div>

        {/* Last run summary */}
        {latestRun && (
          <p className="text-xs text-muted-foreground mb-3">
            Last run: {formatDistanceToNow(new Date(latestRun.started_at), { addSuffix: true })}
            {latestRun.status === 'success' &&
              ` — ${latestRun.leads_created} created, ${latestRun.leads_skipped} skipped`}
            {latestRun.status === 'partial' &&
              ` — ${latestRun.leads_created} created, ${latestRun.leads_skipped} skipped`}
            {latestRun.status === 'failed' && (
              <span className="text-destructive"> — Failed</span>
            )}
          </p>
        )}

        {/* Stats */}
        <p className="text-xs text-muted-foreground mb-3">
          Total leads generated: <span className="font-medium">{automation.total_leads_generated}</span>
        </p>

        {/* Action buttons row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={handleTriggerRun} disabled={isRunning}>
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

          <Button variant="outline" size="sm" onClick={onNavigateToLeads}>
            <Users className="h-3.5 w-3.5 mr-1" />
            View Leads
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setShowRuns(!showRuns)}>
            <ChevronDown
              className={cn('h-3.5 w-3.5 mr-1 transition-transform', showRuns && 'rotate-180')}
            />
            Run History
          </Button>
        </div>

        {/* Expandable run history table */}
        {showRuns && (
          <div className="mt-4 border-t pt-4">
            <RunHistoryTable runs={runs ?? []} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Run History Table Component
function RunHistoryTable({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet.</p>
  }

  const getDuration = (run: AutomationRun) => {
    if (!run.completed_at) return '—'
    const start = new Date(run.started_at).getTime()
    const end = new Date(run.completed_at).getTime()
    const seconds = Math.round((end - start) / 1000)
    return `${seconds}s`
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Found</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Skipped</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.slice(0, 5).map((run) => (
          <TableRow key={run.id}>
            <TableCell className="text-sm">
              {format(new Date(run.started_at), 'MMM d, h:mm a')}
            </TableCell>
            <TableCell className="text-sm">{getDuration(run)}</TableCell>
            <TableCell>
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
                {run.status === 'running' && (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                )}
                {run.status}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{run.leads_found}</TableCell>
            <TableCell className="text-sm font-medium text-green-700">
              +{run.leads_created}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{run.leads_skipped}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
