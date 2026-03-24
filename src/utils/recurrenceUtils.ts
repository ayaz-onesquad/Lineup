import type { FinancialEntry, CreateFinancialOccurrenceInput } from '@/types/database'

/**
 * Given a financial entry, generate all occurrence records that fall
 * between today and horizonDate (default: 12 months from today).
 * For one-time entries, generates exactly one occurrence on start_date.
 * Returns CreateFinancialOccurrenceInput[] ready to upsert.
 */
export function generateOccurrences(
  entry: FinancialEntry,
  horizonMonths = 12
): CreateFinancialOccurrenceInput[] {
  const occurrences: CreateFinancialOccurrenceInput[] = []

  const horizon = new Date()
  horizon.setMonth(horizon.getMonth() + horizonMonths)
  horizon.setHours(23, 59, 59, 999)

  const entryEnd = entry.end_date ? new Date(entry.end_date + 'T00:00:00') : null
  const effectiveEnd = entryEnd && entryEnd < horizon ? entryEnd : horizon

  // One-time entry: single occurrence on start_date
  if (!entry.is_recurring || !entry.frequency) {
    occurrences.push({
      entry_id: entry.id,
      due_date: entry.start_date,
      amount: entry.amount,
      currency: entry.currency,
      status: 'pending',
    })
    return occurrences
  }

  // Recurring: walk forward from start_date by frequency
  let current = new Date(entry.start_date + 'T00:00:00')

  while (current <= effectiveEnd) {
    occurrences.push({
      entry_id: entry.id,
      due_date: current.toISOString().split('T')[0],
      amount: entry.amount,
      currency: entry.currency,
      status: 'pending',
    })

    // Advance by frequency
    const next = new Date(current)
    switch (entry.frequency) {
      case 'weekly':
        next.setDate(next.getDate() + 7)
        break
      case 'monthly':
        next.setMonth(next.getMonth() + 1)
        if (entry.recurrence_day) {
          // Handle end-of-month edge case
          const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
          next.setDate(Math.min(entry.recurrence_day, daysInMonth))
        }
        break
      case 'quarterly':
        next.setMonth(next.getMonth() + 3)
        if (entry.recurrence_day) {
          const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
          next.setDate(Math.min(entry.recurrence_day, daysInMonth))
        }
        break
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1)
        break
    }
    current = next
  }

  return occurrences
}

/**
 * Format a frequency + recurrence_day into a human-readable string.
 * e.g. 'monthly' + 15 → "Monthly on the 15th"
 */
export function formatFrequency(
  frequency: string | null,
  recurrenceDay: number | null
): string {
  if (!frequency) return 'One-time'

  const ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  switch (frequency) {
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return recurrenceDay ? `Monthly on the ${ordinal(recurrenceDay)}` : 'Monthly'
    case 'quarterly':
      return recurrenceDay ? `Quarterly on the ${ordinal(recurrenceDay)}` : 'Quarterly'
    case 'yearly':
      return recurrenceDay ? `Yearly on the ${ordinal(recurrenceDay)}` : 'Yearly'
    default:
      return frequency
  }
}

/**
 * Get the next occurrence date for a recurring entry
 */
export function getNextOccurrenceDate(entry: FinancialEntry): string | null {
  if (!entry.is_recurring || !entry.frequency) {
    return entry.start_date
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let current = new Date(entry.start_date + 'T00:00:00')

  // If entry has ended, return null
  if (entry.end_date) {
    const endDate = new Date(entry.end_date + 'T00:00:00')
    if (endDate < today) return null
  }

  // Find the next occurrence on or after today
  while (current < today) {
    const next = new Date(current)
    switch (entry.frequency) {
      case 'weekly':
        next.setDate(next.getDate() + 7)
        break
      case 'monthly':
        next.setMonth(next.getMonth() + 1)
        if (entry.recurrence_day) {
          const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
          next.setDate(Math.min(entry.recurrence_day, daysInMonth))
        }
        break
      case 'quarterly':
        next.setMonth(next.getMonth() + 3)
        if (entry.recurrence_day) {
          const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
          next.setDate(Math.min(entry.recurrence_day, daysInMonth))
        }
        break
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1)
        break
    }
    current = next
  }

  return current.toISOString().split('T')[0]
}

/**
 * Format currency amount with symbol
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
