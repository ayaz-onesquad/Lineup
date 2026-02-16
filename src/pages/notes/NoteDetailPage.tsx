import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useNote, useNoteMutations } from '@/hooks/useNotes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  StickyNote,
  Video,
  Lock,
  Users,
  Edit,
  Save,
  X,
  Loader2,
  Pin,
  PinOff,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import type { NoteType, NoteParentEntityType } from '@/types/database'

const NOTE_TYPE_OPTIONS = [
  { value: 'meeting', label: 'Meeting', icon: Video },
  { value: 'internal', label: 'Internal', icon: Lock },
  { value: 'client', label: 'Client', icon: Users },
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

function getEntityPath(entityType: NoteParentEntityType, entityId: string) {
  const paths: Record<NoteParentEntityType, string> = {
    client: '/clients',
    project: '/projects',
    phase: '/phases',
    set: '/sets',
    pitch: '/pitches',
    requirement: '/requirements',
    lead: '/leads',
    contact: '/contacts',
  }
  return `${paths[entityType]}/${entityId}`
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

export function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>()
  const navigate = useNavigate()
  const { data: note, isLoading } = useNote(noteId!)
  const { updateNote, togglePinNote, deleteNote } = useNoteMutations()

  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editValues, setEditValues] = useState({
    title: '',
    description: '',
    note_type: 'internal' as NoteType,
  })

  // Initialize edit values when note loads
  useEffect(() => {
    if (note && !isEditing) {
      setEditValues({
        title: note.title,
        description: note.description || '',
        note_type: note.note_type,
      })
    }
  }, [note, isEditing])

  const handleSave = async () => {
    if (!noteId || !note || !editValues.title.trim()) return

    try {
      await updateNote.mutateAsync({
        id: noteId,
        entityType: note.parent_entity_type,
        entityId: note.parent_entity_id,
        title: editValues.title.trim(),
        description: editValues.description.trim() || undefined,
        note_type: editValues.note_type,
      })
      setIsEditing(false)
    } catch {
      // Error handled by mutation
    }
  }

  const handleTogglePin = () => {
    if (!noteId) return
    togglePinNote.mutate({ id: noteId, entityType: note!.parent_entity_type, entityId: note!.parent_entity_id })
  }

  const handleDelete = async () => {
    if (!noteId) return
    try {
      await deleteNote.mutateAsync({ id: noteId, entityType: note!.parent_entity_type, entityId: note!.parent_entity_id })
      navigate('/notes')
    } catch {
      // Error handled by mutation
    }
  }

  const handleCancelEdit = () => {
    if (note) {
      setEditValues({
        title: note.title,
        description: note.description || '',
        note_type: note.note_type,
      })
    }
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!note) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Note not found</p>
        <Button variant="link" onClick={() => navigate('/notes')}>
          Back to Notes
        </Button>
      </div>
    )
  }

  const Icon = getNoteTypeIcon(note.note_type)
  const colorClass = getNoteTypeColor(note.note_type)

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Notes', href: '/notes' },
          { label: note.title, displayId: note.display_id?.toString() },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? editValues.title : note.title}
            </h1>
            {note.is_pinned && (
              <Badge variant="secondary" className="gap-1">
                <Pin className="h-3 w-3" />
                Pinned
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span>
              {getEntityTypeLabel(note.parent_entity_type)} note
            </span>
            <span>•</span>
            <span>Created {formatDateTime(note.created_at)}</span>
            {note.author?.full_name && (
              <>
                <span>•</span>
                <span>by {note.author.full_name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTogglePin}
            disabled={togglePinNote.isPending}
          >
            {note.is_pinned ? (
              <PinOff className="mr-2 h-4 w-4" />
            ) : (
              <Pin className="mr-2 h-4 w-4" />
            )}
            {note.is_pinned ? 'Unpin' : 'Pin'}
          </Button>
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateNote.isPending}>
                {updateNote.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Note Content</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={editValues.title}
                    onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                    placeholder="Note title..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editValues.note_type}
                    onValueChange={(v) => setEditValues({ ...editValues, note_type: v as NoteType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <opt.icon className="h-4 w-4" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <RichTextEditor
                    content={editValues.description}
                    onChange={(content) => setEditValues({ ...editValues, description: content })}
                    placeholder="Write your note..."
                    minHeight="300px"
                  />
                </div>
              </div>
            ) : (
              <RichTextEditor
                content={note.description || ''}
                onChange={() => {}}
                readOnly
              />
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Type</p>
                <Badge className={cn('mt-1', colorClass)} variant="outline">
                  <Icon className="h-3 w-3 mr-1" />
                  {note.note_type.charAt(0).toUpperCase() + note.note_type.slice(1)}
                </Badge>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">Attached To</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="secondary">
                    {getEntityTypeLabel(note.parent_entity_type)}
                  </Badge>
                  <Link
                    to={getEntityPath(note.parent_entity_type, note.parent_entity_id)}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View {getEntityTypeLabel(note.parent_entity_type)}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <div className="mt-1">
                  {note.is_pinned ? (
                    <Badge variant="secondary" className="gap-1">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not pinned</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Author Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Author</CardTitle>
            </CardHeader>
            <CardContent>
              {note.author?.full_name ? (
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {note.author.full_name
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{note.author.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(note.created_at)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unknown author</p>
              )}
            </CardContent>
          </Card>

          {/* Timestamps Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timestamps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Created</p>
                <p>{formatDateTime(note.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p>{formatDateTime(note.updated_at)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{note.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNote.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
