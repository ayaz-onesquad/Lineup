import { useState, useMemo } from 'react'
import { useProjectTemplates, useProjectMutations } from '@/hooks/useProjects'
import { useClients } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Search,
  MoreVertical,
  Copy,
  Trash2,
  FolderKanban,
  Loader2,
  LayoutTemplate,
  FileText,
  Layers,
  CheckSquare,
  Calendar,
  ArrowRight,
  Users,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import type { ProjectWithRelations } from '@/types/database'

export function TemplatesPage() {
  const [search, setSearch] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectWithRelations | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')

  const navigate = useNavigate()
  const { data: templates, isLoading } = useProjectTemplates()
  const { data: clients } = useClients()
  const { createFromTemplate, deleteProject } = useProjectMutations()

  // Client options for dropdown
  const clientOptions = useMemo(
    () => clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  // Filter templates
  const filteredTemplates = useMemo(() => {
    if (!templates) return []
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
    )
  }, [templates, search])

  const openCreateFromTemplate = (template: ProjectWithRelations) => {
    setSelectedTemplate(template)
    setNewProjectName(`${template.name} - Copy`)
    setSelectedClientId('')
    setCreateDialogOpen(true)
  }

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplate || !selectedClientId || !newProjectName) return

    const result = await createFromTemplate.mutateAsync({
      templateId: selectedTemplate.id,
      clientId: selectedClientId,
      projectName: newProjectName,
      options: {
        include_children: true,
        clear_dates: true,
        clear_assignments: true,
      },
    })

    setCreateDialogOpen(false)
    setSelectedTemplate(null)
    // Navigate to the new project
    if (result?.new_project_id) {
      navigate(`/projects/${result.new_project_id}`)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    await deleteProject.mutateAsync(templateId)
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Templates</h1>
        <p className="text-muted-foreground">
          Create and manage reusable project templates
        </p>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <LayoutTemplate className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">How Templates Work</p>
              <p className="text-sm text-blue-700 mt-1">
                Templates are project structures that can be reused for new clients. When you create
                a project from a template, all phases, sets, pitches, and requirements are copied
                with dates and assignments cleared.
              </p>
              <p className="text-sm text-blue-700 mt-2">
                To save a project as a template, go to the project's detail page and use the "Save
                as Template" option in the actions menu.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center">
            <LayoutTemplate className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Create your first template by saving an existing project as a template. Templates help
              you standardize project structures across clients.
            </p>
            <Button className="mt-4" onClick={() => navigate('/projects')}>
              <FolderKanban className="mr-2 h-4 w-4" />
              View Projects
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUseTemplate={() => openCreateFromTemplate(template)}
              onDelete={() => handleDeleteTemplate(template.id)}
              onViewDetails={() => navigate(`/projects/${template.id}`)}
            />
          ))}
        </div>
      )}

      {/* Create from Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project from Template</DialogTitle>
            <DialogDescription>
              Create a new project using "{selectedTemplate?.name}" as a template. Dates and
              assignments will be cleared.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New project name..."
              />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <SearchableSelect
                options={clientOptions}
                value={selectedClientId}
                onValueChange={(v) => setSelectedClientId(v || '')}
                placeholder="Select client..."
                searchPlaceholder="Search clients..."
                emptyMessage="No clients found."
              />
            </div>
            <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
              <p className="font-medium">What will be copied:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckSquare className="h-3 w-3" />
                  Project structure and description
                </li>
                <li className="flex items-center gap-2">
                  <Layers className="h-3 w-3" />
                  All phases, sets, and pitches
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  All requirements and their details
                </li>
              </ul>
              <p className="font-medium mt-3">What will be cleared:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  All dates (start, end, due)
                </li>
                <li className="flex items-center gap-2">
                  <Users className="h-3 w-3" />
                  All team assignments
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFromTemplate}
              disabled={
                !selectedClientId || !newProjectName || createFromTemplate.isPending
              }
            >
              {createFromTemplate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Template Card Component
function TemplateCard({
  template,
  onUseTemplate,
  onDelete,
  onViewDetails,
}: {
  template: ProjectWithRelations
  onUseTemplate: () => void
  onDelete: () => void
  onViewDetails: () => void
}) {
  // Count children (would need API support for accurate counts)
  const phaseCount = template.phases?.length || 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <LayoutTemplate className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{template.name}</CardTitle>
              {template.project_code && (
                <p className="text-xs text-muted-foreground">{template.project_code}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onUseTemplate}>
                <Copy className="mr-2 h-4 w-4" />
                Use Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewDetails}>
                <FolderKanban className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        {template.description ? (
          <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {phaseCount > 0 && (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {phaseCount} phases
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Created {formatDate(template.created_at)}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <Button className="w-full" onClick={onUseTemplate}>
          <Copy className="mr-2 h-4 w-4" />
          Use This Template
        </Button>
      </CardFooter>
    </Card>
  )
}
