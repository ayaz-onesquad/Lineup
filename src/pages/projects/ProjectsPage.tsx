import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useProjectMutations } from '@/hooks/useProjects'
import { useUIStore } from '@/stores'
import { MobileActionBar, BulkActionBar, storeListContext } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, FolderKanban, Grid, List, MoreVertical, Edit, Building2, User, Upload, Trash2, Eye } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { getHealthColor, formatDate, cn } from '@/lib/utils'
import { computeDisplayStatus, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { toast } from '@/hooks/use-toast'

export function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: projects, isLoading } = useProjects()
  const { deleteProject } = useProjectMutations()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const selectedProject = projects?.find((p) => p.id === selectedRowId) ?? null

  const filteredProjects = useMemo(() => projects?.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.project_code.toLowerCase().includes(search.toLowerCase()) ||
      project.clients?.name.toLowerCase().includes(search.toLowerCase())
    // Status filter - use computed status
    const computedStatus = computeDisplayStatus(project)
    const matchesStatus = statusFilter === 'all' || computedStatus === statusFilter
    return matchesSearch && matchesStatus
  }) || [], [projects, search, statusFilter])

  // Navigate to project detail and store list context for Save & Next
  const navigateToProject = useCallback((id: string, editMode = false) => {
    const ids = filteredProjects.map((p) => p.id)
    storeListContext(ids, 'projects')
    navigate(`/projects/${id}${editMode ? '?edit=true' : ''}`)
  }, [filteredProjects, navigate])

  // Get selected rows for bulk actions
  const selectedRows = useMemo(() => {
    return filteredProjects.filter((project) => rowSelection[project.id])
  }, [filteredProjects, rowSelection])

  // Selection helpers
  const isAllSelected = filteredProjects.length > 0 && selectedRows.length === filteredProjects.length
  const isSomeSelected = selectedRows.length > 0 && selectedRows.length < filteredProjects.length

  const handleSelectAll = useCallback((checked: boolean) => {
    const newSelection: Record<string, boolean> = {}
    if (checked) {
      filteredProjects.forEach((project) => {
        newSelection[project.id] = true
      })
    }
    setRowSelection(newSelection)
  }, [filteredProjects])

  const handleSelectRow = useCallback((rowId: string, checked: boolean) => {
    const newSelection = { ...rowSelection }
    if (checked) {
      newSelection[rowId] = true
    } else {
      delete newSelection[rowId]
    }
    setRowSelection(newSelection)
  }, [rowSelection])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage all your projects</p>
        </div>
        <Button onClick={() => openCreateModal('project')}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_deck">On Deck</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="future">Future</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-r-none"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-l-none"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowBulkUpload(true)}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </div>

      {/* Projects Grid/List */}
      {isLoading ? (
        <div className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'h-48' : 'h-24'} />
          ))}
        </div>
      ) : filteredProjects?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No projects found</p>
            <Button className="mt-4" onClick={() => openCreateModal('project')}>
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects?.map((project) => (
            <Card
              key={project.id}
              className="h-full hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openDetailPanel('project', project.id)}
              onDoubleClick={() => navigateToProject(project.id)}
            >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={getStatusColor(computeDisplayStatus(project))}>
                      {getStatusLabel(computeDisplayStatus(project))}
                    </Badge>
                    <Badge variant="outline" className={getHealthColor(project.health)}>
                      {project.health.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg line-clamp-1">{project.name}</CardTitle>
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
      ) : (
        // List View - Data Grid (Table) format with columns: Client, Project Name, Status, Health, Lead
        <Card className="card-carbon">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) {
                          (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = isSomeSelected
                        }
                      }}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      aria-label="Select all"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Lead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects?.map((project) => (
                  <TableRow
                    key={project.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 min-h-[44px]',
                      selectedRowId === project.id && 'bg-muted',
                      rowSelection[project.id] && 'bg-muted/50'
                    )}
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setSelectedRowId(selectedRowId === project.id ? null : project.id)
                      } else {
                        openDetailPanel('project', project.id)
                      }
                    }}
                    onDoubleClick={() => navigateToProject(project.id)}
                  >
                    {/* Checkbox column */}
                    <TableCell>
                      <Checkbox
                        checked={!!rowSelection[project.id]}
                        onCheckedChange={(checked) => handleSelectRow(project.id, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select row"
                      />
                    </TableCell>
                    {/* Actions column */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="z-50">
                          <DropdownMenuItem onClick={() => navigateToProject(project.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigateToProject(project.id, true)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteProject.mutate(project.id)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      {project.clients?.id ? (
                        <Link
                          to={`/clients/${project.clients.id}`}
                          className="flex items-center gap-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {project.clients?.name || '—'}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {project.name}
                        {project.display_id && (
                          <Badge variant="outline" className="font-mono text-xs">
                            #{project.display_id}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(computeDisplayStatus(project))} variant="outline">
                        {getStatusLabel(computeDisplayStatus(project))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getHealthColor(project.health)}>
                        {project.health.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {project.lead ? (
                        <div className="flex items-center gap-2">
                          {project.lead.avatar_url ? (
                            <img
                              src={project.lead.avatar_url}
                              alt={project.lead.full_name}
                              className="h-6 w-6 rounded-full"
                            />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">{project.lead.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
        onClearSelection={() => setRowSelection({})}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </div>
  )
}
