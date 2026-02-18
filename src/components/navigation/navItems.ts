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
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const mainNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Pipeline', icon: Target },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/contacts', label: 'Contacts', icon: Contact },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/phases', label: 'Phases', icon: ListOrdered },
  { href: '/sets', label: 'All Sets', icon: Layers },
  { href: '/pitches', label: 'Pitches', icon: Presentation },
  { href: '/requirements', label: 'Requirements', icon: CheckSquare },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/notes', label: 'Notes', icon: StickyNote },
]

export const bottomNavItems: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
]
