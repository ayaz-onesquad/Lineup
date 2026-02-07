// User types
export interface User {
  id: string
  email: string
  created_at: string
}

export interface UserProfile {
  id: string
  user_id: string
  full_name: string
  avatar_url?: string
  role?: UserRole
  created_at: string
  updated_at: string
}

// Tenant types
export type TenantStatus = 'active' | 'suspended' | 'cancelled'
export type PlanTier = 'starter' | 'professional' | 'business'

export interface Tenant {
  id: string
  name: string
  slug: string
  status: TenantStatus
  plan_tier: PlanTier
  created_at: string
  updated_at: string
  deleted_at?: string
  user_count?: number
  project_count?: number
}

// Tenant User types
export type UserRole = 'org_admin' | 'org_user' | 'client_user' | 'sys_admin'
export type UserStatus = 'active' | 'invited' | 'suspended'

export interface TenantUser {
  id: string
  tenant_id: string
  user_id: string
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface TenantUserWithProfile extends TenantUser {
  user_profiles?: UserProfile
  tenants?: Tenant
}

// Contact types
export type ContactRole = 'owner' | 'executive' | 'manager' | 'coordinator' | 'technical' | 'billing' | 'other'

export interface Contact {
  id: string
  tenant_id: string
  client_id: string
  display_id: number
  first_name: string
  last_name: string
  email?: string
  phone?: string
  role?: ContactRole
  relationship?: string
  is_primary: boolean
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ContactWithCreator extends Contact {
  creator?: UserProfile
  updater?: UserProfile
}

// Client types
export type ClientStatus = 'active' | 'inactive' | 'onboarding'
export type IndustryType =
  | 'saas'
  | 'ecommerce'
  | 'healthcare'
  | 'fintech'
  | 'real_estate'
  | 'education'
  | 'technology'
  | 'finance'
  | 'retail'
  | 'manufacturing'
  | 'media'
  | 'hospitality'
  | 'consulting'
  | 'legal'
  | 'non_profit'
  | 'government'
  | 'other'

export type ReferralSource =
  | 'referral'
  | 'website'
  | 'social_media'
  | 'advertising'
  | 'event'
  | 'partner'
  | 'cold_outreach'
  | 'other'

export interface Client {
  id: string
  tenant_id: string
  display_id: number
  name: string
  company_name: string
  email: string // deprecated - use contacts
  phone?: string // deprecated - use contacts
  contact_name?: string // deprecated - use contacts
  contact_email?: string // deprecated - use contacts
  overview?: string
  industry?: IndustryType
  location?: string
  status: ClientStatus
  portal_enabled: boolean
  relationship_manager_id?: string
  referral_source?: ReferralSource
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ClientWithRelations extends Client {
  contacts?: Contact[]
  primary_contact?: Contact
  relationship_manager?: UserProfile
  creator?: UserProfile
  updater?: UserProfile
}

// Urgency and Importance for Eisenhower Matrix
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'
export type ImportanceLevel = 'low' | 'medium' | 'high'

// Priority score (1-6, lower is higher priority)
export type PriorityScore = 1 | 2 | 3 | 4 | 5 | 6

// Project types
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type ProjectHealth = 'on_track' | 'at_risk' | 'delayed'

export interface Project {
  id: string
  tenant_id: string
  client_id: string
  display_id: number
  name: string
  description?: string
  project_code: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  status: ProjectStatus
  health: ProjectHealth
  completion_percentage: number
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  completion_date?: string
  show_in_client_portal: boolean
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ProjectWithRelations extends Project {
  clients?: Client
  lead?: UserProfile
  secondary_lead?: UserProfile
  pm?: UserProfile
  phases?: ProjectPhase[]
  creator?: UserProfile
  updater?: UserProfile
}

// Phase types
export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked'

export interface ProjectPhase {
  id: string
  tenant_id: string
  project_id: string
  display_id: number
  name: string
  description?: string
  phase_order: number
  status: PhaseStatus
  completion_percentage: number
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  owner_id?: string
  show_in_client_portal: boolean
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  sets?: Set[]
}

export interface PhaseWithRelations extends ProjectPhase {
  projects?: Project
  owner?: UserProfile
  sets?: Set[]
  creator?: UserProfile
  updater?: UserProfile
}

// Set types
export type SetStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface Set {
  id: string
  tenant_id: string
  project_id: string
  phase_id?: string
  display_id: number
  name: string
  description?: string
  set_order: number
  urgency: UrgencyLevel
  importance: ImportanceLevel
  priority_score: PriorityScore
  status: SetStatus
  completion_percentage: number
  due_date?: string
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  completion_date?: string
  owner_id?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  show_in_client_portal: boolean
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  requirements?: Requirement[]
}

export interface SetWithRelations extends Set {
  projects?: Project
  project_phases?: ProjectPhase
  owner?: UserProfile
  lead?: UserProfile
  secondary_lead?: UserProfile
  pm?: UserProfile
  requirements?: Requirement[]
  creator?: UserProfile
  updater?: UserProfile
}

// Requirement types
export type RequirementType =
  | 'task'
  | 'open_item'
  | 'technical'
  | 'support'
  | 'internal_deliverable'
  | 'client_deliverable'

export type RequirementStatus = 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
export type ReviewStatus = 'not_required' | 'pending' | 'in_review' | 'approved' | 'rejected'

export interface Requirement {
  id: string
  tenant_id: string
  set_id: string
  display_id: number
  title: string
  description?: string
  requirement_order: number
  requirement_type: RequirementType
  status: RequirementStatus
  urgency: UrgencyLevel
  importance: ImportanceLevel
  priority_score: PriorityScore
  requires_document: boolean
  requires_review: boolean
  review_status: ReviewStatus
  reviewer_id?: string
  reviewed_at?: string
  due_date?: string
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  estimated_hours?: number
  actual_hours?: number
  assigned_to_id?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  completed_at?: string
  show_in_client_portal: boolean
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface RequirementWithRelations extends Requirement {
  sets?: SetWithRelations
  assigned_to?: UserProfile
  lead?: UserProfile
  secondary_lead?: UserProfile
  pm?: UserProfile
  reviewer?: UserProfile
  creator?: UserProfile
  updater?: UserProfile
}

// Document types
export type EntityType = 'client' | 'project' | 'phase' | 'set' | 'requirement'

export interface Document {
  id: string
  tenant_id: string
  name: string
  description?: string
  file_url: string
  file_type: string
  file_size_bytes: number
  entity_type: EntityType
  entity_id: string
  show_in_client_portal: boolean
  uploaded_by: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface DocumentWithUploader extends Document {
  uploader?: UserProfile
}

// Discussion types
export interface Discussion {
  id: string
  tenant_id: string
  entity_type: EntityType
  entity_id: string
  parent_discussion_id?: string
  content: string
  is_internal: boolean
  author_id: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface DiscussionWithAuthor extends Discussion {
  author?: UserProfile
  replies?: DiscussionWithAuthor[]
}

// Status Update types
export type StatusUpdateEntityType = 'project' | 'phase' | 'set' | 'requirement'
export type StatusUpdateType = 'general' | 'milestone' | 'blocker' | 'completed'

export interface StatusUpdate {
  id: string
  tenant_id: string
  entity_type: StatusUpdateEntityType
  entity_id: string
  title?: string
  content: string
  update_type: StatusUpdateType
  previous_status?: string
  new_status?: string
  show_in_client_portal: boolean
  author_id: string
  created_at: string
}

export interface StatusUpdateWithAuthor extends StatusUpdate {
  author?: UserProfile
}

// Form types for creating/updating entities
export interface CreateTenantInput {
  name: string
  slug?: string
}

export interface CreateClientInput {
  name: string
  company_name: string
  email?: string
  phone?: string
  overview?: string
  industry?: IndustryType
  location?: string
  status?: ClientStatus
  portal_enabled?: boolean
  relationship_manager_id?: string
  referral_source?: ReferralSource
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  status?: ClientStatus
}

// Atomic client + contact creation types
export interface CreateClientWithContactInput {
  client: {
    name: string
    company_name?: string
    status?: ClientStatus
    industry?: IndustryType
    location?: string
    overview?: string
    portal_enabled?: boolean
  }
  contact: {
    first_name: string
    last_name: string
    email?: string
    phone?: string
    role?: ContactRole
    relationship?: string
  }
}

export interface CreateClientWithContactResult {
  client: Client
  contact: Contact
}

export interface CreateContactInput {
  client_id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  role?: ContactRole
  relationship?: string
  is_primary?: boolean
}

export interface UpdateContactInput extends Partial<Omit<CreateContactInput, 'client_id'>> {
  client_id?: string
}

export interface CreateProjectInput {
  client_id: string
  name: string
  description?: string
  project_code?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  expected_start_date?: string
  expected_end_date?: string
  show_in_client_portal?: boolean
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  status?: ProjectStatus
  health?: ProjectHealth
  actual_start_date?: string
  actual_end_date?: string
  completion_date?: string
}

export interface CreatePhaseInput {
  project_id: string
  name: string
  description?: string
  phase_order?: number
  owner_id?: string
  expected_start_date?: string
  expected_end_date?: string
  show_in_client_portal?: boolean
}

export interface UpdatePhaseInput extends Partial<CreatePhaseInput> {
  status?: PhaseStatus
  actual_start_date?: string
  actual_end_date?: string
}

export interface CreateSetInput {
  project_id: string
  phase_id?: string
  name: string
  description?: string
  set_order?: number
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  due_date?: string
  expected_start_date?: string
  expected_end_date?: string
  owner_id?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  show_in_client_portal?: boolean
}

export interface UpdateSetInput extends Partial<CreateSetInput> {
  status?: SetStatus
  actual_start_date?: string
  actual_end_date?: string
  completion_date?: string
}

export interface CreateRequirementInput {
  set_id: string
  title: string
  description?: string
  requirement_order?: number
  requirement_type?: RequirementType
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  requires_document?: boolean
  requires_review?: boolean
  reviewer_id?: string
  due_date?: string
  expected_start_date?: string
  expected_end_date?: string
  estimated_hours?: number
  assigned_to_id?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  show_in_client_portal?: boolean
}

export interface UpdateRequirementInput extends Partial<CreateRequirementInput> {
  status?: RequirementStatus
  review_status?: ReviewStatus
  actual_start_date?: string
  actual_end_date?: string
  actual_hours?: number
  reviewed_at?: string
}

export interface CreateDiscussionInput {
  entity_type: EntityType
  entity_id: string
  parent_discussion_id?: string
  content: string
  is_internal?: boolean
}

export interface CreateStatusUpdateInput {
  entity_type: StatusUpdateEntityType
  entity_id: string
  title?: string
  content: string
  update_type?: StatusUpdateType
  previous_status?: string
  new_status?: string
  show_in_client_portal?: boolean
}

// Dashboard stats
export interface DashboardStats {
  totalProjects: number
  activeProjects: number
  totalSets: number
  openSets: number
  totalRequirements: number
  myRequirements: number
  completedRequirements: number
  overdueRequirements: number
}

// Audit trail info
export interface AuditInfo {
  created_at: string
  created_by: string
  updated_at: string
  updated_by?: string
  creator?: UserProfile
  updater?: UserProfile
}
