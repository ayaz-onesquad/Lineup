import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  // MM/DD/YYYY format
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  return `${month}/${day}/${year}`
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function calculateCompletionPercentage(
  completed: number,
  total: number
): number {
  if (total === 0) return 0
  return Math.round((completed / total) * 100)
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    planning: 'bg-gray-100 text-gray-800',
    active: 'bg-blue-100 text-blue-800',
    on_hold: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    not_started: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    blocked: 'bg-red-100 text-red-800',
    open: 'bg-gray-100 text-gray-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getHealthColor(health: string): string {
  const colors: Record<string, string> = {
    on_track: 'bg-green-100 text-green-800',
    at_risk: 'bg-amber-100 text-amber-800',
    delayed: 'bg-red-100 text-red-800',
  }
  return colors[health] || 'bg-gray-100 text-gray-800'
}

export function getUrgencyImportanceColor(urgency: string, importance: string): string {
  if ((urgency === 'critical' || urgency === 'high') && importance === 'high') return 'border-red-500 bg-red-50'
  if ((urgency === 'critical' || urgency === 'high') && importance !== 'high') return 'border-amber-500 bg-amber-50'
  if (urgency !== 'high' && urgency !== 'critical' && importance === 'high') return 'border-blue-500 bg-blue-50'
  return 'border-gray-300 bg-gray-50'
}

/**
 * Calculate Eisenhower Priority Score (1-6)
 * Lower number = higher priority
 *
 * Eisenhower Matrix Mapping:
 * 1 = Critical (Importance) + High (Urgency) - Crisis/Do First
 * 2 = High + High - Important & Urgent
 * 3 = High + Medium - Schedule
 * 4 = Medium + Medium - Plan
 * 5 = Medium + Low - Delegate
 * 6 = Low + Low - Eliminate/Defer
 */
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'
export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical'
export type PriorityScore = 1 | 2 | 3 | 4 | 5 | 6

export function calculateEisenhowerPriority(importance: ImportanceLevel | string, urgency: UrgencyLevel | string): PriorityScore {
  // Default to medium if null/undefined
  const imp = importance || 'medium'
  const urg = urgency || 'medium'

  // Eisenhower Matrix Priority (1-6):
  // Note: 'critical' is only valid for urgency, not importance

  // Priority 1: Critical urgency + High importance (Crisis - do immediately)
  if (urg === 'critical' && imp === 'high') return 1

  // Priority 2: High urgency + High importance (Important & Urgent)
  if (urg === 'high' && imp === 'high') return 2

  // Priority 3: Critical/High urgency + Medium importance, or Medium urgency + High importance
  if (((urg === 'critical' || urg === 'high') && imp === 'medium') ||
      (urg === 'medium' && imp === 'high')) return 3

  // Priority 4: Low urgency + High importance, or Medium + Medium
  if ((urg === 'low' && imp === 'high') ||
      (urg === 'medium' && imp === 'medium') ||
      (urg === 'critical' && imp === 'low')) return 4

  // Priority 5: High/Medium urgency + Low importance, or Low urgency + Medium importance
  if ((urg === 'high' && imp === 'low') ||
      (urg === 'medium' && imp === 'low') ||
      (urg === 'low' && imp === 'medium')) return 5

  // Priority 6: Low urgency + Low importance (Eliminate quadrant) - default fallback
  return 6
}

// Alias for backwards compatibility
export function getPriorityScore(urgency: UrgencyLevel, importance: ImportanceLevel): PriorityScore {
  return calculateEisenhowerPriority(importance, urgency)
}

export function getPriorityLabel(score: PriorityScore): string {
  const labels: Record<PriorityScore, string> = {
    1: 'Critical',
    2: 'High',
    3: 'Medium-High',
    4: 'Medium',
    5: 'Low',
    6: 'Minimal',
  }
  return labels[score]
}

export function getPriorityColor(score: PriorityScore): string {
  const colors: Record<PriorityScore, string> = {
    1: 'bg-red-600 text-white',
    2: 'bg-red-500 text-white',
    3: 'bg-orange-500 text-white',
    4: 'bg-yellow-500 text-black',
    5: 'bg-blue-400 text-white',
    6: 'bg-gray-400 text-white',
  }
  return colors[score]
}

export function getPriorityBorderColor(score: PriorityScore): string {
  const colors: Record<PriorityScore, string> = {
    1: 'border-l-red-600',
    2: 'border-l-red-500',
    3: 'border-l-orange-500',
    4: 'border-l-yellow-500',
    5: 'border-l-blue-400',
    6: 'border-l-gray-400',
  }
  return colors[score]
}

export function getUrgencyLabel(urgency: UrgencyLevel): string {
  const labels: Record<UrgencyLevel, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  }
  return labels[urgency]
}

export function getImportanceLabel(importance: ImportanceLevel): string {
  const labels: Record<ImportanceLevel, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  }
  return labels[importance]
}

// Client status options for dropdown
export const CLIENT_STATUS_OPTIONS = [
  { value: 'prospective', label: 'Prospective', description: 'Potential new client' },
  { value: 'onboarding', label: 'Onboarding', description: 'In onboarding process' },
  { value: 'active', label: 'Active', description: 'Active client' },
  { value: 'inactive', label: 'Inactive', description: 'Inactive client' },
] as const

// Industry options for dropdown - focused on agency clients
export const INDUSTRY_OPTIONS = [
  { value: 'saas', label: 'SaaS' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'education', label: 'Education' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'retail', label: 'Retail' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'media', label: 'Media & Entertainment' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'legal', label: 'Legal' },
  { value: 'non_profit', label: 'Non-Profit' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
] as const

// Contact role options for dropdown
export const CONTACT_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'executive', label: 'Executive' },
  { value: 'manager', label: 'Manager' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'technical', label: 'Technical Contact' },
  { value: 'billing', label: 'Billing Contact' },
  { value: 'other', label: 'Other' },
] as const

// Referral source options for dropdown
export const REFERRAL_SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'event', label: 'Event' },
  { value: 'partner', label: 'Partner' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'other', label: 'Other' },
] as const

// Urgency options for dropdown
export const URGENCY_OPTIONS = [
  { value: 'critical', label: 'Critical', description: 'Must be done immediately' },
  { value: 'high', label: 'High', description: 'Should be done soon' },
  { value: 'medium', label: 'Medium', description: 'Normal priority' },
  { value: 'low', label: 'Low', description: 'Can wait' },
] as const

// Importance options for dropdown (Critical is NOT an option - only for Urgency)
export const IMPORTANCE_OPTIONS = [
  { value: 'high', label: 'High', description: 'Critical for project success' },
  { value: 'medium', label: 'Medium', description: 'Important but not critical' },
  { value: 'low', label: 'Low', description: 'Nice to have' },
] as const
