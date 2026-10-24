import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'

export type StatTone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning'

const TONES: Record<StatTone, { chip: string; value: string; glow: string }> = {
  neutral: { chip: 'bg-muted text-muted-foreground', value: 'text-foreground', glow: 'from-muted/60' },
  primary: { chip: 'bg-primary/10 text-primary', value: 'text-foreground', glow: 'from-primary/10' },
  success: { chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', value: 'text-emerald-600 dark:text-emerald-400', glow: 'from-emerald-500/10' },
  danger: { chip: 'bg-red-500/10 text-red-600 dark:text-red-400', value: 'text-red-600 dark:text-red-400', glow: 'from-red-500/10' },
  warning: { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', value: 'text-amber-600 dark:text-amber-400', glow: 'from-amber-500/10' },
}

interface StatTileProps {
  label: string
  /** Numeric value; animated with a count-up. */
  value: number
  /** Formats the (animating) number, e.g. currency or percent. */
  format: (value: number) => string
  icon: LucideIcon
  tone?: StatTone
  /** One short supporting line under the value: "4 open deals". */
  detail?: ReactNode
  /** Optional visual under the detail: a progress bar, a stage strip. */
  children?: ReactNode
  /** Position in a row, for the staggered entrance. */
  index?: number
  isLoading?: boolean
  onClick?: () => void
}

/**
 * Compact KPI tile for page headers and dashboards.
 *
 * Sized to sit two-up on a phone and four-up on desktop without dominating
 * the page: the number is the hero, the label and detail stay small. Values
 * count up and tiles fade in with a short stagger; both are disabled for
 * users who prefer reduced motion. Long values wrap rather than overflow.
 */
export function StatTile({
  label,
  value,
  format,
  icon: Icon,
  tone = 'neutral',
  detail,
  children,
  index = 0,
  isLoading,
  onClick,
}: StatTileProps) {
  const animated = useCountUp(isLoading ? 0 : value)
  const styles = TONES[tone]
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative min-w-0 overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm md:p-4',
        'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none',
        'transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none',
        onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* Soft tone wash in the corner; decorative. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br to-transparent opacity-80 blur-2xl',
          styles.glow
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-muted-foreground md:text-sm">{label}</span>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8', styles.chip)}>
          <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
        </span>
      </div>

      {isLoading ? (
        <div className="relative mt-2 h-7 w-24 animate-pulse rounded bg-muted md:h-8" />
      ) : (
        <p
          className={cn(
            'relative mt-1 text-xl font-bold tabular-nums tracking-tight md:text-2xl',
            styles.value
          )}
        >
          {format(animated)}
        </p>
      )}

      {detail && <p className="relative mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      {children && <div className="relative mt-2">{children}</div>}
    </Component>
  )
}
