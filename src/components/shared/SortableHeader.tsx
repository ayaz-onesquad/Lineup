import { type Column } from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SortableHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  label: string
  className?: string
}

export function SortableHeader<TData, TValue>({
  column,
  label,
  className,
}: SortableHeaderProps<TData, TValue>) {
  const isSorted = column.getIsSorted()
  const canSort = column.getCanSort()

  if (!canSort) {
    return (
      <span className={cn('text-muted-foreground font-medium text-xs uppercase tracking-wide', className)}>
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 hover:text-foreground text-muted-foreground font-medium text-xs uppercase tracking-wide transition-colors',
        className
      )}
      onClick={() => column.toggleSorting(isSorted === 'asc')}
    >
      {label}
      {isSorted === 'asc' ? (
        <ChevronUp className="h-3 w-3" />
      ) : isSorted === 'desc' ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}
