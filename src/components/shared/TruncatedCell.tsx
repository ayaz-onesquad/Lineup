import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TruncatedCellProps {
  value: string | null | undefined
  maxLines?: number
}

/**
 * A cell that truncates long text with ellipsis and shows full text on hover tooltip.
 * - Single line: uses text-overflow: ellipsis
 * - Multiple lines: uses webkit line clamp
 */
export function TruncatedCell({ value, maxLines = 2 }: TruncatedCellProps) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>
  }

  const style = maxLines === 1
    ? {
        overflow: 'hidden' as const,
        textOverflow: 'ellipsis' as const,
        whiteSpace: 'nowrap' as const,
      }
    : {
        display: '-webkit-box' as const,
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden' as const,
      }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block text-sm cursor-default" style={style}>
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm text-sm whitespace-pre-wrap">
        {value}
      </TooltipContent>
    </Tooltip>
  )
}
