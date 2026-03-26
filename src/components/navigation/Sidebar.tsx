import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useUIStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, NAV_GROUPS, type NavItem } from './navItems'

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, setSidebarCollapsed, openCreateModal } = useUIStore()
  const { role } = useUserRole()
  const [search, setSearch] = useState('')

  // Clear search when sidebar collapses
  useEffect(() => {
    if (sidebarCollapsed) setSearch('')
  }, [sidebarCollapsed])

  // Check if user has org_admin or sys_admin access
  const isAdmin = role === 'org_admin' || role === 'sys_admin'

  // Filter items by role and search query
  const visibleItems = NAV_ITEMS.filter((item) => {
    // Role check
    if (item.requiredRole === 'org_admin' && !isAdmin) return false
    if (item.requiredRole === 'sys_admin' && role !== 'sys_admin') return false
    // Search filter
    if (search && !item.label.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return location.pathname === item.path
    }
    return location.pathname.startsWith(item.path)
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] border-r bg-background transition-all duration-200 flex flex-col',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Quick Create Button */}
      <div className="p-3 shrink-0">
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

      <Separator className="shrink-0" />

      {/* Search Input - only shown when expanded */}
      {!sidebarCollapsed && (
        <div className="px-3 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search navigation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-muted rounded-md border-0 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Main Navigation - Scrollable container */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {!sidebarCollapsed ? (
          // EXPANDED: Group headers with items
          <div className="space-y-4">
            {NAV_GROUPS.map((group) => {
              const groupItems = visibleItems.filter((item) => item.group === group)
              if (groupItems.length === 0) return null
              return (
                <div key={group}>
                  <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </h4>
                  <div className="space-y-1">
                    {groupItems.map((item) => {
                      const active = isActive(item)
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // COLLAPSED: Icon-only, same order as expanded, same role filtering
          <div className="space-y-1">
            {visibleItems.map((item) => {
              const active = isActive(item)
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.path}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-md transition-colors mx-auto',
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
          </div>
        )}
      </nav>

      {/* Collapse Toggle - Fixed at bottom */}
      <div className="border-t p-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'w-full',
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
    </aside>
  )
}
