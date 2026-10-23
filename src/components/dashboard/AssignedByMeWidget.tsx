import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssignedByMeRequirements } from '@/hooks/useMyWork'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { Users, Calendar, Inbox } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { getStatusLabel, getStatusColor, computeRequirementStatus, isPastDueStatus } from '@/utils/statusUtils'
import { cn } from '@/lib/utils'

type Assignee = { id: string; full_name: string; avatar_url?: string } | null
type SetRef = { id: string; name: string; clients?: { name: string } } | null

const getInitials = (name?: string) => {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function AssignedByMeWidget() {
  const navigate = useNavigate()
  const { data, isLoading } = useAssignedByMeRequirements(50)
  const [activeTab, setActiveTab] = useState<'active' | 'past_due'>('active')

  const pastDueCount = data?.pastDue?.length || 0

  // Status and due date are derived once per row so the grid can sort on them.
  const items = useMemo(() => {
    const source = activeTab === 'active' ? data?.active || [] : data?.pastDue || []
    return source.map((item) => ({
      ...item,
      status: computeRequirementStatus({
        completed_date: item.completed_date || null,
        actual_due_date: item.actual_due_date || null,
        expected_due_date: item.expected_due_date || null,
        actual_start_date: item.actual_start_date || null,
        expected_start_date: item.expected_start_date || null,
      }),
      dueDate: item.actual_due_date || item.expected_due_date || null,
      assignee: item.assigned_to as Assignee,
      setData: item.sets as SetRef,
    }))
  }, [activeTab, data])

  type Row = (typeof items)[number]

  const columns = useMemo<DataGridColumn<Row>[]>(
    () => [
      {
        id: 'title',
        header: 'Requirement',
        priority: 'primary',
        minWidth: '200px',
        accessor: (row) => row.title || 'Untitled',
        cell: (row) => <span className="font-medium">{row.title || 'Untitled'}</span>,
      },
      {
        id: 'assignee',
        header: 'Assignee',
        priority: 'secondary',
        minWidth: '160px',
        accessor: (row) => row.assignee?.full_name || '',
        cell: (row) => (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={row.assignee?.avatar_url} />
              <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700">
                {getInitials(row.assignee?.full_name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm truncate">{row.assignee?.full_name || 'Unknown'}</span>
          </div>
        ),
      },
      {
        id: 'set',
        header: 'Set',
        minWidth: '140px',
        accessor: (row) => row.setData?.name || '',
        cell: (row) => <span className="text-muted-foreground">{row.setData?.name || '—'}</span>,
      },
      {
        id: 'due',
        header: 'Due',
        priority: 'secondary',
        width: '130px',
        accessor: (row) => (row.dueDate ? new Date(row.dueDate) : null),
        cell: (row) =>
          row.dueDate ? (
            <span
              className={cn(
                'text-sm inline-flex items-center gap-1 whitespace-nowrap',
                isPastDueStatus(row.status) && 'text-red-600 font-medium'
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(row.dueDate)}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '120px',
        accessor: (row) => getStatusLabel(row.status),
        cell: (row) => (
          <Badge variant="outline" className={cn('text-xs', getStatusColor(row.status))}>
            {getStatusLabel(row.status)}
          </Badge>
        ),
      },
    ],
    []
  )

  const openRow = (row: Row) => navigate(`/requirements/${row.id}`)

  return (
    <Card className="relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-100" />
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-100 shrink-0">
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Tasks I Assigned</CardTitle>
              <CardDescription>Track work you've delegated to others</CardDescription>
            </div>
          </div>
          {pastDueCount > 0 && (
            <Badge variant="destructive" className="text-xs shrink-0 whitespace-nowrap">
              {pastDueCount} Past Due
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'past_due')}>
          <div className="px-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active" className="flex items-center gap-2">
                Active ({data?.active?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="past_due" className="flex items-center gap-2">
                Past Due
                {pastDueCount > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                    {pastDueCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-3 px-4 pb-4">
            <DataGrid
              columns={columns}
              data={items}
              getRowId={(row) => row.id}
              isLoading={isLoading}
              onRowClick={openRow}
              onRowOpen={openRow}
              maxBodyHeight="350px"
              density="compact"
              defaultSort={{ columnId: 'due', direction: 'asc' }}
              emptyState={{
                icon: Inbox,
                title: activeTab === 'past_due' ? 'No past due tasks' : 'No tasks assigned to others',
                description:
                  activeTab === 'past_due'
                    ? 'All delegated work is on track'
                    : 'Tasks you create and assign will appear here',
              }}
              ariaLabel="Tasks I assigned"
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
