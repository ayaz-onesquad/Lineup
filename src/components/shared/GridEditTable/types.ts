import type { SearchableSelectOption } from '@/components/ui/searchable-select'

export type GridColumnType = 'text' | 'select' | 'date' | 'number'

export interface GridColumn<T> {
  /** Unique identifier for this column. Defaults to key if not provided. */
  id?: string
  /** Field name on the record - supports nested keys like 'projects.name' */
  key: keyof T | string
  /** Column header label or custom React node */
  header: string | React.ReactNode
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
  /** Column width in pixels (used with table-fixed layout) */
  size?: number
  /** Whether this column can be hidden. Default: true. Set to false for ID columns. */
  enableHiding?: boolean
}

/** Context passed to row click handlers with the current sorted row IDs */
export interface RowClickContext {
  /** Array of row IDs in their current sorted order */
  sortedIds: string[]
  /** Storage key for the grid (helps identify the source) */
  source: string
}

/** State object for column visibility and order - used for persistence */
export interface ColumnState {
  visibility: Record<string, boolean>
  order: string[]
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
  /** Single-click handler (opens quick-view panel). Receives row and context with sorted IDs. */
  onRowClick?: (row: T, context: RowClickContext) => void
  /** Double-click handler (navigates to detail page). Receives row and context with sorted IDs. */
  onRowDoubleClick?: (row: T, context: RowClickContext) => void
  /** Delete handler - when provided, shows delete action in row menu */
  onDelete?: (row: T) => Promise<void>
  /** Label for delete confirmation dialog */
  deleteLabel?: string
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
  /** Enable row selection with checkboxes. Default: false */
  enableSelection?: boolean
  /** Controlled row selection state - map of row.id to boolean */
  rowSelection?: Record<string, boolean>
  /** Callback when row selection changes */
  onRowSelectionChange?: (selection: Record<string, boolean>) => void
  /** Storage key for persisting column visibility and order in localStorage */
  storageKey?: string
}
