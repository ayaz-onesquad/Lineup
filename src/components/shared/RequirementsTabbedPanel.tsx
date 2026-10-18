import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  Plus,
  CheckSquare,
  MoreVertical,
  ExternalLink,
  Edit,
} from 'lucide-react'
import { computeRequirementStatus, computeKeyDueDate, computeRequirementKeyStartDate, STATUS_LABELS, STATUS_COLORS } from '@/utils/statusUtils'
import {
  formatDate,
  calculateEisenhowerPriority as calcPriority,
  getPriorityColor as getPrioColor,
  getPriorityLabel,
} from '@/lib/utils'
import { useUIStore } from '@/stores'
import type { RequirementWithRelations } from '@/types/database'

/**
 * Severity rank for the six-level priority scale in CLAUDE.md. Lower is more
 * severe, so an ascending sort puts Critical above High. Sorting the labels as
 * text would instead give Critical, High, Low, Medium, Medium-High… which is
 * meaningless to a reader triaging work.
 */
const PRIORITY_SEVERITY_RANK: Record<string, number | undefined> = {
  critical: 1,
  high: 2,
  'medium-high': 3,
  medium: 4,
  'medium-low': 5,
  low: 6,
}

/** The sortable value behind the Priority column: 1 (Critical) … 6 (Low). */
function prioritySeverity(req: RequirementWithRelations): number {
  const score = calcPriority(req.importance, req.urgency)
  // The Eisenhower score is already 1-6; routing it through the label keeps the
  // rank tied to the named scale rather than to that implementation detail.
  return PRIORITY_SEVERITY_RANK[getPriorityLabel(score).toLowerCase()] ?? score
}

interface RequirementsTabbedPanelProps {
  requirements: RequirementWithRelations[] | undefined
  isLoading?: boolean
  // Context for creating new requirements
  createContext?: {
    client_id?: string
    set_id?: string
    pitch_id?: string
    project_id?: string
    phase_id?: string
  }
  // Optional custom create handler (overrides createContext behavior)
  onCreateClick?: () => void
  // Whether to show parent columns (set, project)
  showSetColumn?: boolean
  showProjectColumn?: boolean
  // Empty state message
  emptyMessage?: string
}

