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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navGroups, settingsChildItems } from './navItems'

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, setSidebarCollapsed, settingsExpanded, setSettingsExpanded, openCreateModal } = useUIStore()

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

        {/* Main Navigation - Grouped */}
        <ScrollArea className="flex-1 px-3 py-2">
          <nav className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                {/* Group Label - only show when expanded */}
                {!sidebarCollapsed && (
                  <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h4>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
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
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Bottom Navigation - Collapsible Settings */}
        <div className="border-t p-3">
          {sidebarCollapsed ? (
            /* Collapsed sidebar - show icons only */
            <nav className="space-y-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/settings"
                    aria-label="Settings"
                    aria-current={isActive('/settings') ? 'page' : undefined}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                      isActive('/settings')
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    )}
                  >
                    <Settings className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
              {settingsChildItems.map((item) => {
                const active = isActive(item.href)
                return (
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
                )
              })}
            </nav>
          ) : (
            /* Expanded sidebar - collapsible settings group */
            <Collapsible open={settingsExpanded} onOpenChange={setSettingsExpanded}>
              <div className="flex items-center gap-1">
                {/* Settings Header - Clickable to navigate */}
                <Link
                  to="/settings"
                  aria-current={location.pathname === '/settings' ? 'page' : undefined}
                  className={cn(
                    'flex-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    location.pathname === '/settings'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <Settings className="h-5 w-5" aria-hidden="true" />
                  Settings
                </Link>
                {/* Collapse/Expand Toggle */}
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={settingsExpanded ? 'Collapse settings' : 'Expand settings'}
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        settingsExpanded ? '' : '-rotate-90'
                      )}
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-1 mt-1 ml-4 border-l pl-2">
                {settingsChildItems.map((item) => {
                  const active = isActive(item.href)
                  return (
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
              </CollapsibleContent>
            </Collapsible>
          )}

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
