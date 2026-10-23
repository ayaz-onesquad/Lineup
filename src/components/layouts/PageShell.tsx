import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/**
 * Standard page wrapper. See docs/DESIGN-SYSTEM.md section 2.2.
 *
 * Replaces the `page-carbon p-6` pattern, which left a 24px gutter on a 390px
 * phone (12% of the width) and still allowed the content to overflow sideways.
 *
 * Responsive gutters are applied once by `MainLayout`, so this component does
 * NOT add horizontal padding. Double-padding a page is the most common mistake
 * when adopting it.
 *
 * What this guarantees:
 *   - `overflow-x-clip`, so a wide child cannot make the whole page scroll
 *     sideways. A table's own scroll container still scrolls, because that is
 *     an explicitly scrollable region rather than page overflow.
 *   - A title block that stacks on a phone and goes side-by-side from `sm`,
 *     with the primary action full width below `sm` so it stays reachable.
 *   - A capped content width, so a 7-column grid does not stretch across a
 *     2560px display.
 */
interface PageShellProps {
  title: string
  description?: string
  /** Icon shown beside the title. */
  icon?: LucideIcon
  /**
   * Primary action(s) for the page. Rendered full width below `sm` and inline
   * from `sm`, per section 5.3.
   */
  actions?: ReactNode
  /** Breadcrumbs, rendered above the title. */
  breadcrumbs?: ReactNode
  /** Banners and alerts, rendered between the header and the content. */
  banner?: ReactNode
  children: ReactNode
  className?: string
  /**
   * Cap the content width on very wide displays. Default true. Set false for
   * views that genuinely benefit from the full viewport, such as a 16-column
   * operational grid.
   */
  constrainWidth?: boolean
}

export function PageShell({
  title,
  description,
  icon: Icon,
  actions,
  breadcrumbs,
  banner,
  children,
  className,
  constrainWidth = true,
}: PageShellProps) {
  return (
    <div
      className={cn(
        // overflow-x-clip rather than hidden: clip does not create a scroll
        // container, so it cannot trap a sticky descendant.
        'w-full overflow-x-clip',
        className
      )}
    >
      <div className={cn('space-y-6', constrainWidth && 'mx-auto max-w-content')}>
        {breadcrumbs}

        <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <Icon className="mt-0.5 h-7 w-7 shrink-0 text-muted-foreground sm:h-8 sm:w-8" />
            )}
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold tracking-tight md:text-3xl">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>

          {actions && (
            // Full width on a phone so the primary action is a comfortable
            // target. From `md` it sits beside the title and wraps (the whole
            // group drops below the title when it does not fit) instead of
            // overflowing: a page with a view switcher plus two buttons is
            // wider than the content area of a tablet.
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:max-w-full md:justify-end">
              {actions}
            </div>
          )}
        </header>

        {banner}

        {children}
      </div>
    </div>
  )
}

/**
 * A section inside a page: an optional heading plus content.
 * Keeps vertical rhythm consistent without every page inventing its own.
 */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