export function RequirementsTabbedPanel({
  requirements,
  isLoading = false,
  createContext,
  onCreateClick,
  showSetColumn: _showSetColumn = true,
  showProjectColumn: _showProjectColumn = true,
  emptyMessage = 'No requirements yet',
}: RequirementsTabbedPanelProps) {
  // Note: showSetColumn and showProjectColumn are kept for backward compatibility
  // but columns are now standardized across all child tables
  void _showSetColumn
  void _showProjectColumn
  const navigate = useNavigate()
  const { openDetailPanel, openCreateModal } = useUIStore()
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open')

  // Split requirements into open and completed based on completed_date (actual_end_date)
  // Per status engine: 'Open' = completed_date IS NULL, 'Completed' = completed_date IS NOT NULL
  const { openRequirements, completedRequirements } = useMemo(() => {
    if (!requirements) return { openRequirements: [], completedRequirements: [] }

    // Filter by completed_date (requirements use completed_date as their actual_end_date)
    const open = requirements.filter((r) => !r.completed_date)
    const completed = requirements.filter((r) => !!r.completed_date)

    return { openRequirements: open, completedRequirements: completed }
  }, [requirements])

  const handleCreate = useCallback(() => {
    if (onCreateClick) {
      onCreateClick()
    } else if (createContext) {
      openCreateModal('requirement', createContext)
    }
  }, [onCreateClick, createContext, openCreateModal])

  // Determine if create button should be shown
  const showCreateButton = !!onCreateClick || !!createContext

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the title identifies the
  // row; status, priority, lead and the key end date are the four facts needed
  // to triage a requirement without opening it; the display ID is desktop-only
  // noise. Every scalar column carries an accessor, so every one of them sorts
  // (section 4.2) — including from the mobile sort sheet, which is the bug this
  // migration fixes.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<RequirementWithRelations>[]>(
    () => [
      {
        id: 'requirement_order',
        header: 'Order',
        mobileLabel: 'Order',
        numeric: true,
        width: '80px',
        accessor: row => row.requirement_order,
      },
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '100px',
        accessor: row => row.display_id ?? 0,
        cell: row =>
          row.display_id ? (
            <Badge variant="outline" className="font-mono text-xs">
              #{row.display_id}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'title',
        header: 'Name',
        priority: 'primary',
        hideable: false,
        minWidth: '220px',
        accessor: row => row.title,
        cell: row => (
          <div className="min-w-0 font-medium">
            <TruncatedCell value={row.title} maxLines={1} />
          </div>
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        priority: 'secondary',
        width: '120px',
        // Sorts by severity rank, not by label text.
        accessor: row => prioritySeverity(row),
        cell: row => {
          const score = calcPriority(row.importance, row.urgency)
          return (
            <Badge className={getPrioColor(score)}>
              P{score}
              <span className="sr-only"> {getPriorityLabel(score)}</span>
            </Badge>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '140px',
        accessor: row => STATUS_LABELS[computeRequirementStatus(row)],
        cell: row => {
          const status = computeRequirementStatus(row)
          return <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
        },
      },
      {
        id: 'lead',
        header: 'Lead',
        priority: 'secondary',
        width: '160px',
        accessor: row => row.assigned_to?.full_name ?? '',
        cell: row => <TruncatedCell value={row.assigned_to?.full_name} maxLines={1} />,
      },
      {
        id: 'key_end',
        header: 'Key End',
        mobileLabel: 'Due',
        priority: 'secondary',
        width: '140px',
        accessor: row => computeKeyDueDate(row),
        cell: row => {
          const keyEnd = computeKeyDueDate(row)
          return keyEnd ? (
            <span>{formatDate(keyEnd)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        id: 'key_start',
        header: 'Key Start',
        width: '140px',
        accessor: row => computeRequirementKeyStartDate(row),
        cell: row => {
          const keyStart = computeRequirementKeyStartDate(row)
          return keyStart ? (
            <span>{formatDate(keyStart)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
    ],
    []
  )

  // Row actions live on the desktop row only; on mobile the whole card opens the
  // record and the actions are on the detail page (section 4.5).
  const rowActions = useCallback(
    (row: RequirementWithRelations) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Requirement actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-50">
          <DropdownMenuItem onClick={() => openDetailPanel('requirement', row.id)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Quick View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/requirements/${row.id}?edit=true`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [navigate, openDetailPanel]
  )

  const renderGrid = (
    reqs: RequirementWithRelations[],
    {
      storageKey,
      ariaLabel,
      emptyTitle,
      withCreateAction,
    }: {
      storageKey: string
      ariaLabel: string
      emptyTitle: string
      withCreateAction: boolean
    }
  ) => (
    <DataGrid
      columns={columns}
      data={reqs}
      getRowId={row => row.id}
      isLoading={isLoading}
      density="compact"
      // Distinct keys per tab so the two grids do not share sort state.
      storageKey={storageKey}
      defaultSort={{ columnId: 'requirement_order', direction: 'asc' }}
      ariaLabel={ariaLabel}
      // Single click opens the quick-view panel; double click, Enter or a
      // mobile tap opens the record. Section 4.5.
      onRowClick={row => openDetailPanel('requirement', row.id)}
      onRowOpen={row => navigate(`/requirements/${row.id}`)}
      rowActions={rowActions}
      emptyState={{
        icon: CheckSquare,
        title: emptyTitle,
        action:
          withCreateAction && showCreateButton ? (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Requirement
            </Button>
          ) : undefined,
      }}
    />
  )

  return (
    <div className="space-y-4">
      {/* Create button */}
      {showCreateButton && (
        <div className="flex justify-end">
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Requirement
          </Button>
        </div>
      )}

      {/* Tabbed view for Open/Completed */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'open' | 'completed')}>
        <TabsList>
          <TabsTrigger value="open" className="gap-2">
            Open
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {openRequirements.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            Completed
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {completedRequirements.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          {renderGrid(openRequirements, {
            storageKey: 'requirements-panel-open',
            ariaLabel: 'Open requirements',
            emptyTitle: emptyMessage,
            withCreateAction: true,
          })}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {renderGrid(completedRequirements, {
            storageKey: 'requirements-panel-completed',
            ariaLabel: 'Completed requirements',
            emptyTitle: 'No completed requirements',
            withCreateAction: false,
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}
