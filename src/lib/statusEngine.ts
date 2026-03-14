/**
 * Status Engine - Centralized Computed Status Utility
 *
 * This module provides a single source of truth for status calculation
 * following the 6-level priority tree. Status is READ-ONLY and computed
 * from dates and child entity states.
 *
 * Priority Tree:
 * P1 (Completed): If completed_date is set -> 'completed'
 * P2 (Parent Past Due): Else if (actual_end_date ?? expected_end_date) < TODAY -> 'past_due'
 * P3 (Child Past Due): Else if children have past due status -> 'past_due_[child]'
 * P4 (Active): Else if key_start_date <= TODAY -> 'active'
 * P5 (On-Deck): Else if key_start_date <= (TODAY + 10 days) -> 'on_deck'
 * P6 (Future): Else -> 'future'
 *
 * IMPORTANT: Uses timezone-agnostic date parsing to prevent off-by-one errors
 */

import type { ComputedStatus } from '@/types/database'

/**
 * Parse a date string in a timezone-agnostic way
 * Handles YYYY-MM-DD format by treating it as local midnight, not UTC
 * This prevents off-by-one errors when comparing dates across timezones
 */
function parseLocalDate(dateStr: string): Date {
  // If it's a date-only string (YYYY-MM-DD), parse as local time
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    d.setHours(0, 0, 0, 0)
    return d
  }
  // Otherwise use standard parsing for full timestamps
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get today's date at local midnight for comparison
 */
function getLocalToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

export interface StatusCalculationParams {
  // Completion tracking
  completedDate?: string | null

  // End dates (for own past due calculation)
  actualEndDate?: string | null
  expectedEndDate?: string | null

  // Start dates (for active/on-deck/future calculation)
  keyStartDate?: string | null
  actualStartDate?: string | null
  expectedStartDate?: string | null

  // For requirements - due date is the "end" equivalent
  keyDueDate?: string | null
  actualDueDate?: string | null
  expectedDueDate?: string | null
}

export interface ChildStatusInfo {
  type: 'phases' | 'sets' | 'pitches' | 'requirements'
  hasPastDue: boolean
}

/**
 * Calculate computed status for any entity based on dates
 * This is the centralized function used by both View and Edit modes
 *
 * @param params - Date parameters for the entity
 * @param childStatus - Optional child entity status (for parent entities)
 * @returns ComputedStatus - The calculated status
 */
export function calculateStatus(
  params: StatusCalculationParams,
  childStatus?: ChildStatusInfo
): ComputedStatus {
  const today = getLocalToday()

  // P1: Completed - if completed_date is set (takes absolute precedence)
  if (params.completedDate) {
    return 'completed'
  }

  // P2: Own Past Due - check if our end/due date has passed
  // For requirements: use due date
  // For other entities: use end date
  const effectiveEndDate =
    params.actualDueDate ||
    params.expectedDueDate ||
    params.keyDueDate ||
    params.actualEndDate ||
    params.expectedEndDate

  if (effectiveEndDate) {
    const endDate = parseLocalDate(effectiveEndDate)
    if (endDate < today) {
      return 'past_due'
    }
  }

  // P3: Child Past Due - if any child entity is past due
  if (childStatus?.hasPastDue) {
    switch (childStatus.type) {
      case 'phases':
        return 'past_due_phases'
      case 'sets':
        return 'past_due_sets'
      case 'pitches':
        return 'past_due_pitches'
      case 'requirements':
        return 'past_due_requirements'
    }
  }

  // P4, P5, P6: Calculate based on start date
  // Priority: key_start_date (computed) > actual_start_date > expected_start_date
  const effectiveStartDate =
    params.keyStartDate ||
    params.actualStartDate ||
    params.expectedStartDate

  if (effectiveStartDate) {
    const startDate = parseLocalDate(effectiveStartDate)

    // P4: Active - start date is today or in the past (TAKES PRECEDENCE over On-Deck)
    if (startDate <= today) {
      return 'active'
    }

    // P5: On-Deck - start date within 10 days from today
    const tenDaysFromNow = new Date(today)
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10)
    if (startDate <= tenDaysFromNow) {
      return 'on_deck'
    }
  }

  // P6: Future - default state (no start date set or start date > 10 days away)
  return 'future'
}

/**
 * Calculate status specifically for requirements
 * Requirements use due_date instead of end_date
 */
export function calculateRequirementStatus(params: {
  completedDate?: string | null
  actualDueDate?: string | null
  expectedDueDate?: string | null
  keyDueDate?: string | null
  actualStartDate?: string | null
  expectedStartDate?: string | null
}): ComputedStatus {
  return calculateStatus({
    completedDate: params.completedDate,
    actualDueDate: params.actualDueDate,
    expectedDueDate: params.expectedDueDate,
    keyDueDate: params.keyDueDate,
    actualStartDate: params.actualStartDate,
    expectedStartDate: params.expectedStartDate,
  })
}

/**
 * Calculate status for Set, Phase, Project entities
 * These use start_date and end_date
 */
export function calculateEntityStatus(params: {
  completedDate?: string | null
  actualEndDate?: string | null
  expectedEndDate?: string | null
  keyStartDate?: string | null
  keyEndDate?: string | null
  actualStartDate?: string | null
  expectedStartDate?: string | null
}, childStatus?: ChildStatusInfo): ComputedStatus {
  return calculateStatus({
    completedDate: params.completedDate,
    actualEndDate: params.actualEndDate,
    expectedEndDate: params.expectedEndDate,
    keyStartDate: params.keyStartDate,
    actualStartDate: params.actualStartDate,
    expectedStartDate: params.expectedStartDate,
  }, childStatus)
}

/**
 * Check if any children have past due status
 * Helper for parent entities to determine P3 status
 */
export function hasChildPastDue(children: Array<{ computed_status?: string | null }>): boolean {
  return children.some((child) => {
    if (!child.computed_status) return false
    return child.computed_status.startsWith('past_due')
  })
}

/**
 * Get the child status type from the first past due child
 */
export function getChildPastDueType(
  children: Array<{ computed_status?: string | null }>,
  childType: 'phases' | 'sets' | 'pitches' | 'requirements'
): ChildStatusInfo | undefined {
  const hasPastDue = hasChildPastDue(children)
  if (!hasPastDue) return undefined
  return { type: childType, hasPastDue: true }
}

/**
 * Format status for display
 * Converts snake_case to Title Case
 */
export function formatStatusLabel(status: ComputedStatus | string): string {
  const labels: Record<string, string> = {
    completed: 'Completed',
    past_due: 'Past Due',
    past_due_phases: 'Past Due Phases',
    past_due_sets: 'Past Due Sets',
    past_due_pitches: 'Past Due Pitches',
    past_due_requirements: 'Past Due Requirements',
    active: 'Active',
    on_deck: 'On Deck',
    future: 'Future',
  }
  return labels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Get Tailwind CSS classes for status badge
 */
export function getStatusBadgeColor(status: ComputedStatus | string): string {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    past_due: 'bg-red-500 text-white',
    past_due_phases: 'bg-red-400 text-white',
    past_due_sets: 'bg-red-400 text-white',
    past_due_pitches: 'bg-red-400 text-white',
    past_due_requirements: 'bg-red-400 text-white',
    active: 'bg-blue-100 text-blue-800',
    on_deck: 'bg-amber-100 text-amber-800',
    future: 'bg-gray-100 text-gray-600',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

/**
 * Check if a status is any variant of "past due"
 */
export function isPastDue(status: string | null | undefined): boolean {
  if (!status) return false
  return status.startsWith('past_due')
}
