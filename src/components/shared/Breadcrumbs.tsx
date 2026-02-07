import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
  /** Optional ID to display alongside the label */
  displayId?: number | string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
  /** Show home icon as first breadcrumb */
  showHome?: boolean
}

/**
 * Breadcrumbs - Navigation component showing parent hierarchy with clickable links.
 * Follows the CORE methodology hierarchy: Client > Project > Phase > Set > Requirement
 */
export function Breadcrumbs({ items, className, showHome = true }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center text-sm text-muted-foreground', className)}
    >
      <ol className="flex items-center gap-1">
        {showHome && (
          <>
            <li>
              <Link
                to="/"
                className="flex items-center hover:text-foreground transition-colors"
              >
                <Home className="h-4 w-4" />
              </Link>
            </li>
            <li>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </li>
          </>
        )}
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 mr-1" />
              )}
              {isLast || !item.href ? (
                <span className={cn(isLast && 'text-foreground font-medium')}>
                  {item.label}
                  {item.displayId && (
                    <span className="text-muted-foreground ml-1">#{item.displayId}</span>
                  )}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="hover:text-foreground transition-colors hover:underline"
                >
                  {item.label}
                  {item.displayId && (
                    <span className="text-muted-foreground ml-1">#{item.displayId}</span>
                  )}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
