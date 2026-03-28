export { authApi } from './auth'
export { tenantsApi } from './tenants'
export { clientsApi } from './clients'
export { contactsApi } from './contacts'
export { projectsApi } from './projects'
export { phasesApi } from './phases'
export { setsApi } from './sets'
export { requirementsApi } from './requirements'
export { documentsApi, StoragePermissionError, StorageBucketNotFoundError } from './documents'
export { discussionsApi, type DiscussionWithContext } from './discussions'
export { statusUpdatesApi } from './statusUpdates'

// V2 Feature APIs
export { documentCatalogApi } from './documentCatalog'
export { pitchesApi } from './pitches'
export { leadsApi } from './leads'
export { leadAutomationsApi } from './leadAutomations'
export type {
  LeadAutomation,
  AutomationRun,
  CreateLeadAutomationInput,
  UpdateLeadAutomationInput,
} from './leadAutomations'

// V3 Feature APIs
export { notesApi } from './notes'

// Password Manager API
export { passwordsApi } from './passwords'

// Financial Manager API
export { financialGroupsApi, financialEntriesApi, financialOccurrencesApi } from './financials'

// Competitor Tracker API
export { competitorsApi } from './competitors'
