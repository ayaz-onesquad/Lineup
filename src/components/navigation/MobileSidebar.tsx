import { Link, useLocation } from 'react-router-dom'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SheetClose, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FolderKanban, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navGroups, settingsMainItem, settingsChildItems } from './navItems'

export function MobileSidebar() {
  const location = useLocation()
  const { openCreateModal } = useUIStore()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(href)
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
      <div className="p-3">
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

      {/* Main Navigation - Grouped */}
      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h4>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <SheetClose key={item.href} asChild>
                      <Link
                        to={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <item.icon className="h-5 w-5" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </SheetClose>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom Navigation - Settings */}
      <div className="border-t p-3">
        <nav className="space-y-1">
          {/* Settings Main */}
          <SheetClose asChild>
            <Link
              to={settingsMainItem.href}
              aria-current={isActive(settingsMainItem.href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors',
                location.pathname === settingsMainItem.href
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <settingsMainItem.icon className="h-5 w-5" aria-hidden="true" />
              {settingsMainItem.label}
            </Link>
          </SheetClose>
          {/* Settings Children - indented */}
          <div className="ml-4 border-l pl-2 space-y-1">
            {settingsChildItems.map((item) => {
              const active = isActive(item.href)
              return (
                <SheetClose key={item.href} asChild>
                  <Link
                    to={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                </SheetClose>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
