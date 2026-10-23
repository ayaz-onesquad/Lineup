import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useTenantStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { FolderKanban, LogOut, Settings, User, Building2, HelpCircle, Ticket, Menu } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { authApi } from '@/services/api'
import { SubmitTicketDialog } from '@/components/shared/SubmitTicketDialog'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { MobileSidebar } from './MobileSidebar'

export function TopNav() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile, logout } = useAuthStore()
  const { currentTenant, tenants, switchTenant, clearTenant } = useTenantStore()
  const { role } = useUserRole()
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false)

  const isAdmin = role === 'org_admin' || role === 'sys_admin'

  const handleLogout = async () => {
    await authApi.signOut()
    logout()
    clearTenant()
    // SECURITY: Clear all cached data to prevent data leakage to next user
    queryClient.clear()
    navigate('/login')
  }

  const handleTenantChange = (tenantId: string) => {
    switchTenant(tenantId)
    // SECURITY: Clear all cached data when switching tenants to prevent cross-tenant data leakage
    queryClient.clear()
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        {/* Left Section - Hamburger + Logo */}
        <div className="flex items-center gap-2">
          {/* Mobile Hamburger Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 coarse:h-11 coarse:w-11">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 overflow-y-auto">
              <MobileSidebar />
            </SheetContent>
          </Sheet>

          {/* Logo & Brand */}
          <Link to="/dashboard" className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">LineUp</span>
          </Link>
        </div>

        {/* Center - Global Search */}
        <div className="hidden md:flex flex-1 justify-center max-w-md mx-4">
          <GlobalSearch />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Submit Ticket Button - Icon only on mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTicketDialogOpen(true)}
            className="sm:hidden shrink-0 coarse:h-11 coarse:w-11"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="sr-only">Support</span>
          </Button>
          {/* Submit Ticket Button - Full version on desktop */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTicketDialogOpen(true)}
            className="hidden sm:flex items-center gap-2"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Support</span>
          </Button>

          {/* Tenant Switcher */}
          {tenants.length > 1 && (
            <Select
              value={currentTenant?.id}
              onValueChange={handleTenantChange}
            >
              <SelectTrigger
                  className="h-11 w-11 justify-center px-0 md:h-10 md:w-[200px] md:justify-between md:px-3 [&>svg:last-child]:hidden md:[&>svg:last-child]:block"
                  aria-label="Switch organization"
                >
                <Building2 className="h-4 w-4 shrink-0 md:mr-2" />
                <span className="hidden md:inline min-w-0 flex-1 truncate text-left">
                  <SelectValue placeholder="Select organization" />
                </span>
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Single tenant display */}
          {tenants.length === 1 && currentTenant && (
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground min-w-0 max-w-[220px]">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{currentTenant.name}</span>
            </div>
          )}

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                  )}
                  <AvatarFallback>
                    {getInitials(
                      profile?.first_name && profile?.last_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : profile?.full_name || 'User'
                    )}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {profile?.full_name}
                  </p>
                  {currentTenant && (
                    <p className="text-xs leading-none text-muted-foreground">
                      {currentTenant.name}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/settings/team" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Manage Team</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to="/my-tickets" className="flex items-center">
                  <Ticket className="mr-2 h-4 w-4" />
                  <span>My Tickets</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Submit Ticket Dialog */}
      <SubmitTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
      />
    </header>
  )
}
