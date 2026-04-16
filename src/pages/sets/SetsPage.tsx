import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSets, useSetMutations, useClients, useProjects, usePhases, useDataGridFilters, type FilterConfig } from '@/hooks'
import { useTenantUsers } from '@/hooks/useTenant'
import { useUIStore, useTenantStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Plus, Layers, Grid, LayoutGrid, Upload, Filter } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { GridEditTable, type GridColumn } from '@/components/shared/GridEditTable'
import { BulkActionBar, storeListContext, FilterBar, type RowClickContext } from '@/components/shared'
import { toast } from '@/hooks/use-toast'
import { getPriorityColor, calculateEisenhowerPriority } from '@/lib/utils'
import { computeDisplayStatus, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import type { SetWithRelations, UpdateSetInput } from '@/types/database'

// Urgency and Importance options for grid edit
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

export function SetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('list')
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data: sets, isLoading } = useSets()
  const { data: clients } = useClients()
  const { data: projects } = useProjects()
  const { data: phases } = usePhases()
  const { updateSet, deleteSet } = useSetMutations()
  const { currentTenant } = useTenantStore()
  const { data: tenantUsers } = useTenantUsers(currentTenant?.id)
  const { openCreateModal, openDetailPanel } = useUIStore()

  // Build user options for lead dropdown
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
    ],
    dateRangeField: 'expected_end_date',
  }), [clients, projects, phases])

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

  // Apply filters to sets data
  const filteredSets = useMemo(() => {
    if (!sets) return []
    return applyFilters(
      sets,
      ['name', 'display_id'],
      (row) => computeDisplayStatus(row)
    )
  }, [sets, applyFilters])

  // Navigate to set detail and store list context for Save & Next
  // When called from GridEditTable, context provides the sorted IDs
  const navigateToSet = useCallback((id: string, editMode = false, context?: RowClickContext) => {
    // Use sorted IDs from context if provided, otherwise fall back to filteredSets order
    const ids = context?.sortedIds ?? filteredSets.map((s) => s.id)
    storeListContext(ids, context?.source ?? 'sets_overview')
    navigate(`/sets/${id}${editMode ? '?edit=true' : ''}`)
  }, [filteredSets, navigate])

  // Get selected rows for bulk actions
  const selectedRows = useMemo(() => {
    return filteredSets.filter((set) => rowSelection[set.id])
  }, [filteredSets, rowSelection])

  // Handle bulk delete
  const handleBulkDelete = useCallback(async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteSet.mutateAsync(id))
    )
    const failures = results.filter((r) => r.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['sets'] })
    if (failures.length > 0) {
      toast({
        title: 'Some deletions failed',
        description: `${ids.length - failures.length} of ${ids.length} sets deleted.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Sets deleted',
        description: `${ids.length} set${ids.length !== 1 ? 's' : ''} deleted successfully.`,
      })
    }
  }, [deleteSet, queryClient])

  // Grid columns definition
  const columns: GridColumn<SetWithRelations>[] = useMemo(() => [
    {
      key: 'display_id',
      header: 'Set ID',
      editable: false,
      enableHiding: false, // ID column cannot be hidden
      width: '90px',
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.display_id ? `SET-${row.display_id}` : '—'}
        </span>
      ),
    },
    {
      key: 'clients.name',
      header: 'Client',
      editable: false,
      render: (row) => row.clients?.name || row.projects?.clients?.name || '—',
    },
    {
      key: 'projects.name',
      header: 'Project',
      editable: false,
      render: (row) => row.projects?.name || '—',
    },
    {
      key: 'name',
      header: 'Set Name',
      editable: true,
      type: 'text',
      render: (row) => (
        <span className="font-medium">{row.name}</span>
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
          {row.urgency}
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
          {row.importance}
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
      key: 'status',
      header: 'Status',
      editable: false, // Derived field
      render: (row) => (
        <Badge className={getStatusColor(computeDisplayStatus(row))} variant="outline">
          {getStatusLabel(computeDisplayStatus(row))}
        </Badge>
      ),
    },
    {
      key: 'lead_id',
      header: 'Lead',
      editable: true,
      type: 'select',
      options: userOptions,
      render: (row) => row.lead?.full_name || row.owner?.full_name || '—',
    },
  ], [userOptions])

  // Handle grid save
  const handleGridSave = useCallback(async (dirtyRows: Map<string, Partial<SetWithRelations>>) => {
    const updates = Array.from(dirtyRows.entries())
    const results = await Promise.allSettled(
      updates.map(([id, changes]) => {
        const updateData: UpdateSetInput = {}
        if ('name' in changes) updateData.name = changes.name as string
        if ('description' in changes) updateData.description = changes.description as string
        if ('urgency' in changes) updateData.urgency = changes.urgency as 'low' | 'medium' | 'high'
        if ('importance' in changes) updateData.importance = changes.importance as 'low' | 'medium' | 'high'
        if ('lead_id' in changes) updateData.lead_id = changes.lead_id as string | null
        return updateSet.mutateAsync({ id, ...updateData })
      })
    )

    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      throw new Error(`${failures.length} updates failed`)
    }
  }, [updateSet])

  const getMatrixSets = (urgency: string, importance: string) => {
    return filteredSets?.filter(
      (set) =>
        set.urgency === urgency &&
        set.importance === importance &&
        set.status !== 'completed' &&
        set.status !== 'cancelled'
    )
  }

  const renderSetCard = (set: SetWithRelations) => (
    <div
      key={set.id}
      className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => openDetailPanel('set', set.id)}
      onDoubleClick={() => navigateToSet(set.id)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm truncate">{set.name}</span>
        <Badge className={getStatusColor(computeDisplayStatus(set))} variant="outline">
          {getStatusLabel(computeDisplayStatus(set))}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground truncate mb-2">
        {set.projects?.name}
      </p>
      <div className="flex items-center gap-2">
        <Progress value={set.completion_percentage} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground">{set.completion_percentage}%</span>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Sets</h1>
          <p className="text-muted-foreground">Organize work with the Eisenhower Matrix</p>
        </div>
        <Button onClick={() => openCreateModal('set')}>
          <Plus className="mr-2 h-4 w-4" />
          New Set
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : viewMode === 'matrix' ? (
        <>
          {/* Toolbar Row for Matrix View */}
          <div className="flex items-center gap-2 mb-3">
            {/* Result count - only when filters active */}
            {hasActiveFilters && (
              <span className="text-xs text-muted-foreground">
                {filteredSets.length} of {sets?.length ?? 0}
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
              <div className="flex items-center border rounded-md">
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-r-none h-9 w-9"
                  onClick={() => setViewMode('matrix')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-l-none h-9 w-9"
                  onClick={() => setViewMode('list')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
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
            resultCount={filteredSets.length}
            totalCount={sets?.length ?? 0}
            collapsed={!filtersOpen}
          />

          {/* Eisenhower Matrix View */}
          <div className="grid grid-cols-2 gap-4">
            {/* Do First - High Urgency, High Importance */}
            <Card className="border-2 border-red-300 bg-red-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  Do First (Critical)
                </CardTitle>
                <p className="text-xs text-red-600">High Urgency, High Importance</p>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                {getMatrixSets('high', 'high')?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No critical sets</p>
                ) : (
                  getMatrixSets('high', 'high')?.map(renderSetCard)
                )}
              </CardContent>
            </Card>

            {/* Schedule - Low Urgency, High Importance */}
            <Card className="border-2 border-blue-300 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  Schedule (Plan)
                </CardTitle>
                <p className="text-xs text-blue-600">Low Urgency, High Importance</p>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                {getMatrixSets('low', 'high')?.length === 0 &&
                getMatrixSets('medium', 'high')?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No sets to schedule</p>
                ) : (
                  <>
                    {getMatrixSets('low', 'high')?.map(renderSetCard)}
                    {getMatrixSets('medium', 'high')?.map(renderSetCard)}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Delegate - High Urgency, Low Importance */}
            <Card className="border-2 border-amber-300 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  Delegate (Quick)
                </CardTitle>
                <p className="text-xs text-amber-600">High Urgency, Low Importance</p>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                {getMatrixSets('high', 'low')?.length === 0 &&
                getMatrixSets('high', 'medium')?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No sets to delegate</p>
                ) : (
                  <>
                    {getMatrixSets('high', 'low')?.map(renderSetCard)}
                    {getMatrixSets('high', 'medium')?.map(renderSetCard)}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Eliminate - Low Urgency, Low Importance */}
            <Card className="border-2 border-gray-300 bg-gray-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-800 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  Consider (Drop)
                </CardTitle>
                <p className="text-xs text-gray-600">Low Urgency, Low Importance</p>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                {getMatrixSets('low', 'low')?.length === 0 &&
                getMatrixSets('medium', 'low')?.length === 0 &&
                getMatrixSets('low', 'medium')?.length === 0 &&
                getMatrixSets('medium', 'medium')?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No low priority sets</p>
                ) : (
                  <>
                    {getMatrixSets('medium', 'medium')?.map(renderSetCard)}
                    {getMatrixSets('low', 'medium')?.map(renderSetCard)}
                    {getMatrixSets('medium', 'low')?.map(renderSetCard)}
                    {getMatrixSets('low', 'low')?.map(renderSetCard)}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        /* List View - GridEditTable */
        <Card className="card-carbon">
          <CardContent className="p-4">
            {/* Toolbar Row */}
            <div className="flex items-center gap-2 mb-3">
              {/* Result count - only when filters active */}
              {hasActiveFilters && (
                <span className="text-xs text-muted-foreground">
                  {filteredSets.length} of {sets?.length ?? 0}
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
                <div className="flex items-center border rounded-md">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-r-none h-9 w-9"
                    onClick={() => setViewMode('matrix')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-l-none h-9 w-9"
                    onClick={() => setViewMode('list')}
                  >
                    <Grid className="h-4 w-4" />
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
              resultCount={filteredSets.length}
              totalCount={sets?.length ?? 0}
              collapsed={!filtersOpen}
            />

            <GridEditTable
              columns={columns}
              data={filteredSets}
              isLoading={isLoading}
              onSave={handleGridSave}
              onRowClick={(row) => openDetailPanel('set', row.id)}
              onRowDoubleClick={(row, context) => navigateToSet(row.id, false, context)}
              emptyMessage="No sets found"
              emptyIcon={<Layers className="h-12 w-12 text-muted-foreground" />}
              emptyAction={
                <Button onClick={() => openCreateModal('set')}>
                  Create your first set
                </Button>
              }
              enableSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              storageKey="sets_overview"
            />
          </CardContent>
        </Card>
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="sets"
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedRows={selectedRows}
        entityName="set"
        entityPath="sets"
        onClearSelection={() => setRowSelection({})}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </div>
  )
}
