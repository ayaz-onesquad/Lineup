import { cn } from '@/lib/utils'

export type StatusFilter = 'active' | 'closed' | 'all'

interface StatusFilterBarProps {
  value: StatusFilter
  onChange: (value: StatusFilter) => void
  counts?: { active: number; closed: number }
  className?: string
}

export function StatusFilterBar({ value, onChange, counts, className }: StatusFilterBarProps) {
  return (
    <div className={cn('flex items-center gap-1 p-1 bg-muted rounded-md w-fit', className)}>
      {(['active', 'closed', 'all'] as StatusFilter[]).map((filter) => (
        <button
          key={filter}
          onClick={() => onChange(filter)}
          className={cn(
            'px-3 py-1 text-sm rounded-sm transition-colors capitalize',
            value === filter
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {filter}
          {counts && filter !== 'all' && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({counts[filter as 'active' | 'closed']})
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
