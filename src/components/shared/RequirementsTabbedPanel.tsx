import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Plus,
  CheckSquare,
  MoreVertical,
  ExternalLink,
  Edit,
  Layers,
  FolderKanban,
} from 'lucide-react'
import { getStatusColor, getComputedStatusColor, getComputedStatusLabel } from '@/lib/utils'
import { useUIStore } from '@/stores'
import type { RequirementWithRelations } from '@/types/database'

interface RequirementsTabbedPanelProps {
  requirements: RequirementWithRelations[] | undefined
  isLoading?: boolean
  // Context for creating new requirements
  createContext?: {
    client_id?: string
    set_id?: string
    pitch_id?: string
    project_id?: string
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
  showSetColumn = true,
  showProjectColumn = true,
  emptyMessage = 'No requirements yet',
}: RequirementsTabbedPanelProps) {
  const navigate = useNavigate()
  const { openDetailPanel, openCreateModal } = useUIStore()
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open')

  // Split requirements into open and completed
  const { openRequirements, completedRequirements } = useMemo(() => {
    if (!requirements) return { openRequirements: [], completedRequirements: [] }

    const open = requirements.filter(
      (r) => r.computed_status !== 'completed' && r.status !== 'completed'
    )
    const completed = requirements.filter(
      (r) => r.computed_status === 'completed' || r.status === 'completed'
    )

    return { openRequirements: open, completedRequirements: completed }
  }, [requirements])

  const handleCreate = () => {
    if (onCreateClick) {
      onCreateClick()
    } else if (createContext) {
      openCreateModal('requirement', createContext)
    }
  }

  // Determine if create button should be shown
  const showCreateButton = !!onCreateClick || !!createContext

  const renderTable = (reqs: RequirementWithRelations[], showEmpty = true) => {
    if (reqs.length === 0 && showEmpty) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {activeTab === 'open' ? emptyMessage : 'No completed requirements'}
            </p>
            {activeTab === 'open' && showCreateButton && (
              <Button className="mt-4" onClick={handleCreate}>
                Create First Requirement
              </Button>
            )}
          </CardContent>
        </Card>
      )
    }

    if (reqs.length === 0) return null

    return (
      <Card className="card-carbon">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                {showSetColumn && <TableHead>Set</TableHead>}
                {showProjectColumn && <TableHead>Project</TableHead>}
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reqs.map((req) => {
                const statusColor = req.computed_status
                  ? getComputedStatusColor(req.computed_status)
                  : getStatusColor(req.status)
                const statusLabel = req.computed_status
                  ? getComputedStatusLabel(req.computed_status)
                  : req.status

                return (
                  <TableRow
                    key={req.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => navigate(`/requirements/${req.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {req.title}
                        {req.display_id && (
                          <Badge variant="outline" className="font-mono text-xs">
                            #{req.display_id}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {showSetColumn && (
                      <TableCell>
                        {req.set_id ? (
                          <Link
                            to={`/sets/${req.set_id}`}
                            className="hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Layers className="h-3 w-3 text-muted-foreground" />
                            {req.sets?.name || '—'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    )}
                    {showProjectColumn && (
                      <TableCell>
                        {req.sets?.project_id ? (
                          <Link
                            to={`/projects/${req.sets?.project_id}`}
                            className="hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FolderKanban className="h-3 w-3 text-muted-foreground" />
                            {req.sets?.projects?.name || '—'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline">{req.requirement_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor}>{statusLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      {req.key_due_date || req.expected_due_date || '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetailPanel('requirement', req.id)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Quick View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/requirements/${req.id}?edit=true`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="card-carbon">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                {showSetColumn && <TableHead>Set</TableHead>}
                {showProjectColumn && <TableHead>Project</TableHead>}
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  {showSetColumn && <TableCell><Skeleton className="h-4 w-24" /></TableCell>}
                  {showProjectColumn && <TableCell><Skeleton className="h-4 w-28" /></TableCell>}
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

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
          {renderTable(openRequirements)}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {renderTable(completedRequirements)}
        </TabsContent>
      </Tabs>
    </div>
  )
}
