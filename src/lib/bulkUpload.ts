/**
 * Bulk Upload Utilities
 * Parsing, fuzzy matching, and field definitions for bulk data import
 */

import Fuse from 'fuse.js'
import * as XLSX from 'xlsx'
import type {
  UrgencyLevel,
  ImportanceLevel,
  SetStatus,
  PitchStatus,
  RequirementStatus,
  RequirementType,
  PhaseStatus
} from '@/types/database'

// ============================================================================
// TYPES
// ============================================================================

export type BulkUploadEntityType = 'sets' | 'pitches' | 'requirements' | 'phases'

export type ReferenceEntityType = 'client' | 'project' | 'phase' | 'set' | 'pitch' | 'user'

export interface FieldDefinition {
  key: string
  displayName: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'uuid'
  required: boolean
  enumOptions?: string[]
  aliases?: string[] // Alternative names for fuzzy matching
  /** For uuid fields: which entity type this references (enables display_id lookup) */
  refType?: ReferenceEntityType
}

export interface ColumnMapping {
  sourceColumn: string
  targetField: string | null // null = "Do not import"
}

export interface ValidationError {
  row: number
  column: string
  message: string
  value?: string
}

export interface ParsedData {
  headers: string[]
  rows: string[][]
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  validRows: Record<string, unknown>[]
  invalidRowIndices: number[]
}

// ============================================================================
// FIELD DEFINITIONS
// Explicitly EXCLUDES: display_id, priority, completion_percentage, created_at,
// updated_at, deleted_at, tenant_id, created_by, updated_by, all _percentage columns,
// order_key, key_start_date, key_end_date, computed_status
// ============================================================================

const URGENCY_OPTIONS: UrgencyLevel[] = ['low', 'medium', 'high', 'critical']
const IMPORTANCE_OPTIONS: ImportanceLevel[] = ['low', 'medium', 'high']
const SET_STATUS_OPTIONS: SetStatus[] = ['open', 'in_progress', 'completed', 'cancelled']
const PITCH_STATUS_OPTIONS: PitchStatus[] = ['not_started', 'in_progress', 'completed', 'blocked', 'on_hold']
const REQUIREMENT_STATUS_OPTIONS: RequirementStatus[] = ['open', 'in_progress', 'blocked', 'completed', 'cancelled']
const REQUIREMENT_TYPE_OPTIONS: RequirementType[] = ['task', 'open_item', 'technical', 'support', 'internal_deliverable', 'client_deliverable']
const PHASE_STATUS_OPTIONS: PhaseStatus[] = ['not_started', 'in_progress', 'completed', 'blocked']

