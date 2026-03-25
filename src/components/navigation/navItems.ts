import {
  LayoutDashboard,
  Users,
  Contact,
  FolderKanban,
  Layers,
  CheckSquare,
  Settings,
  Target,
  LayoutTemplate,
  Presentation,
  FileText,
  StickyNote,
  ListOrdered,
  Shield,
  UsersRound,
  Lock,
  DollarSign,
  Swords,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// Command Center - Dashboard and Pipeline
export const commandCenterItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Pipeline', icon: Target },
]

// Core - Main hierarchy entities
export const coreItems: NavItem[] = [
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/contacts', label: 'Contacts', icon: Contact },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/phases', label: 'Phases', icon: ListOrdered },
  { href: '/sets', label: 'Sets', icon: Layers },
  { href: '/pitches', label: 'Pitches', icon: Presentation },
  { href: '/requirements', label: 'Requirements', icon: CheckSquare },
]

// Assets - Templates, Documents, Notes
export const assetItems: NavItem[] = [
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/notes', label: 'Notes', icon: StickyNote },
]

// Settings - Main settings item
export const settingsMainItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings }

// Settings - Child items (grouped inside collapsible)
export const settingsChildItems: NavItem[] = [
  { href: '/settings/team', label: 'Team', icon: UsersRound },
  { href: '/settings/security', label: 'Security', icon: Shield },
]

// Password Manager - org_admin only (filtered in Sidebar)
export const passwordManagerItem: NavItem = { href: '/passwords', label: 'Password Manager', icon: Lock }

// Financial Manager - org_admin only (filtered in Sidebar)
export const financialManagerItem: NavItem = { href: '/financials', label: 'Financials', icon: DollarSign }

// Competitor Tracker - org_admin only (filtered in Sidebar)
export const competitorTrackerItem: NavItem = { href: '/competitors', label: 'Competitors', icon: Swords }

// Settings - All items (legacy - for backwards compatibility)
export const settingsItems: NavItem[] = [
  settingsMainItem,
  ...settingsChildItems,
]

// Grouped navigation
export const navGroups: NavGroup[] = [
  { label: 'Command Center', items: commandCenterItems },
  { label: 'Core', items: coreItems },
  { label: 'Assets', items: assetItems },
]

// Bottom nav (Settings - moved to separate section)
export const bottomNavItems: NavItem[] = settingsItems

// Legacy flat lists for backwards compatibility
export const mainNavItems: NavItem[] = [
  ...commandCenterItems,
  ...coreItems,
  ...assetItems,
]
