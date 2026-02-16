import { useState } from 'react'
import { useEntityNotes, useNoteMutations } from '@/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { RichTextEditor } from './RichTextEditor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  StickyNote,
  Plus,
  Pin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  Lock,
  Video,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { NoteParentEntityType, NoteType, NoteWithAuthor } from '@/types/database'

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; icon: typeof StickyNote; color: string }> =
  {
    meeting: { label: 'Meeting', icon: Video, color: 'text-blue-600 bg-blue-100' },
    internal: { label: 'Internal', icon: Lock, color: 'text-gray-600 bg-gray-100' },
    client: { label: 'Client', icon: Users, color: 'text-green-600 bg-green-100' },
  }

interface NotesPanelProps {
  entityType: NoteParentEntityType
  entityId: string
  title?: string
  description?: string
  maxHeight?: string
  className?: string
}

export function NotesPanel({
  entityType,
  entityId,
  title = 'Notes',
  description = 'Add notes and updates',
  maxHeight = '400px',
  className,
}: NotesPanelProps) {
  const { data: notes, isLoading } = useEntityNotes(entityType, entityId)
  const { createNote, updateNote, togglePinNote, deleteNote } = useNoteMutations()

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<NoteWithAuthor | null>(null)

  // Form state
  const [noteTitle, setNoteTitle] = useState('')
  const [noteDescription, setNoteDescription] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('internal')

  const resetForm = () => {
    setNoteTitle('')
    setNoteDescription('')
    setNoteType('internal')
    setEditingNote(null)
  }

  const handleCreate = () => {
    createNote.mutate(
      {
        parent_entity_type: entityType,
        parent_entity_id: entityId,
        title: noteTitle,
        description: noteDescription,
        note_type: noteType,
      },
      {
        onSuccess: () => {
          resetForm()
          setIsCreateOpen(false)
        },
      }
    )
  }

  const handleUpdate = () => {
    if (!editingNote) return

    updateNote.mutate(
      {
        id: editingNote.id,
        entityType,
        entityId,
        title: noteTitle,
        description: noteDescription,
        note_type: noteType,
      },
      {
        onSuccess: () => {
          resetForm()
        },
      }
    )
  }

  const openEditDialog = (note: NoteWithAuthor) => {
    setEditingNote(note)
    setNoteTitle(note.title)
    setNoteDescription(note.description || '')
    setNoteType(note.note_type)
  }

  const handleDelete = (note: NoteWithAuthor) => {
    if (confirm('Are you sure you want to delete this note?')) {
      deleteNote.mutate({ id: note.id, entityType, entityId })
    }
  }

  const handleTogglePin = (note: NoteWithAuthor) => {
    togglePinNote.mutate({ id: note.id, entityType, entityId })
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4" />
            {title}
          </CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" />
              Add Note
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
              <DialogDescription>Create a new note for this record</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="Note title"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NOTE_TYPE_CONFIG).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <config.icon className="h-3 w-3" />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Content</label>
                <RichTextEditor
                  content={noteDescription}
                  onChange={setNoteDescription}
                  placeholder="Write your note..."
                  minHeight="150px"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!noteTitle || createNote.isPending}>
                {createNote.isPending ? 'Adding...' : 'Add Note'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea style={{ maxHeight }}>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !notes?.length ? (
            <div className="text-center text-muted-foreground py-8">
              <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notes yet</p>
              <p className="text-xs mt-1">Add a note to keep track of important information</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => {
                const config = NOTE_TYPE_CONFIG[note.note_type]
                const Icon = config.icon

                return (
                  <div
                    key={note.id}
                    className={cn(
                      'p-3 rounded-lg border bg-card relative group',
                      note.is_pinned && 'ring-1 ring-amber-300 bg-amber-50/50'
                    )}
                  >
                    {/* Pin indicator */}
                    {note.is_pinned && (
                      <Pin className="absolute top-2 right-2 h-3 w-3 text-amber-500 fill-amber-500" />
                    )}

                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge variant="secondary" className={cn('shrink-0 gap-1', config.color)}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                        <span className="text-sm font-medium truncate">{note.title}</span>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleTogglePin(note)}>
                            <Pin className="h-4 w-4 mr-2" />
                            {note.is_pinned ? 'Unpin' : 'Pin'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(note)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(note)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Description */}
                    {note.description && (
                      <div
                        className="text-sm text-muted-foreground mb-2 prose prose-sm max-w-none [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_h1]:text-base [&_h2]:text-sm"
                        dangerouslySetInnerHTML={{ __html: note.description }}
                      />
                    )}

                    {/* Footer */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{note.author?.full_name || 'Unknown'}</span>
                      <span>•</span>
                      <span>{formatDateTime(note.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Edit Dialog */}
        <Dialog open={!!editingNote} onOpenChange={(open) => !open && resetForm()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Note</DialogTitle>
              <DialogDescription>Update your note</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="Note title"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NOTE_TYPE_CONFIG).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <config.icon className="h-3 w-3" />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Content</label>
                <RichTextEditor
                  content={noteDescription}
                  onChange={setNoteDescription}
                  placeholder="Write your note..."
                  minHeight="150px"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => resetForm()}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={!noteTitle || updateNote.isPending}>
                {updateNote.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
