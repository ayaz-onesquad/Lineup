import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, FolderKanban, Grid, List, MoreVertical, ExternalLink, Edit, Building2, User } from 'lucide-react'
import { getStatusColor, getHealthColor, formatDate } from '@/lib/utils'

export function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjects()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const filteredProjects = projects?.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.project_code.toLowerCase().includes(search.toLowerCase()) ||
      project.clients?.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

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
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
              onDoubleClick={() => navigate(`/projects/${project.id}`)}
            >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
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
                  <TableHead>Client</TableHead>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects?.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetailPanel('project', project.id)}
                    onDoubleClick={() => navigate(`/projects/${project.id}`)}
                  >
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
                      <Badge className={getStatusColor(project.status)} variant="outline">
                        {project.status}
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}`)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Project
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}?edit=true`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
