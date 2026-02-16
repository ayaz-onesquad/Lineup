import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { notesApi } from '@/services/api'
import { useTenantStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  Search,
  StickyNote,
  MoreVertical,
  ExternalLink,
  Filter,
  Video,
  Lock,
  Users,
  Pin,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { cn } from '@/lib/utils'
import type { NoteType, NoteParentEntityType } from '@/types/database'

const NOTE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'internal', label: 'Internal' },
  { value: 'client', label: 'Client' },
]

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'client', label: 'Clients' },
  { value: 'project', label: 'Projects' },
  { value: 'phase', label: 'Phases' },
  { value: 'set', label: 'Sets' },
  { value: 'pitch', label: 'Pitches' },
  { value: 'requirement', label: 'Requirements' },
  { value: 'lead', label: 'Leads' },
  { value: 'contact', label: 'Contacts' },
]

function getNoteTypeIcon(noteType: NoteType) {
  switch (noteType) {
    case 'meeting':
      return Video
    case 'internal':
      return Lock
    case 'client':
      return Users
    default:
      return StickyNote
  }
}

function getNoteTypeColor(noteType: NoteType) {
  switch (noteType) {
    case 'meeting':
      return 'text-blue-600 bg-blue-100'
    case 'internal':
      return 'text-gray-600 bg-gray-100'
    case 'client':
      return 'text-green-600 bg-green-100'
    default:
      return 'text-muted-foreground bg-muted'
  }
}

function getEntityTypeLabel(entityType: NoteParentEntityType) {
  const labels: Record<NoteParentEntityType, string> = {
    client: 'Client',
    project: 'Project',
    phase: 'Phase',
    set: 'Set',
    pitch: 'Pitch',
    requirement: 'Requirement',
    lead: 'Lead',
    contact: 'Contact',
  }
  return labels[entityType] || entityType
}

export function NotesPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')

  const navigate = useNavigate()
  const { currentTenant } = useTenantStore()

  // Fetch all notes for the tenant
  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', 'all', currentTenant?.id],
    queryFn: () => notesApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })

  // Filter notes
  const filteredNotes = useMemo(() => {
    if (!notes) return []
    return notes.filter((note) => {
      // Search filter
      const matchesSearch =
        note.title.toLowerCase().includes(search.toLowerCase()) ||
        note.description?.toLowerCase().includes(search.toLowerCase())

      // Type filter
      const matchesType = !typeFilter || note.note_type === typeFilter

      // Entity type filter
      const matchesEntityType = !entityTypeFilter || note.parent_entity_type === entityTypeFilter

      return matchesSearch && matchesType && matchesEntityType
    })
  }, [notes, search, typeFilter, entityTypeFilter])

  // Stats
  const stats = useMemo(() => {
    if (!notes) return { total: 0, meeting: 0, internal: 0, client: 0 }
    return {
      total: notes.length,
      meeting: notes.filter((n) => n.note_type === 'meeting').length,
      internal: notes.filter((n) => n.note_type === 'internal').length,
      client: notes.filter((n) => n.note_type === 'client').length,
    }
  }, [notes])

  const handleRowClick = (noteId: string) => {
    navigate(`/notes/${noteId}`)
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <StickyNote className="h-8 w-8" />
            Notes
          </h1>
          <p className="text-muted-foreground">
            View and manage notes across all records
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Notes</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Meeting Notes</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.meeting}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-gray-600" />
              <span className="text-sm text-muted-foreground">Internal</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-gray-600">{stats.internal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Client Notes</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats.client}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <SearchableSelect
            options={NOTE_TYPE_OPTIONS}
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v || '')}
            placeholder="Note Type"
            className="w-36"
          />
          <SearchableSelect
            options={ENTITY_TYPE_OPTIONS}
            value={entityTypeFilter}
            onValueChange={(v) => setEntityTypeFilter(v || '')}
            placeholder="Entity"
            className="w-36"
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
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <StickyNote className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No notes found</p>
            {(search || typeFilter || entityTypeFilter) && (
              <Button
                variant="link"
                onClick={() => {
                  setSearch('')
                  setTypeFilter('')
                  setEntityTypeFilter('')
                }}
              >
                Clear filters
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
                  <TableHead className="w-[50px]">Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotes.map((note) => {
                  const Icon = getNoteTypeIcon(note.note_type)
                  const colorClass = getNoteTypeColor(note.note_type)

                  return (
                    <TableRow
                      key={note.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(note.id)}
                    >
                      <TableCell>
                        <div className={cn('p-2 rounded w-fit', colorClass)}>
                          <Icon className="h-4 w-4" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {note.is_pinned && (
                            <Pin className="h-3 w-3 text-amber-500 shrink-0" />
                          )}
                          <div>
                            <p className="font-medium">{note.title}</p>
                            {note.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {note.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getEntityTypeLabel(note.parent_entity_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {note.author?.full_name ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {note.author.full_name
                                  .split(' ')
                                  .map((n: string) => n[0])
                                  .join('')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{note.author.full_name}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(note.created_at)}
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
                                navigate(`/notes/${note.id}`)
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
