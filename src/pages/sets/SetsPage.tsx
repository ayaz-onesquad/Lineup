import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSets, useSetMutations } from '@/hooks/useSets'
import { useTenantUsers } from '@/hooks/useTenant'
import { useUIStore, useTenantStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Plus, Search, Layers, Grid, LayoutGrid, Upload } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { GridEditTable, type GridColumn } from '@/components/shared/GridEditTable'
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
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('list')
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const { data: sets, isLoading } = useSets()
  const { updateSet } = useSetMutations()
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

  const filteredSets = useMemo(() => sets?.filter(
    (set) =>
      set.name.toLowerCase().includes(search.toLowerCase()) ||
      set.projects?.name.toLowerCase().includes(search.toLowerCase())
  ) || [], [sets, search])

  // Grid columns definition
  const columns: GridColumn<SetWithRelations>[] = useMemo(() => [
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
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.display_id && (
            <Badge variant="outline" className="font-mono text-xs">
              #{row.display_id}
            </Badge>
          )}
        </div>
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
      onDoubleClick={() => navigate(`/sets/${set.id}`)}
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
          {/* Search and View Toggle for Matrix */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search sets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'matrix' ? 'secondary' : 'ghost'}
                size="icon"
                className="rounded-r-none"
                onClick={() => setViewMode('matrix')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="rounded-l-none"
                onClick={() => setViewMode('list')}
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>

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
            <GridEditTable
              columns={columns}
              data={filteredSets}
              isLoading={isLoading}
              onSave={handleGridSave}
              onRowClick={(row) => openDetailPanel('set', row.id)}
              onRowDoubleClick={(row) => navigate(`/sets/${row.id}`)}
              emptyMessage="No sets found"
              emptyIcon={<Layers className="h-12 w-12 text-muted-foreground" />}
              emptyAction={
                <Button onClick={() => openCreateModal('set')}>
                  Create your first set
                </Button>
              }
              toolbarActions={
                <Button
                  variant="outline"
                  onClick={() => setShowBulkUpload(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
              }
            >
              {/* Search and View Toggle */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === 'matrix' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="rounded-r-none"
                  onClick={() => setViewMode('matrix')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="rounded-l-none"
                  onClick={() => setViewMode('list')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
            </GridEditTable>
          </CardContent>
        </Card>
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="sets"
      />
    </div>
  )
}
