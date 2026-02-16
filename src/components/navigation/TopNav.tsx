import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore, useTenantStore } from '@/stores'
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
import { FolderKanban, LogOut, Settings, User, Building2, HelpCircle, Ticket } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { authApi } from '@/services/api'
import { SubmitTicketDialog } from '@/components/shared/SubmitTicketDialog'

export function TopNav() {
  const navigate = useNavigate()
  const { profile, logout } = useAuthStore()
  const { currentTenant, tenants, switchTenant, clearTenant } = useTenantStore()
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false)

  const handleLogout = async () => {
    await authApi.signOut()
    logout()
    clearTenant()
    navigate('/login')
  }

  const handleTenantChange = (tenantId: string) => {
    switchTenant(tenantId)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        {/* Logo & Brand */}
        <Link to="/dashboard" className="flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">LineUp</span>
        </Link>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          {/* Submit Ticket Button */}
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
              <SelectTrigger className="w-[200px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select organization" />
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {currentTenant.name}
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
                    {getInitials(profile?.full_name || 'User')}
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
              <DropdownMenuItem asChild>
                <Link to="/settings/team" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
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
