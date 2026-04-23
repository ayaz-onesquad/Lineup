import { useState } from 'react'
import {
  type ColumnDef,
  type SortingState,
  type Column,
  type Row,
  type Table as TanStackTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { MobileColumnMeta } from '@/types/table'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
  className?: string
  /** Initial sorting state */
  initialSorting?: SortingState
}

/**
 * Extract human-readable label from column definition
 */
function getColumnLabel<TData>(column: Column<TData, unknown>): string {
  const meta = column.columnDef.meta as MobileColumnMeta | undefined
  if (meta?.mobileLabel) return meta.mobileLabel
  const header = column.columnDef.header
  if (typeof header === 'string') return header
  return column.id
}

/**
 * Mobile card view component for stacked card layout
 */
function MobileCardView<TData>({
  table,
  onRowClick,
  onRowDoubleClick,
}: {
  table: TanStackTable<TData>
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
}) {
  const rows = table.getRowModel().rows

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-center text-muted-foreground">
        No results.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        // Group columns by priority
        const primaryCols: Array<{ column: Column<TData, unknown>; cell: any }> = []
        const secondaryCols: Array<{ column: Column<TData, unknown>; cell: any }> = []
        const tertiaryCols: Array<{ column: Column<TData, unknown>; cell: any }> = []

        row.getVisibleCells().forEach((cell) => {
          const meta = cell.column.columnDef.meta as MobileColumnMeta | undefined

          // Skip columns marked hideOnMobile
          if (meta?.hideOnMobile) return

          const colData = { column: cell.column, cell }

          switch (meta?.priority) {
            case 'primary':
              primaryCols.push(colData)
              break
            case 'secondary':
              secondaryCols.push(colData)
              break
            case 'tertiary':
              tertiaryCols.push(colData)
              break
            default:
              // No priority specified - treat as tertiary
              tertiaryCols.push(colData)
          }
        })

        return (
          <div
            key={row.id}
            className={cn(
              'rounded-lg border bg-card p-4 shadow-sm min-h-[44px]',
              (onRowClick || onRowDoubleClick) && 'cursor-pointer active:bg-muted/50',
              row.getIsSelected() && 'ring-2 ring-primary'
            )}
            onClick={() => onRowClick?.(row.original)}
            onDoubleClick={() => onRowDoubleClick?.(row.original)}
          >
            {/* Primary field(s) as header */}
            {primaryCols.length > 0 && (
              <div className="mb-2">
                {primaryCols.map(({ column, cell }) => (
                  <div key={cell.id} className="text-lg font-semibold">
                    {flexRender(column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            )}

            {/* Secondary fields as labeled key-value pairs */}
            {secondaryCols.length > 0 && (
              <div className="space-y-1 mb-2">
                {secondaryCols.map(({ column, cell }) => (
                  <div key={cell.id} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground font-medium min-w-[100px]">
                      {getColumnLabel(column)}:
                    </span>
                    <span className="flex-1">
                      {flexRender(column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Tertiary fields as labeled key-value pairs */}
            {tertiaryCols.length > 0 && (
              <div className="space-y-1 text-sm">
                {tertiaryCols.map(({ column, cell }) => (
                  <div key={cell.id} className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[100px]">
                      {getColumnLabel(column)}:
                    </span>
                    <span className="flex-1">
                      {flexRender(column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  onRowDoubleClick,
  className,
  initialSorting = [],
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const isMobile = useMediaQuery('(max-width: 768px)')

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  // Render mobile card view on small screens
  if (isMobile) {
    return (
      <div className={cn('p-4', className)}>
        <MobileCardView
          table={table}
          onRowClick={onRowClick}
          onRowDoubleClick={onRowDoubleClick}
        />
      </div>
    )
  }

  // Render standard table on desktop
  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={cn(
                  (onRowClick || onRowDoubleClick) && 'cursor-pointer hover:bg-muted/50'
                )}
                onClick={() => onRowClick?.(row.original)}
                onDoubleClick={() => onRowDoubleClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
