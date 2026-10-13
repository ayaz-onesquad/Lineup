import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetitors, useCompetitorMutations } from '@/hooks/useCompetitors'
import { useUIStore } from '@/stores'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { GridToolbar, GridSearch } from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Swords,
  Plus,
  MoreVertical,
  ExternalLink,
  Trash2,
  Edit,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/urlSafety'
import type { Competitor } from '@/types/database'

// Threat level badge colors
const threatLevelColors: Record<string, string> = {
  critical: 'bg-red-500 text-white hover:bg-red-600',
  high: 'bg-orange-500 text-white hover:bg-orange-600',
  medium: 'bg-yellow-500 text-black hover:bg-yellow-600',
  low: 'bg-gray-400 text-white hover:bg-gray-500',
}

// Sort order for the threat level column: critical first when descending.
const threatLevelRank: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

// Status badge variants
const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  acquired: 'outline',
  defunct: 'destructive',
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function truncateUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.slice(0, 30)
  }
}

export function CompetitorsPage() {
  const navigate = useNavigate()
  const { data: competitors, isLoading, error, refetch } = useCompetitors()
  const { deleteCompetitor } = useCompetitorMutations()
  const { openCreateModal } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [competitorToDelete, setCompetitorToDelete] = useState<string | null>(null)

  const hasActiveFilters = !!searchQuery
  const clearFilters = () => setSearchQuery('')

  // Filter competitors by search query
  const filteredCompetitors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return competitors ?? []
    return (competitors ?? []).filter(
      c =>
        c.name.toLowerCase().includes(query) ||
        c.industry?.toLowerCase().includes(query) ||
        c.target_market?.toLowerCase().includes(query)
    )
  }, [competitors, searchQuery])

  const handleDelete = async () => {
    if (competitorToDelete) {
      await deleteCompetitor.mutateAsync(competitorToDelete)
      setDeleteDialogOpen(false)
      setCompetitorToDelete(null)
    }
  }

  const confirmDelete = (id: string) => {
    setCompetitorToDelete(id)
    setDeleteDialogOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the name identifies the
  // row, and industry, threat level, status and the review date are what you
  // need to triage the competitive landscape without opening a record.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<Competitor>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '120px',
        accessor: row => row.display_id ?? 0,
        cell: row => (
          <Badge variant="outline" className="font-mono text-xs">
            COMP-{String(row.display_id ?? 0).padStart(4, '0')}
          </Badge>
        ),
      },
      {
        id: 'name',
        header: 'Name',
        priority: 'primary',
        hideable: false,
        minWidth: '200px',
        accessor: row => row.name,
        cell: row => (
          <span className="font-medium">
            <TruncatedCell value={row.name} maxLines={1} />
          </span>
        ),
      },
      {
        id: 'industry',
        header: 'Industry',
        priority: 'secondary',
        width: '170px',
        accessor: row => row.industry ?? '',
        cell: row => <TruncatedCell value={row.industry} maxLines={1} />,
      },
      {
        id: 'threat_level',
        header: 'Threat Level',
        priority: 'secondary',
        mobileLabel: 'Threat',
        width: '150px',
        // Ranked, not alphabetical: "critical" is not between "high" and "low".
        accessor: row => (row.threat_level ? threatLevelRank[row.threat_level] : null),
        cell: row =>
          row.threat_level ? (
            <Badge className={threatLevelColors[row.threat_level]}>
              {titleCase(row.threat_level)}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '140px',
        accessor: row => row.status,
        cell: row => (
          <Badge variant={statusVariants[row.status]}>{titleCase(row.status)}</Badge>
        ),
      },
      {
        id: 'last_reviewed_at',
        header: 'Last Reviewed',
        priority: 'secondary',
        mobileLabel: 'Reviewed',
        width: '160px',
        accessor: row => row.last_reviewed_at,
        cell: row =>
          row.last_reviewed_at ? (
            <span>{formatDate(row.last_reviewed_at)}</span>
          ) : (
            <span className="text-muted-foreground">Never</span>
          ),
      },
      {
        id: 'website',
        header: 'Website',
        width: '190px',
        accessor: row => (row.website ? truncateUrl(row.website) : ''),
        cell: row =>
          row.website ? (
            // safeHttpUrl rejects anything that is not http(s), so a stored
            // `javascript:` value cannot become an executable href.
            <a
              href={safeHttpUrl(row.website) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-[170px] items-center gap-1 truncate text-primary hover:underline"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{truncateUrl(row.website)}</span>
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    []
  )

  return (
    <PageShell
      title="Competitor Tracker"
      description="Monitor and analyze your competitive landscape"
      icon={Swords}
      actions={
        <Button onClick={() => openCreateModal('competitor')} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Competitor
        </Button>
      }
    >
      <DataGrid
        columns={columns}
        data={filteredCompetitors}
        getRowId={row => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="competitors"
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        ariaLabel="Competitors"
        // Double click, Enter or a mobile tap opens the record; there is no
        // quick-view panel for competitors, so single click does nothing.
        onRowOpen={row => navigate(`/competitors/${row.id}`)}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        emptyState={{
          icon: Swords,
          title: 'No competitors yet',
          description: 'Start by adding your first competitor.',
          action: (
            <Button onClick={() => openCreateModal('competitor')}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Competitor
            </Button>
          ),
        }}
        toolbar={
          <GridToolbar
            search={
              <GridSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, industry or target market..."
              />
            }
          />
        }
        rowActions={row => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Competitor actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50">
              <DropdownMenuItem onClick={() => navigate(`/competitors/${row.id}?edit=true`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/competitors/${row.id}`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => confirmDelete(row.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Competitor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this competitor record. This action cannot be
              undone.
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
    </PageShell>
  )
}
