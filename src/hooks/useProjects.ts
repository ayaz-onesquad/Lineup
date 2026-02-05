import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateProjectInput, UpdateProjectInput } from '@/types/database'

export function useProjects() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['projects', currentTenant?.id],
    queryFn: () => projectsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useProjectsByClient(clientId: string) {
  return useQuery({
    queryKey: ['projects', 'client', clientId],
    queryFn: () => projectsApi.getByClientId(clientId),
    enabled: !!clientId,
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
  })
}

export function useProjectWithHierarchy(id: string) {
  return useQuery({
    queryKey: ['project', id, 'hierarchy'],
    queryFn: () => projectsApi.getWithHierarchy(id),
    enabled: !!id,
  })
}

export function useProjectMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createProject = useMutation({
    mutationFn: (input: CreateProjectInput) =>
      projectsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Project created',
        description: 'The project has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create project',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateProject = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateProjectInput) =>
      projectsApi.update(id, user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', variables.id] })
      toast({
        title: 'Project updated',
        description: 'The project has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update project',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteProject = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Project archived',
        description: 'The project has been archived.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive project',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createProject,
    updateProject,
    deleteProject,
  }
}
