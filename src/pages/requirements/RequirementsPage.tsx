import { useState } from 'react'
import { useRequirements, useRequirementMutations } from '@/hooks/useRequirements'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, CheckSquare, Kanban, List, GripVertical } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import type { RequirementWithRelations, RequirementStatus } from '@/types/database'

const statusColumns: { status: RequirementStatus; label: string; color: string }[] = [
  { status: 'open', label: 'Open', color: 'bg-gray-100' },
  { status: 'in_progress', label: 'In Progress', color: 'bg-blue-100' },
  { status: 'blocked', label: 'Blocked', color: 'bg-red-100' },
  { status: 'completed', label: 'Completed', color: 'bg-green-100' },
]

export function RequirementsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const { data: requirements, isLoading } = useRequirements()
  const { updateStatus } = useRequirementMutations()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const filteredRequirements = requirements?.filter((req) => {
    const matchesSearch =
      req.title.toLowerCase().includes(search.toLowerCase()) ||
      req.sets?.name.toLowerCase().includes(search.toLowerCase()) ||
      req.sets?.projects?.name.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || req.requirement_type === typeFilter
    return matchesSearch && matchesType
  })

  const getRequirementsByStatus = (status: RequirementStatus) => {
    return filteredRequirements?.filter((req) => req.status === status)
  }

  const handleStatusChange = (reqId: string, newStatus: RequirementStatus) => {
    updateStatus.mutate({ id: reqId, status: newStatus })
  }

  const renderRequirementCard = (req: RequirementWithRelations) => (
    <div
      key={req.id}
      className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => openDetailPanel('requirement', req.id)}
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
        <div className="flex-1">
          <p className="text-sm font-medium line-clamp-2">{req.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {req.sets?.projects?.name} • {req.sets?.name}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <Badge variant="outline" className="text-xs">
          {req.requirement_type.replace('_', ' ')}
        </Badge>
        <div className="flex items-center gap-2">
          {req.due_date && (
            <span
              className={`text-xs ${
                new Date(req.due_date) < new Date() && req.status !== 'completed'
                  ? 'text-red-600'
                  : 'text-muted-foreground'
              }`}
            >
              {formatDate(req.due_date)}
            </span>
          )}
          {req.assigned_to && (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                {getInitials(req.assigned_to.full_name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Tasks</h1>
          <p className="text-muted-foreground">Manage requirements and tasks</p>
        </div>
        <Button onClick={() => openCreateModal('requirement')}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="open_item">Open Item</SelectItem>
            <SelectItem value="technical">Technical</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="internal_deliverable">Internal Deliverable</SelectItem>
            <SelectItem value="client_deliverable">Client Deliverable</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-r-none"
            onClick={() => setViewMode('kanban')}
          >
            <Kanban className="h-4 w-4" />
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

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Board */
        <div className="grid grid-cols-4 gap-4">
          {statusColumns.map((column) => (
            <div key={column.status} className="flex flex-col">
              <Card className={`${column.color} border-t-4 ${
                column.status === 'open' ? 'border-t-gray-400' :
                column.status === 'in_progress' ? 'border-t-blue-500' :
                column.status === 'blocked' ? 'border-t-red-500' :
                'border-t-green-500'
              }`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    {column.label}
                    <Badge variant="secondary">
                      {getRequirementsByStatus(column.status)?.length || 0}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 min-h-[400px] max-h-[600px] overflow-y-auto">
                  {getRequirementsByStatus(column.status)?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tasks
                    </p>
                  ) : (
                    getRequirementsByStatus(column.status)?.map(renderRequirementCard)
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-3">
          {filteredRequirements?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tasks found</p>
                <Button className="mt-4" onClick={() => openCreateModal('requirement')}>
                  Create your first task
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredRequirements?.map((req) => (
              <Card
                key={req.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetailPanel('requirement', req.id)}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <div
                    className={`w-2 h-8 rounded-full ${
                      req.status === 'completed'
                        ? 'bg-green-500'
                        : req.status === 'in_progress'
                        ? 'bg-blue-500'
                        : req.status === 'blocked'
                        ? 'bg-red-500'
                        : 'bg-gray-400'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{req.title}</span>
                      <Badge variant="outline">{req.requirement_type.replace('_', ' ')}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {req.sets?.projects?.name} • {req.sets?.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Select
                      value={req.status}
                      onValueChange={(value) =>
                        handleStatusChange(req.id, value as RequirementStatus)
                      }
                    >
                      <SelectTrigger className="w-[130px]" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusColumns.map((col) => (
                          <SelectItem key={col.status} value={col.status}>
                            {col.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {req.assigned_to && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {getInitials(req.assigned_to.full_name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {req.due_date && (
                      <span
                        className={`text-sm ${
                          new Date(req.due_date) < new Date() && req.status !== 'completed'
                            ? 'text-red-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatDate(req.due_date)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
