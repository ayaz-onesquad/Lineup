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

export type NavGroup = 'Command Center' | 'Core' | 'Assets' | 'Management' | 'Settings'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  group: NavGroup
  requiredRole?: 'org_admin' | 'sys_admin'
  exact?: boolean
}

/**
 * Single source of truth for all navigation items.
 * Order here = order in sidebar in both expanded and collapsed modes.
 */
export const NAV_ITEMS: NavItem[] = [
  // Command Center
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'Command Center', exact: true },
  { label: 'Pipeline', path: '/leads', icon: Target, group: 'Command Center' },

  // Core - Main hierarchy entities
  { label: 'Clients', path: '/clients', icon: Users, group: 'Core' },
  { label: 'Contacts', path: '/contacts', icon: Contact, group: 'Core' },
  { label: 'Projects', path: '/projects', icon: FolderKanban, group: 'Core' },
  { label: 'Phases', path: '/phases', icon: ListOrdered, group: 'Core' },
  { label: 'Sets', path: '/sets', icon: Layers, group: 'Core' },
  { label: 'Pitches', path: '/pitches', icon: Presentation, group: 'Core' },
  { label: 'Requirements', path: '/requirements', icon: CheckSquare, group: 'Core' },

  // Assets
  { label: 'Templates', path: '/templates', icon: LayoutTemplate, group: 'Assets' },
  { label: 'Documents', path: '/documents', icon: FileText, group: 'Assets' },
  { label: 'Notes', path: '/notes', icon: StickyNote, group: 'Assets' },

  // Management - org_admin only
  { label: 'Financials', path: '/financials', icon: DollarSign, group: 'Management', requiredRole: 'org_admin' },
  { label: 'Password Manager', path: '/passwords', icon: Lock, group: 'Management', requiredRole: 'org_admin' },
  { label: 'Competitors', path: '/competitors', icon: Swords, group: 'Management', requiredRole: 'org_admin' },

  // Settings - org_admin only
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Settings', requiredRole: 'org_admin', exact: true },
  { label: 'Team', path: '/settings/team', icon: UsersRound, group: 'Settings', requiredRole: 'org_admin' },
  { label: 'Security', path: '/settings/security', icon: Shield, group: 'Settings', requiredRole: 'org_admin' },
]

/** All group names in display order */
export const NAV_GROUPS: NavGroup[] = ['Command Center', 'Core', 'Assets', 'Management', 'Settings']
