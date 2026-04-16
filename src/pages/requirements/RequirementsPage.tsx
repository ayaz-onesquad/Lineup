import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useRequirements, useRequirementMutations, useClients, useProjects, usePhases, useSets, usePitches, useDataGridFilters, type FilterConfig } from '@/hooks'
import { useTenantUsers } from '@/hooks/useTenant'
import { useUIStore, useTenantStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Plus, CheckSquare, Kanban, List, GripVertical, Info, Upload, MoreVertical, Trash2, Eye, Edit, Filter } from 'lucide-react'
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
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { GridEditTable, type GridColumn } from '@/components/shared/GridEditTable'
import { BulkActionBar, storeListContext, FilterBar, type RowClickContext } from '@/components/shared'
import { toast } from '@/hooks/use-toast'
import { formatDate, getInitials, getPriorityColor, calculateEisenhowerPriority } from '@/lib/utils'
import { computeRequirementStatus, getStatusLabel, getStatusColor, isPastDueStatus } from '@/utils/statusUtils'
import type { RequirementWithRelations, UpdateRequirementInput, ComputedStatus } from '@/types/database'

// Urgency and Importance options
const URGENCY_OPTIONS: SearchableSelectOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const IMPORTANCE_OPTIONS: SearchableSelectOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

// Computed status columns for Kanban (status is now READ-ONLY)
const statusColumns: { status: ComputedStatus | 'past_due'; label: string; color: string; borderColor: string }[] = [
  { status: 'active', label: 'Active', color: 'bg-blue-50', borderColor: 'border-t-blue-500' },
  { status: 'on_deck', label: 'On Deck', color: 'bg-amber-50', borderColor: 'border-t-amber-500' },
  { status: 'past_due', label: 'Past Due', color: 'bg-red-50', borderColor: 'border-t-red-500' },
  { status: 'completed', label: 'Completed', color: 'bg-green-50', borderColor: 'border-t-green-500' },
]

