import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useProjectMutations, useClients, useDataGridFilters, type FilterConfig } from '@/hooks'
import { useUIStore } from '@/stores'
import { MobileActionBar, BulkActionBar, storeListContext, type RowClickContext } from '@/components/shared'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { GridToolbar, GridSearch, GridFilterSelect } from '@/components/shared/GridToolbar'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, FolderKanban, Grid, List, MoreVertical, Edit, Building2, User, Upload, Trash2, Eye } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { getHealthColor, formatDate } from '@/lib/utils'
import { computeDisplayStatus, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { toast } from '@/hooks/use-toast'
import type { ProjectWithRelations } from '@/types/database'

const STATUS_VALUES = ['active', 'on_deck', 'past_due', 'completed', 'future'] as const

const STATUS_OPTIONS = STATUS_VALUES.map(value => ({
  value,
  label: getStatusLabel(value),
}))

export function ProjectsPage() {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: projects, isLoading, error, refetch } = useProjects()
  const { data: clients } = useClients()
  const { deleteProject } = useProjectMutations()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const selectedProject = projects?.find((p) => p.id === selectedRowId) ?? null

  // Filter configuration
  const filterConfig: FilterConfig = useMemo(() => ({
    search: true,
    status: [...STATUS_VALUES],
    parentFilters: [
      {
        key: 'client_id',
        label: 'Client',
        options: clients?.map((c) => ({ value: c.id, label: c.name })) ?? [],
      },
    ],
    dateRangeField: 'expected_end_date',
  }), [clients])

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

  const clientOptions = useMemo(
    () => clients?.map((c) => ({ value: c.id, label: c.name })) ?? [],
    [clients]
  )

  // Apply filters to projects data
  const filteredProjects = useMemo(() => {
    if (!projects) return []
    return applyFilters(
      projects,
      ['name', 'project_code', 'display_id'],
      (row) => computeDisplayStatus(row)
    )
  }, [projects, applyFilters])

  // Navigate to project detail and store list context for Save & Next
  // When called from GridEditTable, context provides the sorted IDs
  const navigateToProject = useCallback((id: string, editMode = false, context?: RowClickContext) => {
    // Use sorted IDs from context if provided, otherwise fall back to filteredProjects order
    const ids = context?.sortedIds ?? filteredProjects.map((p) => p.id)
    storeListContext(ids, context?.source ?? 'projects_overview')
    navigate(`/projects/${id}${editMode ? '?edit=true' : ''}`)
  }, [filteredProjects, navigate])

  // Get selected rows for bulk actions
  const selectedRows = useMemo(
    () => filteredProjects.filter((project) => selectedIds.has(project.id)),
    [filteredProjects, selectedIds]
  )

  // Handle bulk delete
  const handleBulkDelete = useCallback(async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteProject.mutateAsync(id))
    )
    const failures = results.filter((r) => r.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    if (failures.length > 0) {
      toast({
        title: 'Some deletions failed',
        description: `${ids.length - failures.length} of ${ids.length} projects deleted.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Projects deleted',
        description: `${ids.length} project${ids.length !== 1 ? 's' : ''} deleted successfully.`,
      })
    }
  }, [deleteProject, queryClient])

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the project name is the
  // row identity, and the four facts needed to triage a project (client,
  // status, health, lead) are secondary. The display ID is desktop-only noise.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<ProjectWithRelations>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '90px',
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
        id: 'name',
        header: 'Project Name',
        priority: 'primary',
        hideable: false,
        minWidth: '220px',
        accessor: row => row.name,
        cell: row => (
          <div className="min-w-0 font-medium">
            <TruncatedCell value={row.name} maxLines={1} />
          </div>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        priority: 'secondary',
        width: '180px',
        accessor: row => row.clients?.name ?? '',
        cell: row =>
          row.clients?.id ? (
            <Link
              to={`/clients/${row.clients.id}`}
              className="flex min-w-0 items-center gap-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              <TruncatedCell value={row.clients.name} maxLines={1} />
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '140px',
        accessor: row => getStatusLabel(computeDisplayStatus(row)),
        cell: row => (
          <Badge variant="outline" className={getStatusColor(computeDisplayStatus(row))}>
            {getStatusLabel(computeDisplayStatus(row))}
          </Badge>
        ),
      },
      {
        id: 'health',
        header: 'Health',
        priority: 'secondary',
        width: '130px',
        accessor: row => row.health,
        cell: row => (
          <Badge variant="outline" className={getHealthColor(row.health)}>
            {row.health.replace('_', ' ')}
          </Badge>
        ),
      },
      {
        id: 'lead',
        header: 'Lead',
        priority: 'secondary',
        width: '180px',
        accessor: row => row.lead?.full_name ?? '',
        cell: row =>
          row.lead ? (
            <div className="flex min-w-0 items-center gap-2">
              {row.lead.avatar_url ? (
                <img
                  src={row.lead.avatar_url}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full"
                />
              ) : (
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <TruncatedCell value={row.lead.full_name} maxLines={1} />
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'completion_percentage',
        header: 'Progress',
        width: '150px',
        numeric: true,
        accessor: row => row.completion_percentage ?? 0,
        cell: row => (
          <div className="flex items-center gap-2">
            <Progress value={row.completion_percentage} className="h-2 flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground">
              {row.completion_percentage ?? 0}%
            </span>
          </div>
        ),
      },
      {
        id: 'expected_end_date',
        header: 'Due',
        width: '130px',
        accessor: row => row.expected_end_date,
        cell: row =>
          row.expected_end_date ? (
            formatDate(row.expected_end_date)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'project_code',
        header: 'Code',
        hideOnMobile: true,
        width: '140px',
        accessor: row => row.project_code ?? '',
        cell: row =>
          row.project_code ? (
            <span className="font-mono text-xs">{row.project_code}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    []
  )

  const toolbar = (
    <GridToolbar
      activeFilterCount={activeFilterCount}
      onClearFilters={clearAll}
      search={
        <GridSearch
          value={filters.search}
          onChange={setSearch}
          placeholder="Search by name, code or ID..."
        />
      }
    >
      <GridFilterSelect
        label="Status"
        options={STATUS_OPTIONS}
        value={filters.statuses[0] ?? ''}
        onChange={(value) => setStatuses(value ? [value] : [])}
      />
      <GridFilterSelect
        label="Client"
        options={clientOptions}
        value={filters.parents.client_id?.[0] ?? ''}
        onChange={(value) => setParent('client_id', value ? [value] : [])}
      />
      <div className="w-full md:w-auto">
        <Label htmlFor="projects-due-from" className="mb-1.5 block text-sm font-medium md:hidden">
          Due from
        </Label>
        <Input
          id="projects-due-from"
          type="date"
          aria-label="Due from"
          value={filters.dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="md:w-[150px]"
        />
      </div>
      <div className="w-full md:w-auto">
        <Label htmlFor="projects-due-to" className="mb-1.5 block text-sm font-medium md:hidden">
          Due to
        </Label>
        <Input
          id="projects-due-to"
          type="date"
          aria-label="Due to"
          value={filters.dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="md:w-[150px]"
        />
      </div>
    </GridToolbar>
  )

  return (
    <PageShell
      title="Projects"
      description="Manage all your projects"
      icon={FolderKanban}
      actions={
        <>
          {/* View toggle: the card view is redundant below `md`, where the grid
              already renders cards, but the preference is preserved. */}
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              aria-label="Card view"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowBulkUpload(true)}
            className="w-full gap-2 sm:w-auto"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => openCreateModal('project')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </>
      }
    >
      {viewMode === 'grid' ? (
        <div className="space-y-3">
          {toolbar}
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              {filteredProjects.length} of {projects?.length ?? 0}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="h-full cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => openDetailPanel('project', project.id)}
                onDoubleClick={() => navigateToProject(project.id)}
              >
                <CardHeader className="pb-2">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge className={getStatusColor(computeDisplayStatus(project))}>
                      {getStatusLabel(computeDisplayStatus(project))}
                    </Badge>
                    <Badge variant="outline" className={getHealthColor(project.health)}>
                      {project.health.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardTitle className="line-clamp-1 text-lg">{project.name}</CardTitle>
                  <CardDescription className="line-clamp-1">
                    {project.project_code} • {project.clients?.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Progress value={project.completion_percentage} className="h-2 flex-1" />
                      <span className="text-sm text-muted-foreground">
                        {project.completion_percentage}%
                      </span>
                    </div>
                    {project.lead && (
                      <div className="text-sm text-muted-foreground">
                        Lead: {project.lead.full_name}
                      </div>
                    )}
                    {project.expected_end_date && (
                      <div className="text-sm text-muted-foreground">
                        Due: {formatDate(project.expected_end_date)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <DataGrid
          columns={columns}
          data={filteredProjects}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          error={error as Error | null}
          onRetry={refetch}
          storageKey="projects"
          defaultSort={{ columnId: 'name', direction: 'asc' }}
          ariaLabel="Projects"
          stickyFirstColumn
          // Single click opens the quick-view panel on desktop; on a phone it
          // arms the MobileActionBar. Double click or Enter opens the record.
          onRowClick={(row) => {
            if (window.innerWidth < 768) {
              setSelectedRowId(selectedRowId === row.id ? null : row.id)
            } else {
              openDetailPanel('project', row.id)
            }
          }}
          onRowOpen={(row) => navigateToProject(row.id)}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAll}
          emptyState={{
            icon: FolderKanban,
            title: 'No projects found',
            description: 'Create a project to start organising phases, sets and requirements.',
            action: (
              <Button onClick={() => openCreateModal('project')}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first project
              </Button>
            ),
          }}
          toolbar={toolbar}
          rowActions={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50">
                <DropdownMenuItem onClick={() => navigateToProject(row.id)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigateToProject(row.id, true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => deleteProject.mutate(row.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      )}

      {/* Mobile Action Bar */}
      {selectedProject && (
        <MobileActionBar
          selectedName={selectedProject.name}
          onDeselect={() => setSelectedRowId(null)}
          onOpen={() => {
            navigateToProject(selectedProject.id)
            setSelectedRowId(null)
          }}
          onEdit={() => {
            navigateToProject(selectedProject.id, true)
            setSelectedRowId(null)
          }}
        />
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="projects"
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedRows={selectedRows}
        entityName="project"
        entityPath="projects"
        onClearSelection={() => setSelectedIds(new Set())}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </PageShell>
  )
}