export const ENTITY_FIELD_DEFINITIONS: Record<BulkUploadEntityType, FieldDefinition[]> = {
  sets: [
    { key: 'name', displayName: 'Name', type: 'string', required: true, aliases: ['set name', 'title'] },
    { key: 'description', displayName: 'Description', type: 'string', required: false, aliases: ['desc', 'details', 'notes'] },
    { key: 'client_id', displayName: 'Client ID', type: 'uuid', required: true, aliases: ['client'], refType: 'client' },
    { key: 'project_id', displayName: 'Project ID', type: 'uuid', required: false, aliases: ['project'], refType: 'project' },
    { key: 'phase_id', displayName: 'Phase ID', type: 'uuid', required: false, aliases: ['phase'], refType: 'phase' },
    { key: 'urgency', displayName: 'Urgency', type: 'enum', required: false, enumOptions: URGENCY_OPTIONS, aliases: ['urgent'] },
    { key: 'importance', displayName: 'Importance', type: 'enum', required: false, enumOptions: IMPORTANCE_OPTIONS, aliases: ['important'] },
    { key: 'status', displayName: 'Status', type: 'enum', required: false, enumOptions: SET_STATUS_OPTIONS },
    { key: 'expected_start_date', displayName: 'Expected Start Date', type: 'date', required: false, aliases: ['start date', 'start', 'begins'] },
    { key: 'expected_end_date', displayName: 'Expected End Date', type: 'date', required: false, aliases: ['end date', 'end', 'due date', 'due'] },
    { key: 'lead_id', displayName: 'Lead ID', type: 'uuid', required: false, aliases: ['lead', 'owner'], refType: 'user' },
    { key: 'secondary_lead_id', displayName: 'Secondary Lead ID', type: 'uuid', required: false, aliases: ['secondary lead', 'backup lead'], refType: 'user' },
    { key: 'pm_id', displayName: 'PM ID', type: 'uuid', required: false, aliases: ['pm', 'project manager'], refType: 'user' },
    { key: 'budget_days', displayName: 'Budget Days', type: 'number', required: false, aliases: ['days budget', 'estimated days'] },
    { key: 'budget_hours', displayName: 'Budget Hours', type: 'number', required: false, aliases: ['hours budget', 'estimated hours'] },
    { key: 'show_in_client_portal', displayName: 'Show in Client Portal', type: 'boolean', required: false, aliases: ['client visible', 'portal'] },
  ],
  pitches: [
    { key: 'name', displayName: 'Name', type: 'string', required: true, aliases: ['pitch name', 'title'] },
    { key: 'description', displayName: 'Description', type: 'string', required: false, aliases: ['desc', 'details'] },
    { key: 'set_id', displayName: 'Set ID', type: 'uuid', required: true, aliases: ['set', 'parent set'], refType: 'set' },
    { key: 'lead_id', displayName: 'Lead ID', type: 'uuid', required: false, aliases: ['lead', 'owner'], refType: 'user' },
    { key: 'secondary_lead_id', displayName: 'Secondary Lead ID', type: 'uuid', required: false, aliases: ['secondary lead'], refType: 'user' },
    { key: 'urgency', displayName: 'Urgency', type: 'enum', required: false, enumOptions: URGENCY_OPTIONS },
    { key: 'importance', displayName: 'Importance', type: 'enum', required: false, enumOptions: IMPORTANCE_OPTIONS },
    { key: 'status', displayName: 'Status', type: 'enum', required: false, enumOptions: PITCH_STATUS_OPTIONS },
    { key: 'expected_start_date', displayName: 'Expected Start Date', type: 'date', required: false, aliases: ['start date', 'start'] },
    { key: 'expected_end_date', displayName: 'Expected End Date', type: 'date', required: false, aliases: ['end date', 'end', 'due'] },
    { key: 'show_in_client_portal', displayName: 'Show in Client Portal', type: 'boolean', required: false, aliases: ['client visible'] },
    { key: 'notes', displayName: 'Notes', type: 'string', required: false },
  ],
  requirements: [
    { key: 'title', displayName: 'Title', type: 'string', required: true, aliases: ['name', 'requirement', 'task name'] },
    { key: 'description', displayName: 'Description', type: 'string', required: false, aliases: ['desc', 'details'] },
    { key: 'client_id', displayName: 'Client ID', type: 'uuid', required: true, aliases: ['client'], refType: 'client' },
    { key: 'set_id', displayName: 'Set ID', type: 'uuid', required: false, aliases: ['set'], refType: 'set' },
    { key: 'pitch_id', displayName: 'Pitch ID', type: 'uuid', required: false, aliases: ['pitch'], refType: 'pitch' },
    { key: 'requirement_type', displayName: 'Type', type: 'enum', required: false, enumOptions: REQUIREMENT_TYPE_OPTIONS, aliases: ['req type', 'requirement type'] },
    { key: 'status', displayName: 'Status', type: 'enum', required: false, enumOptions: REQUIREMENT_STATUS_OPTIONS },
    { key: 'urgency', displayName: 'Urgency', type: 'enum', required: false, enumOptions: URGENCY_OPTIONS },
    { key: 'importance', displayName: 'Importance', type: 'enum', required: false, enumOptions: IMPORTANCE_OPTIONS },
    { key: 'is_task', displayName: 'Is Task', type: 'boolean', required: false, aliases: ['task', 'show as task'] },
    { key: 'requires_document', displayName: 'Requires Document', type: 'boolean', required: false, aliases: ['needs doc', 'document required'] },
    { key: 'requires_review', displayName: 'Requires Review', type: 'boolean', required: false, aliases: ['needs review', 'review required'] },
    { key: 'reviewer_id', displayName: 'Reviewer ID', type: 'uuid', required: false, aliases: ['reviewer'], refType: 'user' },
    { key: 'expected_start_date', displayName: 'Expected Start Date', type: 'date', required: false, aliases: ['start date', 'start'] },
    { key: 'expected_due_date', displayName: 'Expected Due Date', type: 'date', required: false, aliases: ['due date', 'due', 'deadline'] },
    { key: 'estimated_hours', displayName: 'Estimated Hours', type: 'number', required: false, aliases: ['hours', 'estimate'] },
    { key: 'assigned_to_id', displayName: 'Assigned To ID', type: 'uuid', required: false, aliases: ['assigned to', 'assignee'], refType: 'user' },
    { key: 'lead_id', displayName: 'Lead ID', type: 'uuid', required: false, aliases: ['lead'], refType: 'user' },
    { key: 'secondary_lead_id', displayName: 'Secondary Lead ID', type: 'uuid', required: false, refType: 'user' },
    { key: 'pm_id', displayName: 'PM ID', type: 'uuid', required: false, aliases: ['pm'], refType: 'user' },
    { key: 'show_in_client_portal', displayName: 'Show in Client Portal', type: 'boolean', required: false },
  ],
  phases: [
    { key: 'name', displayName: 'Name', type: 'string', required: true, aliases: ['phase name', 'title'] },
    { key: 'description', displayName: 'Description', type: 'string', required: false, aliases: ['desc', 'details'] },
    { key: 'project_id', displayName: 'Project ID', type: 'uuid', required: true, aliases: ['project'], refType: 'project' },
    { key: 'owner_id', displayName: 'Owner ID', type: 'uuid', required: false, aliases: ['owner'], refType: 'user' },
    { key: 'status', displayName: 'Status', type: 'enum', required: false, enumOptions: PHASE_STATUS_OPTIONS },
    { key: 'expected_start_date', displayName: 'Expected Start Date', type: 'date', required: false, aliases: ['start date', 'start'] },
    { key: 'expected_end_date', displayName: 'Expected End Date', type: 'date', required: false, aliases: ['end date', 'end', 'due'] },
    { key: 'show_in_client_portal', displayName: 'Show in Client Portal', type: 'boolean', required: false },
  ],
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse an Excel or CSV file into headers and rows
 */
export async function parseExcelFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })

        // Get the first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to array of arrays
        const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false, // Get formatted strings
          dateNF: 'yyyy-mm-dd' // Format dates consistently
        })

        if (rawData.length === 0) {
          reject(new Error('File is empty'))
          return
        }

        // First row is headers
        const headers = (rawData[0] as string[]).map(h => String(h || '').trim())
        const rows = rawData.slice(1).map(row =>
          (row as unknown[]).map(cell => {
            if (cell === null || cell === undefined) return ''
            if (cell instanceof Date) {
              return cell.toISOString().split('T')[0]
            }
            return String(cell).trim()
          })
        )

        // Filter out empty rows
        const nonEmptyRows = rows.filter(row => row.some(cell => cell !== ''))

        resolve({ headers, rows: nonEmptyRows })
      } catch (error) {
        reject(new Error(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Parse tab-separated pasted content (from Excel/Google Sheets copy)
 */
export function parsePastedTable(text: string): ParsedData {
  const lines = text.trim().split('\n')

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  // Detect delimiter (tab is most common from spreadsheets, but also support comma)
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  // Parse all lines
  const allRows = lines.map(line => {
    // Handle quoted values for CSV
    if (delimiter === ',') {
      return parseCSVLine(line)
    }
    return line.split(delimiter).map(cell => cell.trim())
  })

  const headers = allRows[0]
  const rows = allRows.slice(1).filter(row => row.some(cell => cell !== ''))

  return { headers, rows }
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // Skip next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

interface FuseItem {
  key: string
  displayName: string
  searchTerms: string[]
}

/**
 * Fuzzy match source columns to target fields
 * Returns a mapping of source column names to target field keys
 */
export function fuzzyMatchColumns(
  sourceColumns: string[],
  targetFields: FieldDefinition[]
): Record<string, string | null> {
  // Build search items with all aliases
  const searchItems: FuseItem[] = targetFields.map(field => ({
    key: field.key,
    displayName: field.displayName,
    searchTerms: [
      field.key,
      field.displayName,
      ...(field.aliases || [])
    ].map(s => s.toLowerCase())
  }))

  const fuse = new Fuse(searchItems, {
    keys: ['searchTerms'],
    threshold: 0.4, // Lower = stricter matching
    includeScore: true,
  })

  const mappings: Record<string, string | null> = {}
  const usedTargets = new Set<string>()

  for (const sourceCol of sourceColumns) {
    const normalizedSource = sourceCol.toLowerCase().trim()

    // First try exact match
    const exactMatch = searchItems.find(item =>
      item.searchTerms.includes(normalizedSource)
    )

    if (exactMatch && !usedTargets.has(exactMatch.key)) {
      mappings[sourceCol] = exactMatch.key
      usedTargets.add(exactMatch.key)
      continue
    }

    // Fall back to fuzzy match
    const results = fuse.search(normalizedSource)

    // Find first result that hasn't been used
    for (const result of results) {
      if (!usedTargets.has(result.item.key)) {
        mappings[sourceCol] = result.item.key
        usedTargets.add(result.item.key)
        break
      }
    }

    // If no match found, set to null (do not import)
    if (!(sourceCol in mappings)) {
      mappings[sourceCol] = null
    }
  }

  return mappings
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a single value against its field definition
 */
function validateValue(
  value: string,
  field: FieldDefinition,
  rowIndex: number,
  columnName: string
): ValidationError | null {
  // Check required
  if (field.required && (!value || value.trim() === '')) {
    return {
      row: rowIndex,
      column: columnName,
      message: `${field.displayName} is required`,
    }
  }

  // Skip validation for empty optional fields
  if (!value || value.trim() === '') {
    return null
  }

  const trimmedValue = value.trim()

  switch (field.type) {
    case 'number': {
      const num = Number(trimmedValue)
      if (isNaN(num)) {
        return {
          row: rowIndex,
          column: columnName,
          message: `${field.displayName} must be a number`,
          value: trimmedValue,
        }
      }
      break
    }

    case 'boolean': {
      const lower = trimmedValue.toLowerCase()
      if (!['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'].includes(lower)) {
        return {
          row: rowIndex,
          column: columnName,
          message: `${field.displayName} must be true/false or yes/no`,
          value: trimmedValue,
        }
      }
      break
    }

    case 'date': {
      // Accept various date formats
      const dateRegex = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{1,2}-\d{1,2}-\d{2,4}$/
      if (!dateRegex.test(trimmedValue)) {
        // Try parsing as a date
        const parsed = new Date(trimmedValue)
        if (isNaN(parsed.getTime())) {
          return {
            row: rowIndex,
            column: columnName,
            message: `${field.displayName} must be a valid date (YYYY-MM-DD)`,
            value: trimmedValue,
          }
        }
      }
      break
    }

    case 'enum': {
      if (field.enumOptions && !field.enumOptions.includes(trimmedValue.toLowerCase())) {
        return {
          row: rowIndex,
          column: columnName,
          message: `${field.displayName} must be one of: ${field.enumOptions.join(', ')}`,
          value: trimmedValue,
        }
      }
      break
    }

    case 'uuid': {
      // Basic UUID format check
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      // If it's already a valid UUID, accept it
      if (uuidRegex.test(trimmedValue)) {
        break
      }
      // For reference fields, also accept display_id (number) or name (string)
      // These will be resolved to UUIDs during the resolution phase
      if (field.refType) {
        // Accept numeric display_id or text name - resolution happens later
        // We just validate it's not empty (already checked above)
        break
      }
      // Non-reference UUID field must be a valid UUID
      return {
        row: rowIndex,
        column: columnName,
        message: `${field.displayName} must be a valid UUID`,
        value: trimmedValue,
      }
    }
  }

  return null
}

/**
 * Convert a raw value to its proper type
 */
function convertValue(value: string, field: FieldDefinition): unknown {
  if (!value || value.trim() === '') {
    return undefined
  }

  const trimmedValue = value.trim()

  switch (field.type) {
    case 'number':
      return Number(trimmedValue)

    case 'boolean': {
      const lower = trimmedValue.toLowerCase()
      return ['true', 'yes', '1', 'y'].includes(lower)
    }

    case 'date': {
      // Try to normalize to YYYY-MM-DD
      const parsed = new Date(trimmedValue)
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
      }
      return trimmedValue
    }

    case 'enum':
      return trimmedValue.toLowerCase()

    default:
      return trimmedValue
  }
}

/**
 * Validate all rows against field definitions and column mappings
 */
export function validateData(
  parsedData: ParsedData,
  mappings: Record<string, string | null>,
  entityType: BulkUploadEntityType
): ValidationResult {
  const fieldDefs = ENTITY_FIELD_DEFINITIONS[entityType]
  const fieldMap = new Map(fieldDefs.map(f => [f.key, f]))

  const errors: ValidationError[] = []
  const validRows: Record<string, unknown>[] = []
  const invalidRowIndices: number[] = []

  // Check that all required fields are mapped
  const mappedFields = new Set(Object.values(mappings).filter(Boolean))
  for (const field of fieldDefs) {
    if (field.required && !mappedFields.has(field.key)) {
      errors.push({
        row: 0,
        column: field.displayName,
        message: `Required field "${field.displayName}" is not mapped to any column`,
      })
    }
  }

  // Validate each row
  parsedData.rows.forEach((row, rowIndex) => {
    const rowData: Record<string, unknown> = {}
    let hasError = false

    // Process each mapped column
    parsedData.headers.forEach((header, colIndex) => {
      const targetField = mappings[header]

      if (!targetField) {
        return // Skip unmapped columns
      }

      const fieldDef = fieldMap.get(targetField)
      if (!fieldDef) {
        return
      }

      const value = row[colIndex] || ''

      // Validate
      const error = validateValue(value, fieldDef, rowIndex + 1, header)
      if (error) {
        errors.push(error)
        hasError = true
      } else {
        // Convert to proper type
        const convertedValue = convertValue(value, fieldDef)
        if (convertedValue !== undefined) {
          rowData[targetField] = convertedValue
        }
      }
    })

    if (hasError) {
      invalidRowIndices.push(rowIndex)
    } else if (Object.keys(rowData).length > 0) {
      validRows.push(rowData)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    validRows,
    invalidRowIndices,
  }
}

// ============================================================================
// REFERENCE RESOLUTION
// ============================================================================

export interface ReferenceResolutionResult {
  resolvedRows: Record<string, unknown>[]
  errors: Array<{ row: number; field: string; value: string; message: string }>
}

/**
 * Resolve display_ids and names to UUIDs for reference fields
 * This should be called after validation, before import
 */
export async function resolveReferences(
  validRows: Record<string, unknown>[],
  entityType: BulkUploadEntityType,
  tenantId: string,
  supabase: { from: (table: string) => unknown }
): Promise<ReferenceResolutionResult> {
  const fieldDefs = ENTITY_FIELD_DEFINITIONS[entityType]
  const refFields = fieldDefs.filter(f => f.type === 'uuid' && f.refType)

  if (refFields.length === 0) {
    return { resolvedRows: validRows, errors: [] }
  }

  // Build lookup caches for each reference type
  const lookupCaches: Record<ReferenceEntityType, Map<string, string>> = {
    client: new Map(),
    project: new Map(),
    phase: new Map(),
    set: new Map(),
    pitch: new Map(),
    user: new Map(),
  }

  // Collect all unique values that need resolution
  const valuesToResolve: Record<ReferenceEntityType, Set<string>> = {
    client: new Set(),
    project: new Set(),
    phase: new Set(),
    set: new Set(),
    pitch: new Set(),
    user: new Set(),
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Scan all rows for values that need resolution
  for (const row of validRows) {
    for (const field of refFields) {
      const value = row[field.key]
      if (value && typeof value === 'string' && !uuidRegex.test(value)) {
        valuesToResolve[field.refType!].add(value)
      }
    }
  }

  // Fetch lookups from database
  const tableMap: Record<ReferenceEntityType, { table: string; nameCol: string }> = {
    client: { table: 'clients', nameCol: 'name' },
    project: { table: 'projects', nameCol: 'name' },
    phase: { table: 'project_phases', nameCol: 'name' },
    set: { table: 'sets', nameCol: 'name' },
    pitch: { table: 'pitches', nameCol: 'name' },
    user: { table: 'user_profiles', nameCol: 'full_name' },
  }

  for (const [refType, values] of Object.entries(valuesToResolve)) {
    if (values.size === 0) continue

    const { table, nameCol } = tableMap[refType as ReferenceEntityType]
    const valuesArray = Array.from(values)

    // Separate numeric display_ids from text names
    const numericValues = valuesArray.filter(v => /^\d+$/.test(v)).map(Number)
    const textValues = valuesArray.filter(v => !/^\d+$/.test(v))

    // Query for display_id matches
    if (numericValues.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase as any).from(table)
        .select('id, display_id')
        .eq('tenant_id', tenantId)
        .in('display_id', numericValues)
        .is('deleted_at', null)

      const { data } = await query
      if (data) {
        for (const record of data as Array<{ id: string; display_id: number }>) {
          lookupCaches[refType as ReferenceEntityType].set(String(record.display_id), record.id)
        }
      }
    }

    // Query for name matches
    if (textValues.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase as any).from(table)
        .select(`id, ${nameCol}`)
        .eq('tenant_id', tenantId)
        .in(nameCol, textValues)
        .is('deleted_at', null)

      const { data } = await query
      if (data) {
        for (const record of data as Array<{ id: string; [key: string]: unknown }>) {
          const name = record[nameCol] as string
          lookupCaches[refType as ReferenceEntityType].set(name, record.id)
        }
      }
    }
  }

  // Resolve references in each row
  const resolvedRows: Record<string, unknown>[] = []
  const errors: Array<{ row: number; field: string; value: string; message: string }> = []

  validRows.forEach((row, rowIndex) => {
    const resolvedRow = { ...row }
    let hasError = false

    for (const field of refFields) {
      const value = row[field.key]
      if (!value || typeof value !== 'string') continue

      // If already a UUID, keep it
      if (uuidRegex.test(value)) continue

      // Look up the resolved UUID
      const cache = lookupCaches[field.refType!]
      const resolvedId = cache.get(value)

      if (resolvedId) {
        resolvedRow[field.key] = resolvedId
      } else {
        hasError = true
        errors.push({
          row: rowIndex + 1,
          field: field.displayName,
          value,
          message: `Could not find ${field.refType} with display_id or name "${value}"`,
        })
      }
    }

    if (!hasError) {
      resolvedRows.push(resolvedRow)
    }
  })

  return { resolvedRows, errors }
}

// ============================================================================
// ERROR REPORT GENERATION
// ============================================================================

/**
 * Generate a CSV error report for failed rows
 */
export function generateErrorReport(
  parsedData: ParsedData,
  errors: ValidationError[]
): string {
  // Group errors by row
  const errorsByRow = new Map<number, string[]>()
  for (const error of errors) {
    if (!errorsByRow.has(error.row)) {
      errorsByRow.set(error.row, [])
    }
    errorsByRow.get(error.row)!.push(error.message)
  }

  // Build CSV
  const headers = [...parsedData.headers, 'Errors']
  const lines: string[] = [headers.map(h => `"${h}"`).join(',')]

  errorsByRow.forEach((rowErrors, rowIndex) => {
    if (rowIndex === 0) {
      // Row 0 errors are mapping errors, skip in detail report
      return
    }

    const row = parsedData.rows[rowIndex - 1] || []
    const errorMessage = rowErrors.join('; ')
    const csvRow = [
      ...row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`),
      `"${errorMessage.replace(/"/g, '""')}"`
    ]
    lines.push(csvRow.join(','))
  })

  return lines.join('\n')
}

/**
 * Download a string as a file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_ROWS = 500

export const ENTITY_DISPLAY_NAMES: Record<BulkUploadEntityType, string> = {
  sets: 'Sets',
  pitches: 'Pitches',
  requirements: 'Requirements',
  phases: 'Phases',
}
