import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { usePhases, usePhaseMutations } from '@/hooks'
import { useTenantUsers, useTenant } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Search, Calendar, Building2, Upload } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { GridEditTable, type GridColumn } from '@/components/shared/GridEditTable'
import { BulkActionBar, storeListContext } from '@/components/shared'
import { toast } from '@/hooks/use-toast'
import { computeDisplayStatus, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { formatDate } from '@/lib/utils'
import type { EnhancedProjectPhase, UpdatePhaseInput } from '@/types/database'

export function PhasesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const { data: phases, isLoading } = usePhases()
  const { updatePhase, deletePhase } = usePhaseMutations()
  const { currentTenant } = useTenant()
  const { data: tenantUsers } = useTenantUsers(currentTenant?.id)

  // Build user options for lead dropdown
  const userOptions: SearchableSelectOption[] = useMemo(() => {
    if (!tenantUsers) return []
    return tenantUsers.map((user) => ({
      value: user.user_profiles?.id || user.id,
      label: user.user_profiles?.full_name || 'Unknown User',
    }))
  }, [tenantUsers])

  const filteredPhases = useMemo(() => phases?.filter(
    (phase) =>
      phase.name.toLowerCase().includes(search.toLowerCase()) ||
      phase.projects?.name.toLowerCase().includes(search.toLowerCase())
  ) || [], [phases, search])

  // Navigate to phase detail and store list context for Save & Next
  const navigateToPhase = useCallback((id: string, editMode = false) => {
    const ids = filteredPhases.map((p) => p.id)
    storeListContext(ids, 'phases')
    navigate(`/phases/${id}${editMode ? '?edit=true' : ''}`)
  }, [filteredPhases, navigate])

  // Get selected rows for bulk actions
  const selectedRows = useMemo(() => {
    return filteredPhases.filter((phase) => rowSelection[phase.id])
  }, [filteredPhases, rowSelection])

  // Handle bulk delete
  const handleBulkDelete = useCallback(async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deletePhase.mutateAsync({ id }))
    )
    const failures = results.filter((r) => r.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['phases'] })
    if (failures.length > 0) {
      toast({
        title: 'Some deletions failed',
        description: `${ids.length - failures.length} of ${ids.length} phases deleted.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Phases deleted',
        description: `${ids.length} phase${ids.length !== 1 ? 's' : ''} deleted successfully.`,
      })
    }
  }, [deletePhase, queryClient])

  // Grid columns definition
  const columns: GridColumn<EnhancedProjectPhase>[] = useMemo(() => [
    {
      key: 'phase_id_display',
      header: 'Phase ID',
      editable: false, // Display ID is read-only
      render: (row) => (
        <span className="font-mono text-sm">
          {row.phase_id_display || `PH-${row.display_id}`}
        </span>
      ),
    },
    {
      key: 'projects.clients.name',
      header: 'Client',
      editable: false, // Nested relation
      render: (row) => row.projects?.clients?.id ? (
        <Link
          to={`/clients/${row.projects.clients.id}`}
          className="flex items-center gap-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <Building2 className="h-3 w-3 text-muted-foreground" />
          {row.projects.clients.name || '—'}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
    {
      key: 'projects.name',
      header: 'Project',
      editable: false, // Nested relation
      render: (row) => row.projects ? (
        <Link
          to={`/projects/${row.project_id}`}
          className="hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.projects.name}
        </Link>
      ) : '-',
    },
    {
      key: 'name',
      header: 'Phase Name',
      editable: true,
      type: 'text',
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      editable: false, // Computed from dates
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
      render: (row) => row.lead?.full_name || '-',
    },
    {
      key: 'expected_start_date',
      header: 'Start Date',
      editable: true,
      type: 'date',
      render: (row) => row.expected_start_date ? (
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          {formatDate(row.expected_start_date)}
        </div>
      ) : '—',
    },
    {
      key: 'expected_end_date',
      header: 'End Date',
      editable: true,
      type: 'date',
      render: (row) => row.expected_end_date ? (
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          {formatDate(row.expected_end_date)}
        </div>
      ) : '—',
    },
    {
      key: 'completion_percentage',
      header: 'Progress',
      editable: false, // Calculated field
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${row.completion_percentage}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {row.completion_percentage}%
          </span>
        </div>
      ),
    },
  ], [userOptions])

  // Handle grid save
  const handleGridSave = useCallback(async (dirtyRows: Map<string, Partial<EnhancedProjectPhase>>) => {
    const updates = Array.from(dirtyRows.entries())
    const results = await Promise.allSettled(
      updates.map(([id, changes]) => {
        const updateData: UpdatePhaseInput = {}
        if ('name' in changes) updateData.name = changes.name as string
        if ('description' in changes) updateData.description = changes.description as string
        if ('lead_id' in changes) updateData.lead_id = changes.lead_id as string | undefined
        if ('expected_start_date' in changes) updateData.expected_start_date = changes.expected_start_date as string | undefined
        if ('expected_end_date' in changes) updateData.expected_end_date = changes.expected_end_date as string | undefined
        return updatePhase.mutateAsync({ id, data: updateData })
      })
    )

    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      throw new Error(`${failures.length} updates failed`)
    }
  }, [updatePhase])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Phases</h1>
          <p className="text-muted-foreground">
            Manage project phases across all projects
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Card className="card-carbon">
          <CardContent className="p-4">
            <GridEditTable
              columns={columns}
              data={filteredPhases}
              isLoading={isLoading}
              onSave={handleGridSave}
              onRowClick={(row) => navigateToPhase(row.id)}
              onRowDoubleClick={(row) => navigateToPhase(row.id)}
              emptyMessage="No phases found"
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
              enableSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            >
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search phases..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </GridEditTable>
          </CardContent>
        </Card>
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="phases"
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedRows={selectedRows}
        entityName="phase"
        entityPath="phases"
        onClearSelection={() => setRowSelection({})}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </div>
  )
}
