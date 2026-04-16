export { useToast, toast } from './use-toast'
export { useMediaQuery } from './useMediaQuery'
export { useAuth } from './useAuth'
export { useTenant, useTenantUsers } from './useTenant'
export { useUserRole } from './useUserRole'
export { useClients, useClient, useClientMutations } from './useClients'
export {
  useProjects,
  useProjectsByClient,
  useProject,
  useProjectWithHierarchy,
  useProjectMutations,
} from './useProjects'
export {
  useSets,
  useSetsByProject,
  useSetsByClient,
  useSetsByPhase,
  useSet,
  useSetMutations,
  useMyActiveSets,
} from './useSets'
export {
  useRequirements,
  useRequirementsBySet,
  useRequirementsByPitch,
  useRequirementsByProject,
  useRequirementsByClient,
  useMyRequirements,
  useMyActiveTasks,
  useRequirement,
  useRequirementMutations,
} from './useRequirements'
export {
  usePitches,
  usePitchesBySet,
  usePitchesByProject,
  usePitch,
  usePitchMutations,
  useMyActivePitches,
} from './usePitches'
export {
  usePhases,
  usePhasesByProject,
  usePhasesByClient,
  usePhaseById,
  usePhaseTemplates,
  usePhaseMutations,
} from './usePhases'

// Notes hooks
export {
  useEntityNotes,
  useNote,
  useLatestNote,
  useRecentNotes,
  useNoteMutations,
} from './useNotes'

// My Work dashboard hooks
export {
  useMyWorkKpis,
  useMyWorkItems,
  useMyWorkGrouped,
  useMyPastDueItems,
  useMyHighPriorityTasks,
  useMyTasksByPriority,
  useMyTasksByAllPriorities,
  useKpiDrillDownItems,
  useMyWorkHierarchy,
  useAssignedByMeRequirements,
} from './useMyWork'

// Documents hooks
export {
  useDocuments,
  useDocument,
  useDocumentsByEntity,
  useDocumentsByParent,
  useDocumentMutations,
} from './useDocuments'

// Discussions hooks
export {
  useEntityDiscussions,
  useDiscussion,
  useDiscussionMutations,
  useAllDiscussions,
  useMyOpenDiscussions,
} from './useDiscussions'

// Status updates hooks
export {
  useEntityStatusUpdates,
  useRecentStatusUpdates,
  useStatusUpdateMutations,
} from './useStatusUpdates'

// Portal hooks
export {
  usePortalSets,
  usePortalRequirements,
  usePortalDocuments,
  usePortalStatusUpdates,
} from './usePortal'

// Support tickets hooks
export {
  useMyTickets,
  useTenantTickets,
  useAllTickets,
  useTicketById,
  useTicketStats,
  useSupportTicketMutations,
} from './useSupportTickets'

// Form utilities
export { useScrollToError, createScrollableSubmit } from './useScrollToError'

// Password Manager hooks
export { usePasswords, usePassword, usePasswordMutations } from './usePasswords'

// Financial Manager hooks
export {
  useFinancialGroups,
  useFinancialEntries,
  useFinancialEntry,
  useFinancialGroupMutations,
  useFinancialEntryMutations,
  useFinancialOccurrenceMutations,
} from './useFinancials'

// Competitor Tracker hooks
export {
  useCompetitors,
  useCompetitor,
  useCompetitorsByClient,
  useCompetitorMutations,
} from './useCompetitors'

// Lead Automation hooks
export {
  useLeadAutomations,
  useLeadAutomation,
  useAutomationRuns,
  useLeadAutomationMutations,
} from './useLeadAutomations'

// Status filter hook for child tab grids
export { useStatusFilter, type StatusFilterValue } from './useStatusFilter'
