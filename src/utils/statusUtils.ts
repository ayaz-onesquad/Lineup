/**
 * Status Utils - Centralized Computed Status Utility for Display
 *
 * This module provides a SINGLE SOURCE OF TRUTH for status computation
 * used IDENTICALLY in both View and Edit modes. Status is READ-ONLY
 * and automatically derived from dates.
 *
 * KEY DATE COMPUTATION:
 * - Key Start Date: actual_start_date ?? expected_start_date
 * - Key End Date: actual_end_date ?? expected_end_date
 *
 * STATUS DERIVATION (in priority order):
 * P1 (Completed): completed_date is set -> 'completed'
 * P2 (Past Due): key_end_date < TODAY and NOT completed -> 'past_due'
 * P3 (Active): key_start_date <= TODAY -> 'active'
 * P4 (On-Deck): key_start_date within next 10 days -> 'on_deck'
 * P5 (Future): key_start_date > 10 days away OR no dates -> 'future'
 *
 * IMPORTANT: Uses timezone-agnostic date parsing to prevent off-by-one errors
 */

import type { ComputedStatus } from '@/types/database'

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Parse a date string in a timezone-agnostic way
 * Handles YYYY-MM-DD format by appending T00:00:00 to parse as local midnight
 * This prevents off-by-one errors when comparing dates across timezones
 *
 * @param dateStr - ISO date string (YYYY-MM-DD or full timestamp)
 * @returns Date at local midnight, or null if input is falsy
 */
function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null

  // If it's a date-only string (YYYY-MM-DD), append T00:00:00 to parse as local time
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00')
  }

  // For full timestamps, parse and normalize to start of day
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

// ============================================================================
// STATUS LABELS AND COLORS
// ============================================================================

/**
 * Human-readable labels for each computed status
 * The five canonical statuses: completed, past_due, active, on_deck, future
 */
