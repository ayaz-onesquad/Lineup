import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface TruncatedCellProps {
  value: string | null | undefined
  maxLines?: number
}

/**
 * A text cell for grids.
 *
 * From `md` up (table rows) long text is clamped to `maxLines` with an
 * ellipsis and the full value is in a hover tooltip.
 *
 * Below `md` (mobile cards) there is no hover, so a tooltip would make the
 * rest of the value unreachable. The full text is shown and wraps instead,
 * and unbroken strings such as emails and URLs break anywhere, so the value
 * can never spill out of its card. Text must never overflow its section.
 */
export function TruncatedCell({ value, maxLines = 2 }: TruncatedCellProps) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'block min-w-0 text-sm cursor-default break-words [overflow-wrap:anywhere]',
            maxLines === 1 ? 'md:truncate' : 'md:line-clamp-2',
            maxLines > 2 && 'md:line-clamp-3'
          )}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm text-sm whitespace-pre-wrap break-words">
        {value}
      </TooltipContent>
    </Tooltip>
  )
}
