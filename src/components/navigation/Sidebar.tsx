import { Link, useLocation } from 'react-router-dom'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mainNavItems, bottomNavItems } from './navItems'

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, setSidebarCollapsed, openCreateModal } = useUIStore()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] border-r bg-background transition-all duration-200',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Quick Create Button */}
        <div className="p-3">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="w-full"
                  onClick={() => openCreateModal('requirement')}
                  aria-label="Quick Create"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Quick Create</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              className="w-full justify-start gap-2"
              onClick={() => openCreateModal('requirement')}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Quick Create
            </Button>
          )}
        </div>

        <Separator />

        {/* Main Navigation */}
        <ScrollArea className="flex-1 px-3 py-2">
          <nav className="space-y-1">
            {mainNavItems.map((item) => {
              const active = isActive(item.href)
              return sidebarCollapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.href}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Bottom Navigation */}
        <div className="border-t p-3">
          <nav className="space-y-1">
            {bottomNavItems.map((item) => {
              const active = isActive(item.href)
              return sidebarCollapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.href}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Collapse Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'mt-2 w-full',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-start'
            )}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  )
}
