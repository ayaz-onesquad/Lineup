import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateProjectInput, UpdateProjectInput, DuplicateProjectOptions } from '@/types/database'

export function useProjects(includeTemplates = false) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['projects', currentTenant?.id, includeTemplates],
    queryFn: () => projectsApi.getAll(currentTenant!.id, includeTemplates),
    enabled: !!currentTenant?.id,
  })
}

export function useProjectTemplates() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['projects', 'templates', currentTenant?.id],
    queryFn: () => projectsApi.getTemplates(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useProjectsByClient(clientId: string) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['projects', 'client', clientId, currentTenant?.id],
    queryFn: () => projectsApi.getByClientId(clientId, currentTenant!.id),
    enabled: !!clientId && !!currentTenant?.id,
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

  const duplicateProject = useMutation({
    mutationFn: ({ projectId, options }: { projectId: string; options?: DuplicateProjectOptions }) =>
      projectsApi.duplicate(projectId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Project duplicated',
        description: 'The project has been duplicated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to duplicate project',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const saveAsTemplate = useMutation({
    mutationFn: ({
      projectId,
      templateName,
      options,
    }: {
      projectId: string
      templateName: string
      options?: Omit<DuplicateProjectOptions, 'as_template'>
    }) => projectsApi.saveAsTemplate(projectId, templateName, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', 'templates'] })
      toast({
        title: 'Template created',
        description: 'The project has been saved as a template.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create template',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const createFromTemplate = useMutation({
    mutationFn: ({
      templateId,
      clientId,
      projectName,
      options,
    }: {
      templateId: string
      clientId: string
      projectName: string
      options?: Omit<DuplicateProjectOptions, 'as_template' | 'new_client_id' | 'new_name'>
    }) => projectsApi.createFromTemplate(templateId, clientId, projectName, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Project created from template',
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

  return {
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    saveAsTemplate,
    createFromTemplate,
  }
}
