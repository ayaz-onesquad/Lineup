import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePitches, usePitchMutations } from '@/hooks/usePitches'
import { useTenantUsers } from '@/hooks/useTenant'
import { useUIStore, useTenantStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import {
  Plus,
  Search,
  Presentation,
  Filter,
  CheckCircle,
  PlayCircle,
  Upload,
} from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { GridEditTable, type GridColumn } from '@/components/shared/GridEditTable'
import { getPriorityLabel, getPriorityColor } from '@/lib/utils'
import { computeDisplayStatus, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import type { PitchWithRelations, UpdatePitchInput, PriorityScore } from '@/types/database'

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

// Computed status options (status is now READ-ONLY calculated from dates)
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'on_deck', label: 'On Deck' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'completed', label: 'Completed' },
  { value: 'future', label: 'Future' },
]

export function PitchesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const navigate = useNavigate()
  const { data: pitches, isLoading } = usePitches()
  const { updatePitch } = usePitchMutations()
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

  // Filter pitches
  const filteredPitches = useMemo(() => {
    if (!pitches) return []
    return pitches.filter((pitch) => {
      // Search filter
      const matchesSearch =
        pitch.name.toLowerCase().includes(search.toLowerCase()) ||
        pitch.sets?.name?.toLowerCase().includes(search.toLowerCase()) ||
        pitch.sets?.projects?.name?.toLowerCase().includes(search.toLowerCase()) ||
        pitch.sets?.clients?.name?.toLowerCase().includes(search.toLowerCase())

      // Status filter - use computed status
      const computedStatus = computeDisplayStatus(pitch)
      const matchesStatus = !statusFilter || computedStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [pitches, search, statusFilter])

  // Stats using computed status
  const stats = useMemo(() => {
    if (!pitches) return { total: 0, completed: 0, active: 0, pastDue: 0 }
    return {
      total: pitches.length,
      completed: pitches.filter((p) => computeDisplayStatus(p) === 'completed').length,
      active: pitches.filter((p) => computeDisplayStatus(p) === 'active').length,
      pastDue: pitches.filter((p) => computeDisplayStatus(p) === 'past_due').length,
    }
  }, [pitches])

  // Grid columns definition
  const columns: GridColumn<PitchWithRelations>[] = useMemo(() => [
    {
      key: 'clients.name',
      header: 'Client',
      editable: false, // Nested relation
      render: (row) => {
        const set = row.sets
        const project = set?.projects
        const client = project?.clients || set?.clients
        return client?.name || '—'
      },
    },
    {
      key: 'sets.projects.name',
      header: 'Project',
      editable: false, // Nested relation
      render: (row) => row.sets?.projects?.name || '—',
    },
    {
      key: 'sets.name',
      header: 'Set',
      editable: false, // Nested relation
      render: (row) => row.sets?.name || '—',
    },
    {
      key: 'name',
      header: 'Pitch Name',
      editable: true,
      type: 'text',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.pitch_id_display && (
            <Badge variant="outline" className="font-mono text-xs">
              {row.pitch_id_display}
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
      render: (row) => row.lead ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={row.lead.avatar_url} />
            <AvatarFallback className="text-xs">
              {row.lead.full_name
                ?.split(' ')
                .map((n) => n[0])
                .join('')}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">{row.lead.full_name}</span>
        </div>
      ) : '—',
    },
    {
      key: 'completion_percentage',
      header: 'Progress',
      editable: false, // Calculated field
      render: (row) => (
        <div className="flex items-center gap-2 min-w-[100px]">
          <Progress value={row.completion_percentage} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground w-8">
            {row.completion_percentage}%
          </span>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      editable: false, // Calculated field
      render: (row) => row.priority ? (
        <Badge className={getPriorityColor(row.priority as PriorityScore)}>
          {row.priority} - {getPriorityLabel(row.priority as PriorityScore)}
        </Badge>
      ) : '—',
    },
  ], [userOptions])

  // Handle grid save
  const handleGridSave = useCallback(async (dirtyRows: Map<string, Partial<PitchWithRelations>>) => {
    const updates = Array.from(dirtyRows.entries())
    const results = await Promise.allSettled(
      updates.map(([id, changes]) => {
        const updateData: UpdatePitchInput = {}
        if ('name' in changes) updateData.name = changes.name as string
        if ('description' in changes) updateData.description = changes.description as string
        if ('urgency' in changes) updateData.urgency = changes.urgency as 'low' | 'medium' | 'high'
        if ('importance' in changes) updateData.importance = changes.importance as 'low' | 'medium' | 'high'
        if ('lead_id' in changes) updateData.lead_id = changes.lead_id as string | undefined
        return updatePitch.mutateAsync({ id, ...updateData })
      })
    )

    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      throw new Error(`${failures.length} updates failed`)
    }
  }, [updatePitch])

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Presentation className="h-8 w-8" />
            Pitches
          </h1>
          <p className="text-muted-foreground">
            Manage requirement groupings within sets
          </p>
        </div>
        <Button onClick={() => openCreateModal('pitch')}>
          <Plus className="mr-2 h-4 w-4" />
          New Pitch
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Presentation className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Pitches</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Presentation className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Past Due</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{stats.pastDue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Grid */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredPitches.length === 0 && !search && !statusFilter ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Presentation className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pitches found</p>
            <Button className="mt-4" onClick={() => openCreateModal('pitch')}>
              Create First Pitch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-carbon">
          <CardContent className="p-4">
            <GridEditTable
              columns={columns}
              data={filteredPitches}
              isLoading={isLoading}
              onSave={handleGridSave}
              onRowClick={(row) => openDetailPanel('pitch', row.id)}
              onRowDoubleClick={(row) => navigate(`/pitches/${row.id}`)}
              emptyMessage="No pitches found"
              emptyIcon={<Presentation className="h-12 w-12 text-muted-foreground" />}
              emptyAction={
                search || statusFilter ? (
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearch('')
                      setStatusFilter('')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => openCreateModal('pitch')}>
                    Create First Pitch
                  </Button>
                )
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
              {/* Search and Filters */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, set, project, or client..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SearchableSelect
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v || '')}
                  placeholder="Status"
                  className="w-40"
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
        defaultEntity="pitches"
      />
    </div>
  )
}
