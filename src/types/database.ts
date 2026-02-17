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
export type TenantStatus = 'active' | 'inactive' | 'suspended' | 'cancelled'
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
  client_id?: string // Now optional - contacts can exist independently
  display_id: number
  first_name: string
  last_name: string
  email?: string
  phone?: string
  role?: ContactRole
  relationship?: string
  // is_primary is now in client_contacts join table, NOT here
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

// Join table for many-to-many client-contact relationship
export interface ClientContact {
  id: string
  tenant_id?: string // Auto-populated from parent client via trigger
  client_id: string
  contact_id: string
  is_primary: boolean
  role?: ContactRole // Client-specific role (stored in join table, not contacts)
  created_at: string
  created_by?: string
  updated_at?: string
  updated_by?: string
}

export interface ClientContactWithRelations extends ClientContact {
  clients?: Client
  contacts?: Contact
}

export interface ContactWithCreator extends Contact {
  creator?: UserProfile
  updater?: UserProfile
  clients?: { id: string; name: string } // Single client for backwards compat
  client_contacts?: ClientContactWithRelations[] // All linked clients
  is_primary?: boolean // Comes from client_contacts join table when fetched for a specific client
}

// Client types
export type ClientStatus = 'onboarding' | 'active' | 'inactive' | 'prospective'
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
  source_lead_id?: string // Reference to lead that was converted to create this client
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
  source_lead?: Lead // Populated when fetched with relations
}

// Urgency and Importance for Eisenhower Matrix
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'
export type ImportanceLevel = 'low' | 'medium' | 'high' // Note: 'critical' is only for Urgency

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
  client_id?: string // Direct link to client (sets can exist without project)
  project_id?: string // Optional - sets can link directly to client
  phase_id?: string
  display_id: number
  name: string
  description?: string
  set_order: number
  urgency: UrgencyLevel
  importance: ImportanceLevel
  priority: number // Eisenhower Matrix priority (1-6)
  status: SetStatus
  completion_percentage: number
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  completion_date?: string
  owner_id?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  budget_days?: number
  budget_hours?: number
  show_in_client_portal: boolean
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  requirements?: Requirement[]
}

export interface SetWithRelations extends Set {
  clients?: Client // Direct client relation for client-only sets
  projects?: ProjectWithRelations
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
  client_id: string
  set_id?: string
  pitch_id?: string // Links to parent pitch (optional - requirements can exist without pitches)
  display_id: number
  title: string
  description?: string
  requirement_order: number
  requirement_type: RequirementType
  status: RequirementStatus
  urgency: UrgencyLevel
  importance: ImportanceLevel
  priority: number // Eisenhower Matrix priority (1-6)
  is_task: boolean // When true, appears in Global Tasks view
  requires_document: boolean
  requires_review: boolean
  review_status: ReviewStatus
  reviewer_id?: string
  reviewed_at?: string
  expected_start_date?: string
  expected_due_date?: string
  actual_start_date?: string
  actual_due_date?: string
  completed_date?: string
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
  pitches?: { id: string; name: string; status?: string } // Parent pitch relation
  assigned_to?: UserProfile
  lead?: UserProfile
  secondary_lead?: UserProfile
  pm?: UserProfile
  reviewer?: UserProfile
  creator?: UserProfile
  updater?: UserProfile
}

// Document types
export type EntityType = 'client' | 'project' | 'phase' | 'set' | 'requirement' | 'lead' | 'pitch'

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

export interface DocumentWithRelations extends Document {
  uploader?: UserProfile
  document_catalog?: {
    id: string
    name: string
    category: DocumentCatalogCategory
  }
}

// Discussion types
export type DiscussionVisibility = 'internal' | 'external'

export interface Discussion {
  id: string
  tenant_id: string
  entity_type?: EntityType // Now optional for global discussions
  entity_id?: string // Now optional for global discussions
  parent_discussion_id?: string
  content: string
  is_internal: boolean
  author_id: string
  created_at: string
  updated_at: string
  deleted_at?: string
  // New fields for polymorphic threaded discussions
  title?: string
  topic_type?: EntityType | 'lead'
  topic_id?: string
  visibility?: DiscussionVisibility
  root_client_id?: string
  participants?: string[]
  display_id?: number
  discussion_id_display?: string
}

export interface DiscussionWithAuthor extends Discussion {
  author?: UserProfile
  replies?: DiscussionWithAuthor[]
  reply_count?: number
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
    referral_source?: ReferralSource
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
  client_id?: string // Optional - contacts can be created independently
  first_name: string
  last_name: string
  email?: string
  phone?: string
  role?: ContactRole
  relationship?: string
  is_primary?: boolean
}

// For linking existing contacts to clients
export interface LinkContactToClientInput {
  client_id: string
  contact_id: string
  is_primary?: boolean
  role?: ContactRole
}

