import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requirementsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type {
  CreateRequirementInput,
  UpdateRequirementInput,
  RequirementStatus,
} from '@/types/database'

export function useRequirements() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['requirements', currentTenant?.id],
    queryFn: () => requirementsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useRequirementsBySet(setId: string) {
  return useQuery({
    queryKey: ['requirements', 'set', setId],
    queryFn: () => requirementsApi.getBySetId(setId),
    enabled: !!setId,
  })
}

export function useMyRequirements() {
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['requirements', 'assigned', user?.id, currentTenant?.id],
    queryFn: () => requirementsApi.getByAssignedTo(currentTenant!.id, user!.id),
    enabled: !!user?.id && !!currentTenant?.id,
  })
}

export function useRequirement(id: string) {
  return useQuery({
    queryKey: ['requirement', id],
    queryFn: () => requirementsApi.getById(id),
    enabled: !!id,
  })
}

export function useRequirementMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createRequirement = useMutation({
    mutationFn: (input: CreateRequirementInput) =>
      requirementsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Requirement created',
        description: 'The requirement has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create requirement',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateRequirement = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateRequirementInput) =>
      requirementsApi.update(id, user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['requirement', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Requirement updated',
        description: 'The requirement has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update requirement',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequirementStatus }) =>
      requirementsApi.updateStatus(id, user!.id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['requirement', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })

  const deleteRequirement = useMutation({
    mutationFn: requirementsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Requirement archived',
        description: 'The requirement has been archived.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive requirement',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const reorderRequirements = useMutation({
    mutationFn: ({ setId, requirementIds }: { setId: string; requirementIds: string[] }) =>
      requirementsApi.reorder(setId, requirementIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })

  return {
    createRequirement,
    updateRequirement,
    updateStatus,
    deleteRequirement,
    reorderRequirements,
  }
}
