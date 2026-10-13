import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { notesApi } from '@/services/api'
import { useTenantStore } from '@/stores'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { GridToolbar, GridSearch, GridFilterSelect } from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  StickyNote,
  MoreVertical,
  ExternalLink,
  Video,
  Lock,
  Users,
  Pin,
} from 'lucide-react'
import { formatDateTime, cn } from '@/lib/utils'
import type { NoteType, NoteParentEntityType, NoteWithAuthor } from '@/types/database'

// Filter options. `GridFilterSelect` is clearable, so there is no "All" entry:
// clearing the select is what "all" means.
const NOTE_TYPE_OPTIONS = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'internal', label: 'Internal' },
  { value: 'client', label: 'Client' },
]

const ENTITY_TYPE_OPTIONS = [
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

function getNoteTypeLabel(noteType: NoteType) {
  return NOTE_TYPE_OPTIONS.find(o => o.value === noteType)?.label ?? noteType
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

function authorInitials(fullName: string): string {
  return fullName
    .split(' ')
    .map(part => part[0])
    .join('')
}

export function NotesPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')

  const navigate = useNavigate()
  const { currentTenant } = useTenantStore()

  // Fetch all notes for the tenant
  const {
    data: notes,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notes', 'all', currentTenant?.id],
    queryFn: () => notesApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })

  const hasActiveFilters = !!search || !!typeFilter || !!entityTypeFilter

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('')
    setEntityTypeFilter('')
  }

  // Filter notes
  const filteredNotes = useMemo(() => {
    if (!notes) return []
    const query = search.trim().toLowerCase()
    return notes.filter(note => {
      // Search filter
      const matchesSearch =
        !query ||
        note.title.toLowerCase().includes(query) ||
        !!note.description?.toLowerCase().includes(query)

      // Type filter
      const matchesType = !typeFilter || note.note_type === typeFilter

      // Entity type filter
      const matchesEntityType =
        !entityTypeFilter || note.parent_entity_type === entityTypeFilter

      return matchesSearch && matchesType && matchesEntityType
    })
  }, [notes, search, typeFilter, entityTypeFilter])

  // Stats
  const stats = useMemo(() => {
    if (!notes) return { total: 0, meeting: 0, internal: 0, client: 0 }
    return {
      total: notes.length,
      meeting: notes.filter(n => n.note_type === 'meeting').length,
      internal: notes.filter(n => n.note_type === 'internal').length,
      client: notes.filter(n => n.note_type === 'client').length,
    }
  }, [notes])

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the title identifies the
  // row; type, entity, author and the creation time are the four triage facts.
  // The type cell carries its label as well as the coloured icon, because a
  // colour on its own is not a status (section 2.5).
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<NoteWithAuthor>[]>(
    () => [
      {
        id: 'note_type',
        header: 'Type',
        priority: 'secondary',
        width: '150px',
        accessor: row => getNoteTypeLabel(row.note_type),
        cell: row => {
          const Icon = getNoteTypeIcon(row.note_type)
          return (
            <div className="flex items-center gap-2">
              <span className={cn('w-fit rounded p-1.5', getNoteTypeColor(row.note_type))}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate text-sm">{getNoteTypeLabel(row.note_type)}</span>
            </div>
          )
        },
      },
      {
        id: 'title',
        header: 'Title',
        priority: 'primary',
        hideable: false,
        minWidth: '240px',
        accessor: row => row.title,
        cell: row => (
          <div className="flex min-w-0 items-start gap-2">
            {row.is_pinned && (
              <Pin className="mt-1 h-3 w-3 shrink-0 text-amber-500" aria-label="Pinned" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                <TruncatedCell value={row.title} maxLines={1} />
              </p>
              {row.description && (
                <span className="block text-xs text-muted-foreground">
                  <TruncatedCell value={row.description} maxLines={1} />
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'parent_entity_type',
        header: 'Entity',
        priority: 'secondary',
        width: '150px',
        accessor: row => getEntityTypeLabel(row.parent_entity_type),
        cell: row => (
          <Badge variant="outline">{getEntityTypeLabel(row.parent_entity_type)}</Badge>
        ),
      },
      {
        id: 'author',
        header: 'Author',
        priority: 'secondary',
        width: '190px',
        // Composite avatar cell, so it opts out of sorting (section 4.2).
        sortable: false,
        accessor: row => row.author?.full_name ?? '',
        cell: row =>
          row.author?.full_name ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-xs">
                  {authorInitials(row.author.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate text-sm">{row.author.full_name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'created_at',
        header: 'Created',
        priority: 'secondary',
        width: '180px',
        accessor: row => row.created_at,
        cell: row => (
          <span className="text-muted-foreground">{formatDateTime(row.created_at)}</span>
        ),
      },
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        width: '110px',
        accessor: row => row.display_id ?? 0,
        cell: row => (
          <Badge variant="outline" className="font-mono text-xs">
            NOTE-{String(row.display_id ?? 0).padStart(4, '0')}
          </Badge>
        ),
      },
    ],
    []
  )

  return (
    <PageShell
      title="Notes"
      description="View and manage notes across all records"
      icon={StickyNote}
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Notes</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Meeting Notes</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-blue-600">{stats.meeting}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-gray-600" />
              <span className="text-sm text-muted-foreground">Internal</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-600">{stats.internal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Client Notes</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-green-600">{stats.client}</p>
          </CardContent>
        </Card>
      </div>

      <DataGrid
        columns={columns}
        data={filteredNotes}
        getRowId={row => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="notes"
        defaultSort={{ columnId: 'created_at', direction: 'desc' }}
        ariaLabel="Notes"
        // This page has never had a quick-view panel: a click has always opened
        // the note, so both the click and the open handler navigate.
        onRowClick={row => navigate(`/notes/${row.id}`)}
        onRowOpen={row => navigate(`/notes/${row.id}`)}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        emptyState={{
          icon: StickyNote,
          title: 'No notes found',
          description: 'Notes added to any client, project or requirement appear here.',
        }}
        toolbar={
          <GridToolbar
            activeFilterCount={[typeFilter, entityTypeFilter].filter(Boolean).length}
            onClearFilters={clearFilters}
            search={
              <GridSearch
                value={search}
                onChange={setSearch}
                placeholder="Search notes by title or description..."
              />
            }
          >
            <GridFilterSelect
              label="Types"
              options={NOTE_TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
            />
            <GridFilterSelect
              label="Entities"
              options={ENTITY_TYPE_OPTIONS}
              value={entityTypeFilter}
              onChange={setEntityTypeFilter}
            />
          </GridToolbar>
        }
        rowActions={row => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Note actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/notes/${row.id}`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </PageShell>
  )
}
