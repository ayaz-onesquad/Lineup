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

// Client types
export type ClientStatus = 'active' | 'inactive'

export interface Client {
  id: string
  tenant_id: string
  name: string
  company_name: string
  email: string
  phone?: string
  contact_name?: string
  contact_email?: string
  industry?: string
  status: ClientStatus
  portal_enabled: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

// Project types
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type ProjectHealth = 'on_track' | 'at_risk' | 'delayed'

export interface Project {
  id: string
  tenant_id: string
  client_id: string
  name: string
  description?: string
  project_code: string
  lead_id?: string
  status: ProjectStatus
  health: ProjectHealth
  completion_percentage: number
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  show_in_client_portal: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ProjectWithRelations extends Project {
  clients?: Client
  lead?: UserProfile
  phases?: ProjectPhase[]
}

// Phase types
export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked'

export interface ProjectPhase {
  id: string
  tenant_id: string
  project_id: string
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
  created_at: string
  updated_at: string
  deleted_at?: string
  sets?: Set[]
}

export interface PhaseWithRelations extends ProjectPhase {
  projects?: Project
  owner?: UserProfile
  sets?: Set[]
}

// Set types
export type UrgencyLevel = 'low' | 'medium' | 'high'
export type ImportanceLevel = 'low' | 'medium' | 'high'
export type SetStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface Set {
  id: string
  tenant_id: string
  project_id: string
  phase_id?: string
  name: string
  description?: string
  set_order: number
  urgency: UrgencyLevel
  importance: ImportanceLevel
  status: SetStatus
  completion_percentage: number
  due_date?: string
  owner_id?: string
  show_in_client_portal: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at?: string
  requirements?: Requirement[]
}

export interface SetWithRelations extends Set {
  projects?: Project
  project_phases?: ProjectPhase
  owner?: UserProfile
  requirements?: Requirement[]
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

export interface Requirement {
  id: string
  tenant_id: string
  set_id: string
  title: string
  description?: string
  requirement_order: number
  requirement_type: RequirementType
  status: RequirementStatus
  requires_document: boolean
  requires_review: boolean
  reviewer_id?: string
  reviewed_at?: string
  due_date?: string
  estimated_hours?: number
  actual_hours?: number
  assigned_to_id?: string
  completed_at?: string
  show_in_client_portal: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface RequirementWithRelations extends Requirement {
  sets?: SetWithRelations
  assigned_to?: UserProfile
  reviewer?: UserProfile
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
  email: string
  phone?: string
  portal_enabled?: boolean
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  status?: ClientStatus
}

export interface CreateProjectInput {
  client_id: string
  name: string
  description?: string
  project_code?: string
  lead_id?: string
  expected_start_date?: string
  expected_end_date?: string
  show_in_client_portal?: boolean
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  status?: ProjectStatus
  health?: ProjectHealth
  actual_start_date?: string
  actual_end_date?: string
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
  owner_id?: string
  show_in_client_portal?: boolean
}

export interface UpdateSetInput extends Partial<CreateSetInput> {
  status?: SetStatus
}

export interface CreateRequirementInput {
  set_id: string
  title: string
  description?: string
  requirement_order?: number
  requirement_type?: RequirementType
  requires_document?: boolean
  requires_review?: boolean
  reviewer_id?: string
  due_date?: string
  estimated_hours?: number
  assigned_to_id?: string
  show_in_client_portal?: boolean
}

export interface UpdateRequirementInput extends Partial<CreateRequirementInput> {
  status?: RequirementStatus
  actual_hours?: number
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
