/**
 * ColumnMapper
 * Maps source columns to target entity fields with fuzzy match suggestions
 */

import { ArrowRight, Ban } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Badge } from '@/components/ui/badge'
import {
  ENTITY_FIELD_DEFINITIONS,
  type BulkUploadEntityType,
  type FieldDefinition,
} from '@/lib/bulkUpload'

interface ColumnMapperProps {
  sourceColumns: string[]
  entityType: BulkUploadEntityType
  mappings: Record<string, string | null>
  onChange: (mappings: Record<string, string | null>) => void
}

export function ColumnMapper({
  sourceColumns,
  entityType,
  mappings,
  onChange,
}: ColumnMapperProps) {
  const targetFields = ENTITY_FIELD_DEFINITIONS[entityType]

  // Build options for the dropdown
  const getOptions = (currentSourceColumn: string) => {
    // Find which fields are already mapped (excluding the current column)
    const usedFields = new Set(
      Object.entries(mappings)
        .filter(([src]) => src !== currentSourceColumn)
        .map((entry) => entry[1])
        .filter(Boolean)
    )

    const options = [
      {
        value: '__skip__',
        label: 'Do not import',
        description: 'Skip this column',
      },
      ...targetFields
        .filter((field) => !usedFields.has(field.key))
        .map((field) => ({
          value: field.key,
          label: field.displayName,
          description: getFieldDescription(field),
        })),
    ]

    return options
  }

  const handleMappingChange = (sourceColumn: string, value: string | undefined) => {
    const newMappings = { ...mappings }
    newMappings[sourceColumn] = value === '__skip__' || !value ? null : value
    onChange(newMappings)
  }

  // Get field by key
  const getField = (key: string | null): FieldDefinition | undefined => {
    if (!key) return undefined
    return targetFields.find((f) => f.key === key)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-center px-2 text-sm font-medium text-muted-foreground">
        <div>Source Column</div>
        <div></div>
        <div>Maps To</div>
      </div>

      <div className="space-y-2">
        {sourceColumns.map((sourceCol) => {
          const targetKey = mappings[sourceCol]
          const field = getField(targetKey)
          const isSkipped = targetKey === null

          return (
            <div
              key={sourceCol}
              className="grid grid-cols-[1fr,auto,1fr] gap-3 items-center p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              {/* Source column name */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate font-medium" title={sourceCol}>
                  {sourceCol}
                </span>
              </div>

              {/* Arrow */}
              <div className="flex-shrink-0">
                {isSkipped ? (
                  <Ban className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {/* Target field dropdown */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    options={getOptions(sourceCol)}
                    value={isSkipped ? '__skip__' : targetKey || undefined}
                    onValueChange={(value) => handleMappingChange(sourceCol, value)}
                    placeholder="Select field..."
                    searchPlaceholder="Search fields..."
                    emptyMessage="No matching fields"
                    clearable
                  />
                </div>
                {field?.required && (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                    Required
                  </Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground pt-2">
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
            Required
          </Badge>
          <span>Must be mapped</span>
        </div>
        <div className="flex items-center gap-1">
          <Ban className="h-3 w-3" />
          <span>Column will be skipped</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Generate a description for a field based on its type and options
 */
function getFieldDescription(field: FieldDefinition): string {
  const parts: string[] = []

  switch (field.type) {
    case 'enum':
      parts.push(`Options: ${field.enumOptions?.join(', ')}`)
      break
    case 'date':
      parts.push('Format: YYYY-MM-DD')
      break
    case 'boolean':
      parts.push('Values: true/false, yes/no')
      break
    case 'number':
      parts.push('Numeric value')
      break
    case 'uuid':
      if (field.refType) {
        parts.push(`Enter display ID (e.g. "12") or name`)
      } else {
        parts.push('UUID reference')
      }
      break
  }

  if (field.required) {
    parts.push('Required')
  }

  return parts.join(' | ')
}
