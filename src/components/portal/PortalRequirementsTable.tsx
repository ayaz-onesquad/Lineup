import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DataTable } from '@/components/ui/data-table'
import { formatDate, getStatusColor } from '@/lib/utils'
import type { RequirementWithRelations } from '@/types/database'
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react'

interface PortalRequirementsTableProps {
  requirements: RequirementWithRelations[]
}

export function PortalRequirementsTable({ requirements }: PortalRequirementsTableProps) {
  const navigate = useNavigate()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'in_progress':
        return <AlertCircle className="h-4 w-4 text-blue-500" />
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const columns: ColumnDef<RequirementWithRelations>[] = [
    {
      id: 'status_icon',
      header: '',
      cell: ({ row }) => getStatusIcon(row.original.status),
    },
    {
      accessorKey: 'title',
      header: 'Requirement',
      cell: ({ row }) => (
        <div className="max-w-md">
          <div className="font-medium">{row.original.title}</div>
          {row.original.description && (
            <div className="text-sm text-muted-foreground line-clamp-1">
              {row.original.description}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'requirement_type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.requirement_type.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge className={getStatusColor(row.original.status)}>
          {row.original.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      id: 'assigned_to',
      header: 'Assigned To',
      cell: ({ row }) => {
        const assignee = row.original.assigned_to
        if (!assignee) return <span className="text-muted-foreground">-</span>

        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={assignee.avatar_url || undefined} />
              <AvatarFallback className="text-xs">
                {assignee.full_name?.slice(0, 2).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm">{assignee.full_name}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'expected_due_date',
      header: 'Due Date',
      cell: ({ row }) =>
        row.original.expected_due_date
          ? formatDate(row.original.expected_due_date)
          : '-',
    },
  ]

  return (
    <Card>
      <CardContent className="pt-6">
        {requirements.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No requirements are currently shared with you.
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={requirements}
            onRowClick={(row) => navigate(`/portal/requirements/${row.id}`)}
          />
        )}
      </CardContent>
    </Card>
  )
}
