import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePitches } from '@/hooks/usePitches'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
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
  Search,
  Presentation,
  MoreVertical,
  ExternalLink,
  Filter,
  CheckCircle,
  PlayCircle,
} from 'lucide-react'
import { getStatusColor, getPriorityLabel, getPriorityColor } from '@/lib/utils'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { PriorityScore } from '@/types/database'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'on_hold', label: 'On Hold' },
]

export function PitchesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const navigate = useNavigate()
  const { data: pitches, isLoading } = usePitches()
  const { openCreateModal, openDetailPanel } = useUIStore()

  // Filter pitches
  const filteredPitches = useMemo(() => {
    if (!pitches) return []
    return pitches.filter((pitch) => {
      // Search filter
      const matchesSearch =
        pitch.name.toLowerCase().includes(search.toLowerCase()) ||
        pitch.sets?.name?.toLowerCase().includes(search.toLowerCase()) ||
        pitch.sets?.projects?.name?.toLowerCase().includes(search.toLowerCase()) ||
        pitch.sets?.clients?.name?.toLowerCase().includes(search.toLowerCase())

      // Status filter
      const matchesStatus = !statusFilter || pitch.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [pitches, search, statusFilter])

  // Stats
  const stats = useMemo(() => {
    if (!pitches) return { total: 0, completed: 0, inProgress: 0, blocked: 0 }
    return {
      total: pitches.length,
      completed: pitches.filter((p) => p.status === 'completed').length,
      inProgress: pitches.filter((p) => p.status === 'in_progress').length,
      blocked: pitches.filter((p) => p.status === 'blocked').length,
    }
  }, [pitches])

  const handleRowClick = (pitchId: string) => {
    openDetailPanel('pitch', pitchId)
  }

  const handleRowDoubleClick = (pitchId: string) => {
    navigate(`/pitches/${pitchId}`)
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Presentation className="h-8 w-8" />
            Pitches
          </h1>
          <p className="text-muted-foreground">
            Manage requirement groupings within sets
          </p>
        </div>
        <Button onClick={() => openCreateModal('pitch' as any)}>
          <Plus className="mr-2 h-4 w-4" />
          New Pitch
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Presentation className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Pitches</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">In Progress</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Presentation className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Blocked</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{stats.blocked}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, set, project, or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <SearchableSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v || '')}
            placeholder="Status"
            className="w-40"
          />
        </div>
      </div>

      {/* Data Grid */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredPitches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Presentation className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pitches found</p>
            {search || statusFilter ? (
              <Button
                variant="link"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button className="mt-4" onClick={() => openCreateModal('pitch' as any)}>
                Create First Pitch
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="card-carbon">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Pitch Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPitches.map((pitch) => {
                  const set = pitch.sets
                  const project = set?.projects
                  const client = project?.clients || set?.clients

                  return (
                    <TableRow
                      key={pitch.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(pitch.id)}
                      onDoubleClick={() => handleRowDoubleClick(pitch.id)}
                    >
                      <TableCell className="font-medium">
                        {client?.name || '—'}
                      </TableCell>
                      <TableCell>{project?.name || '—'}</TableCell>
                      <TableCell>{set?.name || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{pitch.name}</span>
                          {pitch.pitch_id_display && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {pitch.pitch_id_display}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(pitch.status)} variant="outline">
                          {pitch.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pitch.lead ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={pitch.lead.avatar_url} />
                              <AvatarFallback className="text-xs">
                                {pitch.lead.full_name
                                  ?.split(' ')
                                  .map((n) => n[0])
                                  .join('')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{pitch.lead.full_name}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={pitch.completion_percentage} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-8">
                            {pitch.completion_percentage}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pitch.priority && (
                          <Badge className={getPriorityColor(pitch.priority as PriorityScore)}>
                            {pitch.priority} - {getPriorityLabel(pitch.priority as PriorityScore)}
                          </Badge>
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
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/pitches/${pitch.id}`)
                              }}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open Details
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
      )}
    </div>
  )
}
