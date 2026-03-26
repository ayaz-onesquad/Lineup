import { Link, useLocation } from 'react-router-dom'
import { useUIStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SheetClose, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FolderKanban, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, NAV_GROUPS, type NavItem } from './navItems'

export function MobileSidebar() {
  const location = useLocation()
  const { openCreateModal } = useUIStore()
  const { role } = useUserRole()

  // Check if user has org_admin or sys_admin access
  const isAdmin = role === 'org_admin' || role === 'sys_admin'

  // Filter items by role
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.requiredRole === 'org_admin' && !isAdmin) return false
    if (item.requiredRole === 'sys_admin' && role !== 'sys_admin') return false
    return true
  })

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return location.pathname === item.path
    }
    return location.pathname.startsWith(item.path)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with logo */}
      <SheetHeader className="border-b px-4 py-4">
        <SheetTitle className="flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">LineUp</span>
        </SheetTitle>
      </SheetHeader>

      {/* Quick Create Button */}
      <div className="p-3 shrink-0">
        <SheetClose asChild>
          <Button
            className="w-full justify-start gap-2"
            onClick={() => openCreateModal('requirement')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Quick Create
          </Button>
        </SheetClose>
      </div>

      <Separator />

      {/* Main Navigation - Scrollable container */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
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
                      <SheetClose key={item.path} asChild>
                        <Link
                          to={item.path}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </SheetClose>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
