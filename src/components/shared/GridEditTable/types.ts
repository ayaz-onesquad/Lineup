import type { SearchableSelectOption } from '@/components/ui/searchable-select'

export type GridColumnType = 'text' | 'select' | 'date' | 'number'

export interface GridColumn<T> {
  /** Field name on the record - supports nested keys like 'projects.name' */
  key: keyof T | string
  /** Column header label */
  header: string
  /** Whether this field is editable in Grid Edit mode. Default: false */
  editable?: boolean
  /** Input type for editable cells. Required when editable: true */
  type?: GridColumnType
  /** Options for select-type columns */
  options?: SearchableSelectOption[]
  /** Custom read-only renderer for non-editable display */
  render?: (row: T) => React.ReactNode
  /** Custom getter for the cell value (useful for nested/computed values) */
  getValue?: (row: T) => string | number | undefined
  /** Optional Tailwind width class or CSS width string */
  width?: string
}

export interface GridEditTableProps<T extends { id: string }> {
  /** Column definitions */
  columns: GridColumn<T>[]
  /** Data array */
  data: T[]
  /** Loading state */
  isLoading?: boolean
  /** Handler called with dirty rows when user clicks Save All */
  onSave: (dirtyRows: Map<string, Partial<T>>) => Promise<void>
  /** Single-click handler (opens quick-view panel) */
  onRowClick?: (row: T) => void
  /** Double-click handler (navigates to detail page) */
  onRowDoubleClick?: (row: T) => void
  /** Message shown when data is empty */
  emptyMessage?: string
  /** Icon shown in empty state */
  emptyIcon?: React.ReactNode
  /** Action button shown in empty state */
  emptyAction?: React.ReactNode
  /** Optional children rendered in toolbar area (e.g., filters) */
  children?: React.ReactNode
  /** Whether to show the Grid Edit toggle button. Default: true */
  showGridEditToggle?: boolean
  /** Optional additional toolbar actions (rendered before Grid Edit toggle) */
  toolbarActions?: React.ReactNode
}
