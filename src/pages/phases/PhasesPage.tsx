import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { usePhases } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Calendar } from 'lucide-react'
import { getStatusColor } from '@/lib/utils'
import { format } from 'date-fns'
import type { EnhancedProjectPhase } from '@/types/database'

export function PhasesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data: phases, isLoading } = usePhases()

  const filteredPhases = phases?.filter(
    (phase) =>
      phase.name.toLowerCase().includes(search.toLowerCase()) ||
      phase.projects?.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleRowClick = (phase: EnhancedProjectPhase) => {
    navigate(`/phases/${phase.id}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Phases</h1>
          <p className="text-muted-foreground">
            Manage project phases across all projects
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search phases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phase ID</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Phase Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Expected End Date</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPhases?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No phases found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPhases?.map((phase) => (
                  <TableRow
                    key={phase.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(phase)}
                    onDoubleClick={() => navigate(`/phases/${phase.id}`)}
                  >
                    <TableCell>
                      <span className="font-mono text-sm">
                        {phase.phase_id_display || `PH-${phase.display_id}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      {phase.projects ? (
                        <Link
                          to={`/projects/${phase.project_id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {phase.projects.name}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{phase.name}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(phase.status)} variant="outline">
                        {phase.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{phase.lead?.full_name || '-'}</TableCell>
                    <TableCell>
                      {phase.expected_end_date ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {format(new Date(phase.expected_end_date), 'MMM d, yyyy')}
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${phase.completion_percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {phase.completion_percentage}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
