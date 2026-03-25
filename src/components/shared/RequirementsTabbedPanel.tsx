import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { computeRequirementStatus, computeKeyDueDate, computeRequirementKeyStartDate, STATUS_LABELS, STATUS_COLORS } from '@/utils/statusUtils'
import { formatDate, calculateEisenhowerPriority as calcPriority, getPriorityColor as getPrioColor } from '@/lib/utils'
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
  showSetColumn: _showSetColumn = true,
  showProjectColumn: _showProjectColumn = true,
  emptyMessage = 'No requirements yet',
}: RequirementsTabbedPanelProps) {
  // Note: showSetColumn and showProjectColumn are kept for backward compatibility
  // but columns are now standardized across all child tables
  void _showSetColumn
  void _showProjectColumn
  const navigate = useNavigate()
  const { openDetailPanel, openCreateModal } = useUIStore()
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open')

  // Split requirements into open and completed based on completed_date (actual_end_date)
  // Per status engine: 'Open' = completed_date IS NULL, 'Completed' = completed_date IS NOT NULL
  const { openRequirements, completedRequirements } = useMemo(() => {
    if (!requirements) return { openRequirements: [], completedRequirements: [] }

    // Filter by completed_date (requirements use completed_date as their actual_end_date)
    const open = requirements.filter((r) => !r.completed_date)
    const completed = requirements.filter((r) => !!r.completed_date)

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
                <TableHead className="w-[60px]">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Key Start</TableHead>
                <TableHead>Key End</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reqs.map((req) => {
                const status = computeRequirementStatus(req)
                const priority = calcPriority(req.importance, req.urgency)
                const keyStart = computeRequirementKeyStartDate(req)
                const keyEnd = computeKeyDueDate(req)

                return (
                  <TableRow
                    key={req.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => navigate(`/requirements/${req.id}`)}
                  >
                    <TableCell className="text-right tabular-nums">
                      {req.requirement_order ?? '—'}
                    </TableCell>
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
                    <TableCell>
                      {priority ? (
                        <Badge className={getPrioColor(priority)}>P{priority}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {req.assigned_to?.full_name || '—'}
                    </TableCell>
                    <TableCell>
                      {keyStart ? formatDate(keyStart.toISOString()) : '—'}
                    </TableCell>
                    <TableCell>
                      {keyEnd ? formatDate(keyEnd.toISOString()) : '—'}
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
                <TableHead className="w-[60px]">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Key Start</TableHead>
                <TableHead>Key End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
