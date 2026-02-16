import { supabase } from '@/services/supabase'
import type {
  Note,
  NoteWithAuthor,
  CreateNoteInput,
  UpdateNoteInput,
  NoteParentEntityType,
  EntityLatestNote,
} from '@/types/database'

export const notesApi = {
  /**
   * Get notes for a specific entity
   */
  getByEntity: async (
    entityType: NoteParentEntityType,
    entityId: string,
    limit: number = 50
  ): Promise<NoteWithAuthor[]> => {
    // Use the RPC function for proper author resolution
    const { data, error } = await supabase.rpc('get_entity_notes', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_limit: limit,
    })

    if (error) throw error

    // Transform RPC result to NoteWithAuthor format
    return (data || []).map((row: {
      id: string
      title: string
      description: string | null
      note_type: string
      is_pinned: boolean
      created_at: string
      created_by: string | null
      author_name: string | null
    }) => ({
      id: row.id,
      tenant_id: '', // Not returned by RPC
      display_id: 0, // Not returned by RPC
      title: row.title,
      description: row.description || undefined,
      note_type: row.note_type as Note['note_type'],
      parent_entity_type: entityType,
      parent_entity_id: entityId,
      is_pinned: row.is_pinned,
      created_at: row.created_at,
      created_by: row.created_by || undefined,
      updated_at: row.created_at, // RPC doesn't return updated_at
      author: row.author_name
        ? { id: row.created_by || '', user_id: '', full_name: row.author_name, created_at: '', updated_at: '' }
        : undefined,
    }))
  },

  /**
   * Get a single note by ID
   */
  getById: async (id: string): Promise<NoteWithAuthor | null> => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    // Fetch author profile
    let author = undefined
    if (data.created_by) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, user_id, full_name, avatar_url')
        .eq('user_id', data.created_by)
        .single()
      author = profile || undefined
    }

    return { ...data, author }
  },

  /**
   * Get latest note for an entity (for roll-up display)
   */
  getLatestForEntity: async (
    entityType: NoteParentEntityType,
    entityId: string
  ): Promise<EntityLatestNote | null> => {
    const { data, error } = await supabase
      .from('entity_latest_notes')
      .select('*')
      .eq('parent_entity_type', entityType)
      .eq('parent_entity_id', entityId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data
  },

  /**
   * Create a new note
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreateNoteInput
  ): Promise<Note> => {
    const { data, error } = await supabase
      .from('notes')
      .insert({
        tenant_id: tenantId,
        title: input.title,
        description: input.description,
        note_type: input.note_type || 'internal',
        parent_entity_type: input.parent_entity_type,
        parent_entity_id: input.parent_entity_id,
        is_pinned: input.is_pinned || false,
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update an existing note
   */
  update: async (
    id: string,
    userId: string,
    input: UpdateNoteInput
  ): Promise<Note> => {
    const { data, error } = await supabase
      .from('notes')
      .update({
        ...input,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Toggle pin status
   */
  togglePin: async (id: string, userId: string): Promise<Note> => {
    // Get current pin status
    const { data: current, error: fetchError } = await supabase
      .from('notes')
      .select('is_pinned')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Toggle it
    const { data, error } = await supabase
      .from('notes')
      .update({
        is_pinned: !current.is_pinned,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete a note
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Get all notes for tenant (admin view)
   */
  getAll: async (tenantId: string, limit: number = 100): Promise<NoteWithAuthor[]> => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    // Batch fetch author profiles
    const userIds = [...new Set((data || []).map((n) => n.created_by).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, user_id, full_name, avatar_url')
      .in('user_id', userIds)

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

    return (data || []).map((note) => ({
      ...note,
      author: note.created_by ? profileMap.get(note.created_by) : undefined,
    }))
  },

  /**
   * Get recent notes across all entities (for activity feed)
   */
  getRecentActivity: async (
    tenantId: string,
    limit: number = 20
  ): Promise<NoteWithAuthor[]> => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    // Batch fetch author profiles
    const userIds = [...new Set((data || []).map((n) => n.created_by).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, user_id, full_name, avatar_url')
      .in('user_id', userIds)

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

    return (data || []).map((note) => ({
      ...note,
      author: note.created_by ? profileMap.get(note.created_by) : undefined,
    }))
  },
}
