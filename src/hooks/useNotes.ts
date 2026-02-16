import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notesApi } from '@/services/api/notes'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateNoteInput, UpdateNoteInput, NoteParentEntityType } from '@/types/database'

/**
 * Get notes for a specific entity
 */
export function useEntityNotes(
  entityType: NoteParentEntityType,
  entityId: string,
  options?: { limit?: number }
) {
  return useQuery({
    queryKey: ['notes', entityType, entityId],
    queryFn: () => notesApi.getByEntity(entityType, entityId, options?.limit),
    enabled: !!entityType && !!entityId,
  })
}

/**
 * Get a single note by ID
 */
export function useNote(id: string) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: () => notesApi.getById(id),
    enabled: !!id,
  })
}

/**
 * Get latest note for roll-up display
 */
export function useLatestNote(entityType: NoteParentEntityType, entityId: string) {
  return useQuery({
    queryKey: ['notes', 'latest', entityType, entityId],
    queryFn: () => notesApi.getLatestForEntity(entityType, entityId),
    enabled: !!entityType && !!entityId,
  })
}

/**
 * Get recent notes activity for tenant
 */
export function useRecentNotes(limit?: number) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['notes', 'recent', currentTenant?.id, limit],
    queryFn: () => notesApi.getRecentActivity(currentTenant!.id, limit),
    enabled: !!currentTenant?.id,
  })
}

/**
 * CRUD mutations for notes
 */
export function useNoteMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createNote = useMutation({
    mutationFn: (input: CreateNoteInput) =>
      notesApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (_, variables) => {
      // Invalidate notes for this entity
      queryClient.invalidateQueries({
        queryKey: ['notes', variables.parent_entity_type, variables.parent_entity_id],
      })
      // Invalidate latest note
      queryClient.invalidateQueries({
        queryKey: ['notes', 'latest', variables.parent_entity_type, variables.parent_entity_id],
      })
      // Invalidate recent notes
      queryClient.invalidateQueries({ queryKey: ['notes', 'recent'] })

      toast({
        title: 'Note added',
        description: 'Your note has been saved.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add note',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateNote = useMutation({
    mutationFn: ({
      id,
      entityType,
      entityId,
      ...input
    }: { id: string; entityType: NoteParentEntityType; entityId: string } & UpdateNoteInput) =>
      notesApi.update(id, user!.id, input),
    onSuccess: (_, variables) => {
      // Invalidate specific note
      queryClient.invalidateQueries({ queryKey: ['note', variables.id] })
      // Invalidate notes for entity
      queryClient.invalidateQueries({
        queryKey: ['notes', variables.entityType, variables.entityId],
      })
      // Invalidate latest note
      queryClient.invalidateQueries({
        queryKey: ['notes', 'latest', variables.entityType, variables.entityId],
      })

      toast({
        title: 'Note updated',
        description: 'Your changes have been saved.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update note',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const togglePinNote = useMutation({
    mutationFn: (params: { id: string; entityType: NoteParentEntityType; entityId: string }) =>
      notesApi.togglePin(params.id, user!.id),
    onSuccess: (_, variables) => {
      // Invalidate notes for entity (order changes with pinned)
      queryClient.invalidateQueries({
        queryKey: ['notes', variables.entityType, variables.entityId],
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to pin note',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteNote = useMutation({
    mutationFn: (params: { id: string; entityType: NoteParentEntityType; entityId: string }) =>
      notesApi.delete(params.id),
    onSuccess: (_, variables) => {
      // Invalidate notes for entity
      queryClient.invalidateQueries({
        queryKey: ['notes', variables.entityType, variables.entityId],
      })
      // Invalidate latest note
      queryClient.invalidateQueries({
        queryKey: ['notes', 'latest', variables.entityType, variables.entityId],
      })
      // Invalidate recent notes
      queryClient.invalidateQueries({ queryKey: ['notes', 'recent'] })

      toast({
        title: 'Note deleted',
        description: 'The note has been removed.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete note',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createNote,
    updateNote,
    togglePinNote,
    deleteNote,
  }
}