// For updating client-contact relationship (role, is_primary)
export interface UpdateClientContactInput {
  is_primary?: boolean
  role?: ContactRole
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
  // Enhanced phase fields
  status?: PhaseStatus
  lead_id?: string
  secondary_lead_id?: string
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  notes?: string
  is_template?: boolean
}

export interface UpdatePhaseInput extends Partial<CreatePhaseInput> {
  actual_start_date?: string
  actual_end_date?: string
}

export interface CreateSetInput {
  client_id: string // Required - sets always belong to a client
  project_id?: string // Optional - sets can exist without a project
  phase_id?: string
  name: string
  description?: string
  set_order?: number
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  expected_start_date?: string
  expected_end_date?: string
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  budget_days?: number
  budget_hours?: number
  show_in_client_portal?: boolean
}

export interface UpdateSetInput extends Partial<CreateSetInput> {
  status?: SetStatus
  actual_start_date?: string
  actual_end_date?: string
  completion_date?: string
}

export interface CreateRequirementInput {
  client_id: string
  set_id?: string
  title: string
  description?: string
  requirement_order?: number
  requirement_type?: RequirementType
  is_task?: boolean // When true, appears in Global Tasks view
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  requires_document?: boolean
  requires_review?: boolean
  reviewer_id?: string
  expected_start_date?: string
  expected_due_date?: string
  actual_due_date?: string
  completed_date?: string
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

// ============================================================================
// V2 FEATURES: Document Catalog, Pitches, Enhanced Phases, Templates, Leads
// ============================================================================

// Document Catalog types
export type DocumentCatalogCategory = 'deliverable' | 'legal' | 'internal' | 'reference'

export interface DocumentCatalog {
  id: string
  tenant_id: string
  display_id: number
  name: string
  description?: string
  category: DocumentCatalogCategory
  is_client_deliverable: boolean
  file_type_hint?: string
  is_active: boolean
  usage_count: number
  created_at: string
  created_by?: string
  updated_at: string
  updated_by?: string
  deleted_at?: string
}

export interface CreateDocumentCatalogInput {
  name: string
  description?: string
  category: DocumentCatalogCategory
  is_client_deliverable?: boolean
  file_type_hint?: string
  is_active?: boolean
}

export interface UpdateDocumentCatalogInput extends Partial<CreateDocumentCatalogInput> {}

// Enhanced Document types (updated)
export interface EnhancedDocument extends Document {
  document_catalog_id?: string
  phase_id?: string
  pitch_id?: string
  has_file?: boolean
  document_catalog?: DocumentCatalog
}

// Pitch types
export type PitchStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'on_hold'

export interface Pitch {
  id: string
  tenant_id: string
  set_id: string // Required - pitches MUST have a parent set
  display_id: number
  pitch_id_display?: string
  name: string
  description?: string
  lead_id?: string
  secondary_lead_id?: string
  order_key: number
  order_manual?: number
  predecessor_pitch_id?: string
  successor_pitch_id?: string
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  urgency: UrgencyLevel
  importance: ImportanceLevel
  priority: number
  status: PitchStatus
  completion_percentage: number
  show_in_client_portal: boolean
  is_template: boolean
  notes?: string
  created_at: string
  created_by?: string
  updated_at: string
  updated_by?: string
  deleted_at?: string
}

export interface PitchWithRelations extends Pitch {
  sets?: SetWithRelations
  lead?: UserProfile
  secondary_lead?: UserProfile
  requirements?: RequirementWithRelations[]
  creator?: UserProfile
  updater?: UserProfile
}

export interface CreatePitchInput {
  set_id: string // Required
  name: string
  description?: string
  lead_id?: string
  secondary_lead_id?: string
  order_manual?: number
  predecessor_pitch_id?: string
  successor_pitch_id?: string
  expected_start_date?: string
  expected_end_date?: string
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  show_in_client_portal?: boolean
  is_template?: boolean
  notes?: string
}

export interface UpdatePitchInput extends Partial<Omit<CreatePitchInput, 'set_id'>> {
  status?: PitchStatus
  actual_start_date?: string
  actual_end_date?: string
}

// Enhanced Phase types (with new fields)
export interface EnhancedProjectPhase extends ProjectPhase {
  phase_id_display?: string
  lead_id?: string
  secondary_lead_id?: string
  order_key?: number
  order_manual?: number
  predecessor_phase_id?: string
  successor_phase_id?: string
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  priority?: number
  notes?: string
  is_template?: boolean
  lead?: UserProfile
  secondary_lead?: UserProfile
  pitches?: Pitch[]
  // Relation populated by API select
  projects?: {
    id: string
    name: string
    client_id: string
    clients?: {
      id: string
      name: string
    }
  }
  creator?: UserProfile
  updater?: UserProfile
}

// Lead types
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '500+'

export interface Lead {
  id: string
  tenant_id: string
  display_id: number
  lead_id_display?: string
  lead_name: string
  description?: string
  status: LeadStatus
  industry?: string
  website?: string
  phone?: string
  email?: string
  company_size?: CompanySize
  estimated_value?: number
  estimated_close_date?: string
  source?: ReferralSource
  lead_owner_id?: string
  converted_to_client_id?: string
  converted_at?: string
  lost_reason?: string
  lost_reason_notes?: string
  notes?: string
  created_at: string
  created_by?: string
  updated_at: string
  updated_by?: string
  deleted_at?: string
}

export interface LeadWithRelations extends Lead {
  lead_owner?: UserProfile
  converted_to_client?: Client
  lead_contacts?: LeadContactWithRelations[]
  creator?: UserProfile
  updater?: UserProfile
}

export interface CreateLeadInput {
  lead_name: string
  description?: string
  status?: LeadStatus
  industry?: string
  website?: string
  phone?: string
  email?: string
  company_size?: CompanySize
  estimated_value?: number
  estimated_close_date?: string
  source?: ReferralSource
  lead_owner_id?: string
  notes?: string
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  lost_reason?: string
  lost_reason_notes?: string
}

// Lead Contact types
export interface LeadContact {
  id: string
  tenant_id: string
  lead_id: string
  contact_id: string
  is_primary: boolean
  is_decision_maker: boolean
  role_at_lead?: string
  notes?: string
  created_at: string
  created_by?: string
  updated_at: string
  updated_by?: string
  deleted_at?: string
}

export interface LeadContactWithRelations extends LeadContact {
  leads?: Lead
  contacts?: Contact
}

export interface LinkLeadContactInput {
  lead_id: string
  contact_id: string
  is_primary?: boolean
  is_decision_maker?: boolean
  role_at_lead?: string
  notes?: string
}

// Template-related types
export interface TemplateEntity {
  is_template: boolean
}

export interface DuplicateProjectOptions {
  new_client_id?: string
  new_name?: string
  include_children?: boolean
  clear_dates?: boolean
  clear_assignments?: boolean
  as_template?: boolean
}

export interface ConvertLeadOptions {
  client_name?: string
  relationship_manager_id?: string
  copy_contacts?: boolean
  copy_documents?: boolean
}

// ============================================================================
// V3 FEATURES: Polymorphic Notes System, My Work Dashboard
// ============================================================================

// Note types
export type NoteType = 'meeting' | 'internal' | 'client'
export type NoteParentEntityType = 'client' | 'project' | 'phase' | 'set' | 'pitch' | 'requirement' | 'lead' | 'contact'

export interface Note {
  id: string
  tenant_id: string
  display_id: number
  title: string
  description?: string
  note_type: NoteType
  parent_entity_type: NoteParentEntityType
  parent_entity_id: string
  is_pinned: boolean
  created_at: string
  created_by?: string
  updated_at: string
  updated_by?: string
  deleted_at?: string
}

export interface NoteWithAuthor extends Note {
  author?: UserProfile
}

export interface CreateNoteInput {
  parent_entity_type: NoteParentEntityType
  parent_entity_id: string
  title: string
  description?: string
  note_type?: NoteType
  is_pinned?: boolean
}

export interface UpdateNoteInput {
  title?: string
  description?: string
  note_type?: NoteType
  is_pinned?: boolean
}

// Latest note for entity (for roll-up display in tables)
export interface EntityLatestNote {
  parent_entity_type: NoteParentEntityType
  parent_entity_id: string
  note_id: string
  latest_note_title: string
  latest_note_description?: string
  latest_note_type: NoteType
  latest_note_created_at: string
  latest_note_created_by?: string
  latest_note_author_name?: string
}

// My Work KPIs
export interface MyWorkKpis {
  sets: { active: number; past_due: number }
  pitches: { active: number; past_due: number }
  tasks: { active: number; past_due: number }
  requirements: { active: number; past_due: number }
}

// Unified work item (from my_work_items view)
export type WorkItemType = 'set' | 'pitch' | 'requirement'

export interface MyWorkItem {
  item_type: WorkItemType
  id: string
  tenant_id: string
  name: string
  description?: string
  status: string
  priority: number
  expected_start_date?: string
  expected_due_date?: string
  completion_percentage: number
  lead_id?: string
  secondary_lead_id?: string
  pm_id?: string
  assigned_to_id?: string
  client_id?: string
  project_id?: string
  set_id?: string
  pitch_id?: string
  client_name?: string
  project_name?: string
  set_name?: string
  pitch_name?: string
  created_at: string
}
