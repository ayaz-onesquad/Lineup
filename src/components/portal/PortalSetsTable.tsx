import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DataTable } from '@/components/ui/data-table'
import { formatDate, getStatusColor } from '@/lib/utils'
import type { Set } from '@/types/database'

interface PortalSetsTableProps {
  sets: Set[]
}

export function PortalSetsTable({ sets }: PortalSetsTableProps) {
  const navigate = useNavigate()

  const columns: ColumnDef<Set>[] = [
    {
      accessorKey: 'display_id',
      header: 'ID',
      cell: ({ row }) => (
        <span className="font-mono text-sm">SET-{String(row.original.display_id).padStart(4, '0')}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="max-w-md">
          <div className="font-medium">{row.original.name}</div>
          {row.original.description && (
            <div className="text-sm text-muted-foreground line-clamp-1">
              {row.original.description}
            </div>
          )}
        </div>
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
      accessorKey: 'expected_end_date',
      header: 'Expected Completion',
      cell: ({ row }) =>
        row.original.expected_end_date
          ? formatDate(row.original.expected_end_date)
          : '-',
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => (
        <div className="flex items-center gap-3 min-w-[120px]">
          <Progress value={row.original.completion_percentage || 0} className="h-2 flex-1" />
          <span className="text-sm font-medium w-12 text-right">
            {row.original.completion_percentage || 0}%
          </span>
        </div>
      ),
    },
  ]

  return (
    <Card>
      <CardContent className="pt-6">
        {sets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No work packages are currently shared with you.
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={sets}
            onRowClick={(row) => navigate(`/portal/sets/${row.id}`)}
          />
        )}
      </CardContent>
    </Card>
  )
}