export function RequirementsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [deleteRequirementId, setDeleteRequirementId] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data: requirements, isLoading } = useRequirements()
  const { data: clients } = useClients()
  const { data: projects } = useProjects()
  const { data: phases } = usePhases()
  const { data: sets } = useSets()
  const { data: pitches } = usePitches()
  const { updateRequirement, deleteRequirement } = useRequirementMutations()
  const { currentTenant } = useTenantStore()
  const { data: tenantUsers } = useTenantUsers(currentTenant?.id)
  const { openCreateModal, openDetailPanel } = useUIStore()

  // Build user options for assigned_to dropdown
  const userOptions: SearchableSelectOption[] = useMemo(() => {
    if (!tenantUsers) return []
    return tenantUsers.map((user) => ({
      value: user.user_profiles?.id || user.id,
      label: user.user_profiles?.full_name || 'Unknown User',
    }))
  }, [tenantUsers])

  // Filter configuration
  const filterConfig: FilterConfig = useMemo(() => ({
    search: true,
    status: ['active', 'on_deck', 'past_due', 'completed', 'future'],
    parentFilters: [
      {
        key: 'client_id',
        label: 'Client',
        options: clients?.map((c) => ({ value: c.id, label: c.name })) ?? [],
      },
      {
        key: 'project_id',
        label: 'Project',
        options: projects?.map((p) => ({ value: p.id, label: p.name })) ?? [],
      },
      {
        key: 'phase_id',
        label: 'Phase',
        options: phases?.map((p) => ({ value: p.id, label: p.name })) ?? [],
      },
      {
        key: 'set_id',
        label: 'Set',
        options: sets?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: 'pitch_id',
        label: 'Pitch',
        options: pitches?.map((p) => ({ value: p.id, label: p.name })) ?? [],
      },
    ],
    dateRangeField: 'expected_due_date',
  }), [clients, projects, phases, sets, pitches])

  const {
    filters,
    setSearch,
    setStatuses,
    setParent,
    setDateFrom,
    setDateTo,
    clearAll,
    hasActiveFilters,
    activeFilterCount,
    applyFilters,
  } = useDataGridFilters(filterConfig)

  // Apply filters to requirements data
  const filteredRequirements = useMemo(() => {
    if (!requirements) return []
    return applyFilters(
      requirements,
      ['title', 'display_id'],
      (row) => computeRequirementStatus(row)
    )
  }, [requirements, applyFilters])

  // Navigate to requirement detail and store list context for Save & Next
  // When called from GridEditTable, context provides the sorted IDs
  const navigateToRequirement = useCallback((id: string, editMode = false, context?: RowClickContext) => {
    const ids = context?.sortedIds ?? filteredRequirements.map((r) => r.id)
    storeListContext(ids, context?.source ?? 'requirements_overview')
    navigate(`/requirements/${id}${editMode ? '?edit=true' : ''}`)
  }, [filteredRequirements, navigate])

  // Get selected rows for bulk actions
  const selectedRows = useMemo(() => {
    return filteredRequirements.filter((req) => rowSelection[req.id])
  }, [filteredRequirements, rowSelection])

  // Handle bulk delete
  const handleBulkDelete = useCallback(async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteRequirement.mutateAsync(id))
    )
    const failures = results.filter((r) => r.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['requirements'] })
    if (failures.length > 0) {
      toast({
        title: 'Some deletions failed',
        description: `${ids.length - failures.length} of ${ids.length} requirements deleted.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Requirements deleted',
        description: `${ids.length} requirement${ids.length !== 1 ? 's' : ''} deleted successfully.`,
      })
    }
  }, [deleteRequirement, queryClient])

  // Get requirements by computed status (status is now READ-ONLY calculated from dates)
  const getRequirementsByStatus = (status: ComputedStatus | 'past_due') => {
    return filteredRequirements?.filter((req) => {
      // Always use computeRequirementStatus to get the correct status from dates
      const computed = computeRequirementStatus(req)
      // 'past_due' column should include all past_due variants
      if (status === 'past_due') {
        return isPastDueStatus(computed)
      }
      return computed === status
    })
  }

  // Grid columns definition
  const columns: GridColumn<RequirementWithRelations>[] = useMemo(() => [
    {
      key: 'display_id',
      header: 'Req ID',
      editable: false,
      enableHiding: false, // ID column cannot be hidden
      width: '90px',
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.display_id ? `REQ-${row.display_id}` : '—'}
        </span>
      ),
    },
    {
      key: 'clients.name',
      header: 'Client',
      editable: false,
      render: (row) => row.clients?.name || row.sets?.projects?.clients?.name || '—',
    },
    {
      key: 'sets.projects.name',
      header: 'Project',
      editable: false,
      render: (row) => row.sets?.projects?.name || '—',
    },
    {
      key: 'sets.name',
      header: 'Set',
      editable: false,
      render: (row) => row.sets?.name || '—',
    },
    {
      key: 'title',
      header: 'Title',
      editable: true,
      type: 'text',
      render: (row) => (
        <span className="font-medium">{row.title}</span>
      ),
    },
    {
      key: 'urgency',
      header: 'Urgency',
      editable: true,
      type: 'select',
      options: URGENCY_OPTIONS,
      render: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.urgency || '—'}
        </Badge>
      ),
    },
    {
      key: 'importance',
      header: 'Importance',
      editable: true,
      type: 'select',
      options: IMPORTANCE_OPTIONS,
      render: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.importance || '—'}
        </Badge>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      editable: false, // Calculated field
      render: (row) => {
        const priority = (row.priority || calculateEisenhowerPriority(row.importance, row.urgency)) as 1 | 2 | 3 | 4 | 5 | 6
        return (
          <Badge className={getPriorityColor(priority)} variant="outline">
            P{priority}
          </Badge>
        )
      },
    },
    {
      key: 'assigned_to_id',
      header: 'Assigned To',
      editable: true,
      type: 'select',
      options: userOptions,
      render: (row) => row.assigned_to ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">
              {getInitials(row.assigned_to.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">{row.assigned_to.full_name}</span>
        </div>
      ) : '—',
    },
    {
      key: 'expected_due_date',
      header: 'Due Date',
      editable: true,
      type: 'date',
      render: (row) => row.expected_due_date ? formatDate(row.expected_due_date) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      editable: false, // Computed from dates
      render: (row) => (
        <Badge className={getStatusColor(computeRequirementStatus(row))}>
          {getStatusLabel(computeRequirementStatus(row))}
        </Badge>
      ),
    },
  ], [userOptions])

  // Handle delete for GridEditTable
  const handleDelete = useCallback(async (row: RequirementWithRelations) => {
    await deleteRequirement.mutateAsync(row.id)
  }, [deleteRequirement])

  // Handle delete confirmation for Kanban view
  const handleConfirmKanbanDelete = useCallback(async () => {
    if (!deleteRequirementId) return
    await deleteRequirement.mutateAsync(deleteRequirementId)
    setDeleteRequirementId(null)
  }, [deleteRequirementId, deleteRequirement])

  // Handle grid save
  const handleGridSave = useCallback(async (dirtyRows: Map<string, Partial<RequirementWithRelations>>) => {
    const updates = Array.from(dirtyRows.entries())
    const results = await Promise.allSettled(
      updates.map(([id, changes]) => {
        const updateData: UpdateRequirementInput = {}
        if ('title' in changes) updateData.title = changes.title as string
        if ('description' in changes) updateData.description = changes.description as string
        if ('urgency' in changes) updateData.urgency = changes.urgency as 'low' | 'medium' | 'high'
        if ('importance' in changes) updateData.importance = changes.importance as 'low' | 'medium' | 'high'
        if ('assigned_to_id' in changes) updateData.assigned_to_id = changes.assigned_to_id as string | undefined
        if ('expected_due_date' in changes) updateData.expected_due_date = changes.expected_due_date as string | undefined
        return updateRequirement.mutateAsync({ id, ...updateData })
      })
    )

    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      throw new Error(`${failures.length} updates failed`)
    }
  }, [updateRequirement])

  const renderRequirementCard = (req: RequirementWithRelations) => (
    <div
      key={req.id}
      className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => openDetailPanel('requirement', req.id)}
      onDoubleClick={() => navigateToRequirement(req.id)}
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
        <div className="flex-1">
          <p className="text-sm font-medium line-clamp-2">{req.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {req.sets?.projects?.name} • {req.sets?.name}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                navigateToRequirement(req.id)
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                navigateToRequirement(req.id, true)
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteRequirementId(req.id)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center justify-between mt-3">
        <Badge variant="outline" className="text-xs">
          {req.requirement_type.replace('_', ' ')}
        </Badge>
        <div className="flex items-center gap-2">
          {req.expected_due_date && (
            <span
              className={`text-xs ${
                new Date(req.expected_due_date) < new Date() && req.status !== 'completed'
                  ? 'text-red-600'
                  : 'text-muted-foreground'
              }`}
            >
              {formatDate(req.expected_due_date)}
            </span>
          )}
          {req.assigned_to && (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                {getInitials(req.assigned_to.full_name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">All Requirements</h1>
          <p className="text-sm text-muted-foreground">Manage project requirements</p>
        </div>
        <Button onClick={() => openCreateModal('requirement')}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New Requirement
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        <>
          {/* Toolbar Row for Kanban */}
          <div className="flex items-center gap-2 mb-3">
            {/* Result count - only when filters active */}
            {hasActiveFilters && (
              <span className="text-xs text-muted-foreground">
                {filteredRequirements.length} of {requirements?.length ?? 0}
              </span>
            )}

            {/* Push buttons to the right */}
            <div className="ml-auto flex items-center gap-2">
              {/* Filter toggle button */}
              <Button
                variant={filtersOpen || hasActiveFilters ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setFiltersOpen(v => !v)}
                className="gap-1.5"
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="h-4 px-1 text-xs ml-0.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              {/* View toggle */}
              <div className="flex items-center border rounded-md" role="group" aria-label="View mode">
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-r-none h-9 w-9"
                  onClick={() => setViewMode('kanban')}
                  aria-label="Kanban view"
                  aria-pressed={true}
                >
                  <Kanban className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-l-none h-9 w-9"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  aria-pressed={false}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {/* Import button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkUpload(true)}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
            </div>
          </div>

          {/* Collapsible filter section */}
          <FilterBar
            config={filterConfig}
            filters={filters}
            onSearch={setSearch}
            onStatuses={setStatuses}
            onParent={setParent}
            onDateFrom={setDateFrom}
            onDateTo={setDateTo}
            onClearAll={clearAll}
            hasActiveFilters={hasActiveFilters}
            resultCount={filteredRequirements.length}
            totalCount={requirements?.length ?? 0}
            collapsed={!filtersOpen}
          />

          {/* Kanban Board */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto">
            {statusColumns.map((column) => (
              <div key={column.status} className="flex flex-col">
                <Card className={`${column.color} border-t-4 ${column.borderColor}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      {column.label}
                      <Badge variant="secondary">
                        {getRequirementsByStatus(column.status)?.length || 0}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 min-h-[400px] max-h-[600px] overflow-y-auto">
                    {getRequirementsByStatus(column.status)?.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No requirements
                      </p>
                    ) : (
                      getRequirementsByStatus(column.status)?.map(renderRequirementCard)
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* List View - GridEditTable */
        <Card className="card-carbon">
          <CardContent className="p-4">
            {/* Table interaction hint */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-muted/30 rounded-lg mb-4 text-xs text-muted-foreground">
              <Info className="h-3 w-3" aria-hidden="true" />
              <span>Click a row to preview, double-click to open full details</span>
            </div>

            {/* Toolbar Row */}
            <div className="flex items-center gap-2 mb-3">
              {/* Result count - only when filters active */}
              {hasActiveFilters && (
                <span className="text-xs text-muted-foreground">
                  {filteredRequirements.length} of {requirements?.length ?? 0}
                </span>
              )}

              {/* Push buttons to the right */}
              <div className="ml-auto flex items-center gap-2">
                {/* Filter toggle button */}
                <Button
                  variant={filtersOpen || hasActiveFilters ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setFiltersOpen(v => !v)}
                  className="gap-1.5"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="default" className="h-4 px-1 text-xs ml-0.5">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>

                {/* View toggle */}
                <div className="flex items-center border rounded-md" role="group" aria-label="View mode">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-r-none h-9 w-9"
                    onClick={() => setViewMode('kanban')}
                    aria-label="Kanban view"
                  >
                    <Kanban className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-l-none h-9 w-9"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                {/* Import button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkUpload(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
              </div>
            </div>

            {/* Collapsible filter section */}
            <FilterBar
              config={filterConfig}
              filters={filters}
              onSearch={setSearch}
              onStatuses={setStatuses}
              onParent={setParent}
              onDateFrom={setDateFrom}
              onDateTo={setDateTo}
              onClearAll={clearAll}
              hasActiveFilters={hasActiveFilters}
              resultCount={filteredRequirements.length}
              totalCount={requirements?.length ?? 0}
              collapsed={!filtersOpen}
            />

            <GridEditTable
              columns={columns}
              data={filteredRequirements}
              isLoading={isLoading}
              onSave={handleGridSave}
              onRowClick={(row) => openDetailPanel('requirement', row.id)}
              onRowDoubleClick={(row, context) => navigateToRequirement(row.id, false, context)}
              onDelete={handleDelete}
              deleteLabel="requirement"
              emptyMessage="No requirements found"
              emptyIcon={<CheckSquare className="h-12 w-12 text-muted-foreground" />}
              emptyAction={
                <Button onClick={() => openCreateModal('requirement')}>
                  Create your first requirement
                </Button>
              }
              enableSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              storageKey="requirements_overview"
            />
          </CardContent>
        </Card>
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="requirements"
      />

      {/* Delete Confirmation Dialog for Kanban view */}
      <AlertDialog open={!!deleteRequirementId} onOpenChange={(open) => !open && setDeleteRequirementId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Requirement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this requirement? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmKanbanDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedRows={selectedRows}
        entityName="requirement"
        entityPath="requirements"
        onClearSelection={() => setRowSelection({})}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </div>
  )
}