export const STATUS_LABELS: Record<ComputedStatus | string, string> = {
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

/**
 * Tailwind CSS classes for status badge rendering
 * The five canonical statuses with consistent styling
 */
export const STATUS_COLORS: Record<ComputedStatus | string, string> = {
  completed: 'bg-green-600 text-white',
  past_due: 'bg-red-600 text-white',
  past_due_phases: 'bg-red-500 text-white',
  past_due_sets: 'bg-red-500 text-white',
  past_due_pitches: 'bg-red-500 text-white',
  past_due_requirements: 'bg-red-500 text-white',
  active: 'bg-blue-600 text-white',
  on_deck: 'bg-yellow-500 text-black',
  future: 'bg-gray-400 text-white',
}

/**
 * Get the label for a computed status
 */
export function getStatusLabel(status: ComputedStatus | string | null | undefined): string {
  if (!status) return 'Future'
  return STATUS_LABELS[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Get the Tailwind color classes for a computed status badge
 */
export function getStatusColor(status: ComputedStatus | string | null | undefined): string {
  if (!status) return STATUS_COLORS.future
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'
}

// ============================================================================
// STATUS COMPUTATION - THE SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Record type with optional date fields for status computation
 * This generic interface works for Projects, Sets, Phases, and Pitches
 */
export interface StatusRecord {
  // Completion indicator - filled when work is formally complete
  completed_date?: string | null
  completion_date?: string | null  // Sets use this field name

  // Start dates - actual takes precedence over expected
  actual_start_date?: string | null
  expected_start_date?: string | null

  // End/Due dates - actual takes precedence over expected
  actual_end_date?: string | null
  expected_end_date?: string | null

  // Legacy fields (may exist in DB records but we compute locally)
  key_start_date?: string | null
  key_end_date?: string | null
  computed_status?: ComputedStatus | string | null
}

/**
 * Requirement-specific record type (uses due dates instead of end dates)
 */
export interface RequirementStatusRecord {
  completed_date?: string | null

  // Due dates (requirement-specific)
  actual_due_date?: string | null
  expected_due_date?: string | null
  key_due_date?: string | null

  // Start dates
  actual_start_date?: string | null
  expected_start_date?: string | null

  computed_status?: ComputedStatus | string | null
}

// ============================================================================
// KEY DATE COMPUTATION
// ============================================================================

/**
 * Compute Key Start Date for a record
 * Returns the most authoritative start date: actual_start_date takes precedence
 *
 * @param record - Entity with date fields
 * @returns Date at local midnight, or null if no start date exists
 */
export function computeKeyStartDate(record: StatusRecord): Date | null {
  const raw = record.actual_start_date || record.expected_start_date
  if (!raw) return null
  return parseLocalDate(raw)
}

/**
 * Compute Key End Date for a record
 * Returns the most authoritative end/due date: actual_end_date takes precedence
 *
 * @param record - Entity with date fields
 * @returns Date at local midnight, or null if no end date exists
 */
export function computeKeyEndDate(record: StatusRecord): Date | null {
  const raw = record.actual_end_date || record.expected_end_date
  if (!raw) return null
  return parseLocalDate(raw)
}

/**
 * Compute display status for Projects, Sets, Phases, and Pitches
 *
 * Status is READ-ONLY — never written to DB, always computed from dates.
 * ON_CHANGE: called reactively in edit mode via form.watch() on all five date fields
 *
 * @param record - Entity with date fields (can be from DB or form state)
 * @returns ComputedStatus - The calculated status to display
 */
export function computeDisplayStatus(record: StatusRecord): ComputedStatus {
  const today = getLocalToday()

  // P1: Completed - completed_date is set (sole trigger, checked first)
  // Sets use completion_date, other entities use completed_date
  if (record.completed_date || record.completion_date) {
    return 'completed'
  }

  // Compute key dates from the record
  const keyEnd = computeKeyEndDate(record)
  const keyStart = computeKeyStartDate(record)

  // P2: Past Due - key_end_date has passed and NOT completed
  if (keyEnd && keyEnd < today) {
    return 'past_due'
  }

  // P3: Active - key_start_date is today or in the past
  if (keyStart && keyStart <= today) {
    return 'active'
  }

  // P4: On-Deck - key_start_date is within the next 10 days
  if (keyStart) {
    const tenDaysFromNow = new Date(today)
    tenDaysFromNow.setDate(today.getDate() + 10)
    if (keyStart <= tenDaysFromNow) {
      return 'on_deck'
    }
  }

  // P5: Future - key_start_date > 10 days away, or no dates at all
  return 'future'
}

/**
 * Compute Key Due Date for a requirement
 * Requirements use due_date fields instead of end_date
 *
 * @param record - Requirement with due date fields
 * @returns Date at local midnight, or null if no due date exists
 */
export function computeKeyDueDate(record: RequirementStatusRecord): Date | null {
  const raw = record.actual_due_date || record.expected_due_date
  if (!raw) return null
  return parseLocalDate(raw)
}

/**
 * Compute Key Start Date for a requirement
 *
 * @param record - Requirement with start date fields
 * @returns Date at local midnight, or null if no start date exists
 */
export function computeRequirementKeyStartDate(record: RequirementStatusRecord): Date | null {
  const raw = record.actual_start_date || record.expected_start_date
  if (!raw) return null
  return parseLocalDate(raw)
}

/**
 * Compute display status for Requirements
 *
 * Requirements use ISO week boundaries (Monday-Sunday) for Active/On-Deck:
 * - Active: due date falls within the current Mon-Sun week
 * - On-Deck: due date falls within the NEXT Mon-Sun week
 *
 * @param record - Requirement with date fields (can be from DB or form state)
 * @returns ComputedStatus - The calculated status to display
 */
export function computeRequirementStatus(record: RequirementStatusRecord): ComputedStatus {
  const today = getLocalToday()

  // P1: Completed - completed_date is set (checked first)
  if (record.completed_date) {
    return 'completed'
  }

  // Compute key due date
  const keyDue = computeKeyDueDate(record)

  // If no due date, default to future
  if (!keyDue) {
    return 'future'
  }

  // P2: Past Due - due date has already passed
  if (keyDue < today) {
    return 'past_due'
  }

  // Compute start of this ISO week (Monday)
  // Sunday (0) should be treated as the last day of the previous week
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const startOfThisWeek = new Date(today)
  startOfThisWeek.setDate(today.getDate() - daysFromMonday)

  // End of this week = Sunday (startOfThisWeek + 6 days)
  const endOfThisWeek = new Date(startOfThisWeek)
  endOfThisWeek.setDate(startOfThisWeek.getDate() + 6)

  // P3: Active - due date falls within the current Mon-Sun week
  if (keyDue >= today && keyDue <= endOfThisWeek) {
    return 'active'
  }

  // P4: On-Deck - due date falls within NEXT Mon-Sun week
  const startOfNextWeek = new Date(endOfThisWeek)
  startOfNextWeek.setDate(endOfThisWeek.getDate() + 1) // Monday of next week
  const endOfNextWeek = new Date(startOfNextWeek)
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6) // Sunday of next week

  if (keyDue >= startOfNextWeek && keyDue <= endOfNextWeek) {
    return 'on_deck'
  }

  // P5: Future - due date is beyond next week
  return 'future'
}

/**
 * Check if a status is any variant of "past due"
 */
export function isPastDueStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return status.startsWith('past_due')
}

/**
 * Create a record from form values for status computation
 * Use this to transform form state into a format suitable for computeDisplayStatus
 *
 * ON_CHANGE: Call this whenever form values change to get real-time status
 */
export function createStatusRecordFromForm(formValues: {
  actual_start_date?: string
  expected_start_date?: string
  actual_end_date?: string
  expected_end_date?: string
  completed_date?: string
  completion_date?: string
}): StatusRecord {
  return {
    actual_start_date: formValues.actual_start_date || null,
    expected_start_date: formValues.expected_start_date || null,
    actual_end_date: formValues.actual_end_date || null,
    expected_end_date: formValues.expected_end_date || null,
    completed_date: formValues.completed_date || null,
    completion_date: formValues.completion_date || null,
  }
}

/**
 * Create a requirement record from form values
 */
export function createRequirementRecordFromForm(formValues: {
  actual_start_date?: string
  expected_start_date?: string
  actual_due_date?: string
  expected_due_date?: string
  completed_date?: string
}): RequirementStatusRecord {
  return {
    actual_start_date: formValues.actual_start_date || null,
    expected_start_date: formValues.expected_start_date || null,
    actual_due_date: formValues.actual_due_date || null,
    expected_due_date: formValues.expected_due_date || null,
    completed_date: formValues.completed_date || null,
  }
}

// ============================================================================
// SET-SPECIFIC EXPORTS (Aliases for clarity)
// ============================================================================

/**
 * Compute display status for Sets
 *
 * Sets use `completion_date` as their completion indicator.
 * This is an alias of computeDisplayStatus for semantic clarity in Set-related code.
 *
 * ON_CHANGE: Call this whenever date fields change to get real-time status
 * AFTER_COMMIT: Query cache refresh triggers this to recompute display
 */
export const computeSetStatus = computeDisplayStatus

/**
 * Set status labels - alias for STATUS_LABELS
 */
export const SET_STATUS_LABELS = STATUS_LABELS

/**
 * Set status colors - alias for STATUS_COLORS
 */
export const SET_STATUS_COLORS = STATUS_COLORS

// ============================================================================
// CHILD-AWARE KEY DATE COMPUTATION
// ============================================================================

/**
 * Compute Key End Date for a Set, considering child pitches.
 *
 * Rule:
 *   1. If actual_end_date exists → use it (no children needed)
 *   2. Else if child pitches exist → use the LATEST computeKeyEndDate
 *      across all pitches that have a non-null key end date
 *   3. Else → use expected_end_date
 *   4. Else → null
 *
 * @param set    The set record with its own date fields
 * @param pitches The set's child pitches (pass [] if none loaded yet)
 */
export function computeSetKeyEndDate(
  set: StatusRecord,
  pitches: StatusRecord[]
): Date | null {
  // 1. Actual end date always wins
  if (set.actual_end_date) {
    return new Date(set.actual_end_date + 'T00:00:00')
  }

  // 2. Aggregate from children if available
  if (pitches.length > 0) {
    const childDates = pitches
      .map(p => computeKeyEndDate(p))
      .filter((d): d is Date => d !== null)

    if (childDates.length > 0) {
      return new Date(Math.max(...childDates.map(d => d.getTime())))
    }
  }

  // 3. Fall back to expected_end_date
  if (set.expected_end_date) {
    return new Date(set.expected_end_date + 'T00:00:00')
  }

  return null
}

/**
 * Compute Key Start Date for a Set, considering child pitches.
 *
 * Rule:
 *   1. If actual_start_date exists → use it
 *   2. Else if child pitches exist → use the EARLIEST computeKeyStartDate
 *      across all pitches that have a non-null key start date
 *   3. Else → use expected_start_date
 *   4. Else → null
 *
 * @param set    The set record with its own date fields
 * @param pitches The set's child pitches (pass [] if none loaded yet)
 */
export function computeSetKeyStartDate(
  set: StatusRecord,
  pitches: StatusRecord[]
): Date | null {
  // 1. Actual start date always wins
  if (set.actual_start_date) {
    return new Date(set.actual_start_date + 'T00:00:00')
  }

  // 2. Aggregate from children if available
  if (pitches.length > 0) {
    const childDates = pitches
      .map(p => computeKeyStartDate(p))
      .filter((d): d is Date => d !== null)

    if (childDates.length > 0) {
      return new Date(Math.min(...childDates.map(d => d.getTime())))
    }
  }

  // 3. Fall back to expected_start_date
  if (set.expected_start_date) {
    return new Date(set.expected_start_date + 'T00:00:00')
  }

  return null
}
