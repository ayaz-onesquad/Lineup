import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  financialGroupsApi,
  financialEntriesApi,
  financialOccurrencesApi,
} from '@/services/api'
import { useTenantStore, useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/services/supabase'
import { generateOccurrences } from '@/utils/recurrenceUtils'
import type {
  CreateFinancialGroupInput,
  UpdateFinancialGroupInput,
  CreateFinancialEntryInput,
  UpdateFinancialEntryInput,
  UpdateFinancialOccurrenceInput,
} from '@/types/database'

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Hook to fetch all financial groups for the current tenant
 */
export function useFinancialGroups() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['financial_groups', currentTenant?.id],
    queryFn: () => financialGroupsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Hook to fetch all financial entries for the current tenant
 */
export function useFinancialEntries() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['financial_entries', currentTenant?.id],
    queryFn: () => financialEntriesApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Hook to fetch a single financial entry by ID with occurrences
 */
export function useFinancialEntry(id: string) {
  return useQuery({
    queryKey: ['financial_entry', id],
    queryFn: () => financialEntriesApi.getById(id),
    enabled: !!id,
  })
}

// ============================================================================
// HELPER: Get current user profile ID
// ============================================================================

function useCurrentUserProfileId() {
  const { user } = useAuthStore()

  return useQuery({
    queryKey: ['user-profile-id', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single()
      return data?.id || null
    },
    enabled: !!user?.id,
  })
}

// ============================================================================
// MUTATION HOOKS: Financial Groups
// ============================================================================

export function useFinancialGroupMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useCurrentUserProfileId()

  const createGroup = useMutation({
    mutationFn: (input: CreateFinancialGroupInput) =>
      financialGroupsApi.create(currentTenant!.id, userProfileId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_groups', currentTenant?.id] })
      toast({
        title: 'Group created',
        description: 'The financial group has been created successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.createGroup] Error:', error)
      toast({
        title: 'Failed to create group',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateGroup = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateFinancialGroupInput) =>
      financialGroupsApi.update(id, userProfileId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_groups', currentTenant?.id] })
      toast({
        title: 'Group updated',
        description: 'The financial group has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.updateGroup] Error:', error)
      toast({
        title: 'Failed to update group',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteGroup = useMutation({
    mutationFn: financialGroupsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_groups', currentTenant?.id] })
      queryClient.invalidateQueries({ queryKey: ['financial_entries', currentTenant?.id] })
      toast({
        title: 'Group deleted',
        description: 'The financial group has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.deleteGroup] Error:', error)
      toast({
        title: 'Failed to delete group',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createGroup,
    updateGroup,
    deleteGroup,
  }
}

// ============================================================================
// MUTATION HOOKS: Financial Entries
// ============================================================================

export function useFinancialEntryMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useCurrentUserProfileId()

  const createEntry = useMutation({
    mutationFn: (input: CreateFinancialEntryInput) =>
      financialEntriesApi.create(currentTenant!.id, userProfileId!, input),
    onSuccess: async (newEntry) => {
      // Generate and upsert occurrences immediately after entry creation
      try {
        const occurrences = generateOccurrences(newEntry)
        await financialOccurrencesApi.upsertBatch(currentTenant!.id, occurrences)
      } catch (err) {
        console.error('[useFinancials.createEntry] Failed to generate occurrences:', err)
      }
      queryClient.invalidateQueries({ queryKey: ['financial_entries', currentTenant?.id] })
      toast({
        title: 'Entry created',
        description: newEntry.name,
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.createEntry] Error:', error)
      toast({
        title: 'Failed to create entry',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateEntry = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateFinancialEntryInput) =>
      financialEntriesApi.update(id, userProfileId!, input),
    onSuccess: async (updatedEntry, variables) => {
      // Regenerate occurrences if recurrence settings changed
      try {
        const occurrences = generateOccurrences(updatedEntry)
        await financialOccurrencesApi.upsertBatch(currentTenant!.id, occurrences)
      } catch (err) {
        console.error('[useFinancials.updateEntry] Failed to regenerate occurrences:', err)
      }
      await queryClient.refetchQueries({ queryKey: ['financial_entry', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['financial_entries', currentTenant?.id] })
      toast({
        title: 'Entry updated',
        description: 'The financial entry has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.updateEntry] Error:', error)
      toast({
        title: 'Failed to update entry',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteEntry = useMutation({
    mutationFn: financialEntriesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_entries', currentTenant?.id] })
      queryClient.invalidateQueries({ queryKey: ['financial_entry'] })
      toast({
        title: 'Entry deleted',
        description: 'The financial entry has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.deleteEntry] Error:', error)
      toast({
        title: 'Failed to delete entry',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createEntry,
    updateEntry,
    deleteEntry,
  }
}

// ============================================================================
// MUTATION HOOKS: Financial Occurrences
// ============================================================================

export function useFinancialOccurrenceMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()

  const updateOccurrenceStatus = useMutation({
    mutationFn: ({
      id,
      entryId,
      ...input
    }: { id: string; entryId: string } & UpdateFinancialOccurrenceInput) =>
      financialOccurrencesApi.updateStatus(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['financial_entry', variables.entryId] })
      queryClient.invalidateQueries({ queryKey: ['financial_entries', currentTenant?.id] })
      toast({
        title: 'Occurrence updated',
        description: 'The occurrence status has been updated.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.updateOccurrenceStatus] Error:', error)
      toast({
        title: 'Failed to update occurrence',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteOccurrence = useMutation({
    mutationFn: ({ id, entryId: _entryId }: { id: string; entryId: string }) =>
      financialOccurrencesApi.delete(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['financial_entry', variables.entryId] })
      toast({
        title: 'Occurrence deleted',
        description: 'The occurrence has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.deleteOccurrence] Error:', error)
      toast({
        title: 'Failed to delete occurrence',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const regenerateOccurrences = useMutation({
    mutationFn: async (entryId: string) => {
      const entry = await financialEntriesApi.getById(entryId)
      if (!entry) throw new Error('Entry not found')
      const occurrences = generateOccurrences(entry)
      await financialOccurrencesApi.upsertBatch(currentTenant!.id, occurrences)
    },
    onSuccess: (_, entryId) => {
      queryClient.invalidateQueries({ queryKey: ['financial_entry', entryId] })
      toast({
        title: 'Occurrences regenerated',
        description: 'Missing future occurrences have been added.',
      })
    },
    onError: (error: Error) => {
      console.error('[useFinancials.regenerateOccurrences] Error:', error)
      toast({
        title: 'Failed to regenerate occurrences',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    updateOccurrenceStatus,
    deleteOccurrence,
    regenerateOccurrences,
  }
}
