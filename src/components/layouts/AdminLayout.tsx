import { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  Building2,
  Bell,
  FileText,
  Activity,
  LifeBuoy,
  Users,
  LogOut,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Menu,
} from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'
import { authApi } from '@/services/api'
import { TopNav } from '@/components/navigation/TopNav'

// Local storage key for sidebar collapsed state
const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed'

// Nav item types
interface NavItemBase {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
}

interface NavItemWithChildren extends Omit<NavItemBase, 'href'> {
  href?: string
  children: NavItemBase[]
}

type NavItemType = NavItemBase | NavItemWithChildren

function hasChildren(item: NavItemType): item is NavItemWithChildren {
  return 'children' in item && Array.isArray(item.children)
}

// Admin nav items with collapsible Notifications group
const navItems: NavItemType[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
  {
    label: 'Notifications',
    icon: Bell,
    children: [
      { href: '/admin/notifications', label: 'Templates', icon: FileText },
      { href: '/admin/notifications/log', label: 'Send Log', icon: Activity },
    ],
  },
  { href: '/admin/support', label: 'Support Tickets', icon: LifeBuoy },
  { href: '/admin/users', label: 'Users', icon: Users, disabled: true },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, logout } = useAuthStore()

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    return stored === 'true'
  })

  // Notifications group expanded state
  const [notificationsExpanded, setNotificationsExpanded] = useState(() => {
    return location.pathname.startsWith('/admin/notifications')
  })

  // Update localStorage when sidebar state changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Auto-expand notifications group when navigating to notification routes
  useEffect(() => {
    if (location.pathname.startsWith('/admin/notifications')) {
      setNotificationsExpanded(true)
    }
  }, [location.pathname])

  // Handle responsive collapse below 1024px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true)
      }
    }

    // Check on mount
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleLogout = async () => {
    await authApi.signOut()
    logout()
    navigate('/login')
  }

  const isActive = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(href)
  }

  const isGroupActive = (item: NavItemWithChildren) => {
    return item.children.some((child) => isActive(child.href))
  }

  // Render a single nav item (not a group)
  const renderNavItem = (item: NavItemBase, isChild = false) => {
    const active = isActive(item.href)
    const Icon = item.icon

    if (sidebarCollapsed && !isChild) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>
            <Link
              to={item.disabled ? '#' : item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              aria-disabled={item.disabled}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-md transition-colors mx-auto',
                active
                  ? 'bg-[#0f62fe] text-white'
                  : item.disabled
                  ? 'text-[#525252] cursor-not-allowed'
                  : 'text-[#c6c6c6] hover:bg-[#262626]'
              )}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
            {item.disabled && ' (Coming Soon)'}
          </TooltipContent>
        </Tooltip>
      )
    }

    return (
      <Link
        key={item.href}
        to={item.disabled ? '#' : item.href}
        aria-current={active ? 'page' : undefined}
        aria-disabled={item.disabled}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isChild && 'pl-10',
          active
            ? 'bg-[#0f62fe] text-white'
            : item.disabled
            ? 'text-[#525252] cursor-not-allowed'
            : 'text-[#c6c6c6] hover:bg-[#262626]'
        )}
        onClick={(e) => item.disabled && e.preventDefault()}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        {item.disabled && (
          <span className="ml-auto text-xs text-[#525252]">Soon</span>
        )}
      </Link>
    )
  }

  // Render a collapsible nav group
  const renderNavGroup = (item: NavItemWithChildren) => {
    const active = isGroupActive(item)
    const Icon = item.icon

    if (sidebarCollapsed) {
      // In collapsed mode, show icon with dropdown on hover
      return (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-md transition-colors mx-auto',
                active
                  ? 'bg-[#0f62fe] text-white'
                  : 'text-[#c6c6c6] hover:bg-[#262626]'
              )}
              onClick={() => {
                // Navigate to first child
                const firstChild = item.children[0]
                if (firstChild) {
                  navigate(firstChild.href)
                }
              }}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="p-0">
            <div className="bg-[#262626] rounded-md py-1 min-w-[160px]">
              <p className="px-3 py-1.5 text-xs font-semibold text-[#8d8d8d] uppercase">
                {item.label}
              </p>
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  to={child.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                    isActive(child.href)
                      ? 'bg-[#0f62fe] text-white'
                      : 'text-[#c6c6c6] hover:bg-[#393939]'
                  )}
                >
                  <child.icon className="h-4 w-4" aria-hidden="true" />
                  {child.label}
                </Link>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )
    }

    return (
      <div key={item.label}>
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            active ? 'text-white' : 'text-[#c6c6c6] hover:bg-[#262626]'
          )}
          onClick={() => setNotificationsExpanded(!notificationsExpanded)}
          aria-expanded={notificationsExpanded}
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate flex-1 text-left">{item.label}</span>
          {notificationsExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </button>
        {notificationsExpanded && (
          <div className="mt-1 space-y-1">
            {item.children.map((child) => renderNavItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar - flex-based, not fixed, z-10 to stay below TopNav */}
      <aside
        className={cn(
          'flex-shrink-0 h-full flex flex-col transition-all duration-200 z-10',
          'bg-[#161616]',
          sidebarCollapsed ? 'w-12' : 'w-60'
        )}
      >
        {/* Logo / Header Area */}
        <div className={cn(
          'flex items-center shrink-0 border-b border-[#262626]',
          sidebarCollapsed ? 'h-14 justify-center px-2' : 'h-14 px-4'
        )}>
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex h-8 w-8 items-center justify-center rounded text-[#c6c6c6] hover:bg-[#262626]"
                  aria-label="Expand sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0f62fe]">
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <div>
                <span className="font-semibold text-white">LineUp</span>
                <p className="text-xs text-[#8d8d8d]">System Admin</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <div className="space-y-1">
            {navItems.map((item) =>
              hasChildren(item) ? renderNavGroup(item) : renderNavItem(item)
            )}
          </div>
        </nav>

        {/* Bottom Section */}
        <div className="shrink-0 border-t border-[#262626] p-2">
          {/* Back to App Link */}
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/dashboard"
                  className="flex h-10 w-8 items-center justify-center rounded-md text-[#c6c6c6] hover:bg-[#262626] mx-auto"
                  aria-label="Back to App"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Back to App</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#c6c6c6] hover:bg-[#262626] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to App</span>
            </Link>
          )}

          {/* User Info & Logout */}
          {sidebarCollapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-10 w-8 items-center justify-center rounded-md hover:bg-[#262626] mx-auto mt-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-[#0f62fe] text-white text-xs">
                      {getInitials(profile?.full_name || 'Admin')}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <div className="flex items-center gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{profile?.full_name}</p>
                    <p className="text-xs text-muted-foreground">System Administrator</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="mt-2 px-1">
              <div className="flex items-center gap-3 rounded-md px-2 py-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#0f62fe] text-white text-xs">
                    {getInitials(profile?.full_name || 'Admin')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {profile?.full_name}
                  </p>
                  <p className="text-xs text-[#8d8d8d] truncate">
                    {user?.email || 'admin@lineup.app'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#c6c6c6] hover:text-white hover:bg-[#262626]"
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>

              {/* Collapse button */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 justify-start text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#262626]"
                onClick={() => setSidebarCollapsed(true)}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Collapse
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Right Zone - TopNav + Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* TopNav - contains Support Ticket button */}
        <TopNav />

        {/* Main Content - mt-16 accounts for fixed TopNav height (h-16) */}
        <main className="flex-1 overflow-y-auto bg-[#f4f4f4] p-6 md:p-8 mt-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
