import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTenantStore } from '@/stores'
import { supabase } from '@/services/supabase'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Search,
  Users,
  FolderKanban,
  Layers,
  CheckSquare,
  Presentation,
  Target,
  Contact,
  ListOrdered,
  FileText,
  AtSign,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatusColor } from '@/lib/utils'

// Table definitions for @ command
const SEARCHABLE_TABLES: { key: string; label: string; icon: LucideIcon; path: string }[] = [
  { key: 'clients', label: 'Clients', icon: Users, path: '/clients' },
  { key: 'contacts', label: 'Contacts', icon: Contact, path: '/contacts' },
  { key: 'projects', label: 'Projects', icon: FolderKanban, path: '/projects' },
  { key: 'phases', label: 'Phases', icon: ListOrdered, path: '/phases' },
  { key: 'sets', label: 'Sets', icon: Layers, path: '/sets' },
  { key: 'pitches', label: 'Pitches', icon: Presentation, path: '/pitches' },
  { key: 'requirements', label: 'Requirements', icon: CheckSquare, path: '/requirements' },
  { key: 'leads', label: 'Leads', icon: Target, path: '/leads' },
  { key: 'documents', label: 'Documents', icon: FileText, path: '/documents' },
]

interface SearchResult {
  id: string
  type: string
  name: string
  subtitle?: string
  status?: string
  display_id?: number
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const { currentTenant } = useTenantStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scopedTable, setScopedTable] = useState<string | null>(null)
  const [showTableSelector, setShowTableSelector] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse @ command from query
  const parseQuery = (input: string) => {
    if (input.startsWith('@')) {
      const spaceIndex = input.indexOf(' ')
      if (spaceIndex === -1) {
        // Still typing table name
        return { tableFilter: input.slice(1).toLowerCase(), searchText: '' }
      } else {
        // Table selected, now searching
        const tableName = input.slice(1, spaceIndex).toLowerCase()
        const table = SEARCHABLE_TABLES.find(t =>
          t.key.toLowerCase().startsWith(tableName) ||
          t.label.toLowerCase().startsWith(tableName)
        )
        return {
          selectedTable: table?.key,
          searchText: input.slice(spaceIndex + 1).trim()
        }
      }
    }
    return { searchText: input.trim() }
  }

  const { tableFilter, selectedTable, searchText } = useMemo(() => parseQuery(query), [query])

  // Global search query
  const { data: results, isLoading } = useQuery({
    queryKey: ['global-search', currentTenant?.id, selectedTable || scopedTable, searchText],
    queryFn: async () => {
      if (!currentTenant?.id || searchText.length < 2) return []

      const searchResults: SearchResult[] = []
      const tablesToSearch = selectedTable || scopedTable
        ? [selectedTable || scopedTable]
        : SEARCHABLE_TABLES.map(t => t.key)

      for (const table of tablesToSearch) {
        if (!table) continue

        try {
          let queryBuilder

          // Different tables have different name columns
          if (table === 'requirements') {
            queryBuilder = supabase
              .from(table)
              .select('id, title, status, display_id')
              .eq('tenant_id', currentTenant.id)
              .is('deleted_at', null)
              .ilike('title', `%${searchText}%`)
              .limit(5)
          } else if (table === 'contacts') {
            queryBuilder = supabase
              .from(table)
              .select('id, first_name, last_name, email, company')
              .eq('tenant_id', currentTenant.id)
              .is('deleted_at', null)
              .or(`first_name.ilike.%${searchText}%,last_name.ilike.%${searchText}%,email.ilike.%${searchText}%`)
              .limit(5)
          } else {
            queryBuilder = supabase
              .from(table)
              .select('id, name, status, display_id')
              .eq('tenant_id', currentTenant.id)
              .is('deleted_at', null)
              .ilike('name', `%${searchText}%`)
              .limit(5)
          }

          const { data, error } = await queryBuilder

          if (!error && data) {
            data.forEach((item: Record<string, unknown>) => {
              let name = ''
              let subtitle = ''

              if (table === 'contacts') {
                name = `${item.first_name || ''} ${item.last_name || ''}`.trim()
                subtitle = (item.email as string) || (item.company as string) || ''
              } else if (table === 'requirements') {
                name = (item.title as string) || 'Untitled'
              } else {
                name = (item.name as string) || 'Untitled'
              }

              searchResults.push({
                id: item.id as string,
                type: table,
                name,
                subtitle,
                status: item.status as string | undefined,
                display_id: item.display_id as number | undefined,
              })
            })
          }
        } catch {
          console.error(`Error searching ${table}`)
        }
      }

      return searchResults
    },
    enabled: !!currentTenant?.id && searchText.length >= 2,
    staleTime: 30000,
  })

  // Handle keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQuery('')
      setScopedTable(null)
      setShowTableSelector(false)
    }
  }, [open])

  // Show table selector when @ is typed
  useEffect(() => {
    if (query === '@' || (query.startsWith('@') && !query.includes(' '))) {
      setShowTableSelector(true)
    } else {
      setShowTableSelector(false)
    }
  }, [query])

  const handleSelectResult = (result: SearchResult) => {
    const table = SEARCHABLE_TABLES.find(t => t.key === result.type)
    if (table) {
      navigate(`${table.path}/${result.id}`)
      setOpen(false)
    }
  }

  const handleSelectTable = (table: typeof SEARCHABLE_TABLES[0]) => {
    setQuery(`@${table.key} `)
    setScopedTable(table.key)
    setShowTableSelector(false)
    inputRef.current?.focus()
  }

  const filteredTables = tableFilter
    ? SEARCHABLE_TABLES.filter(t =>
        t.key.toLowerCase().startsWith(tableFilter) ||
        t.label.toLowerCase().startsWith(tableFilter)
      )
    : SEARCHABLE_TABLES

  const getTableIcon = (type: string) => {
    const table = SEARCHABLE_TABLES.find(t => t.key === type)
    return table?.icon || FileText
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/50',
            'text-sm text-muted-foreground hover:bg-muted transition-colors',
            'w-64 justify-between'
          )}
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span>Search...</span>
          </div>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start" sideOffset={8}>
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or type @ to filter by table..."
            className="flex h-11 w-full border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
          {(selectedTable || scopedTable) && (
            <Badge variant="secondary" className="ml-2 shrink-0">
              @{selectedTable || scopedTable}
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[300px]">
          <div className="p-2">
            {/* Table selector when @ is typed */}
            {showTableSelector && (
              <div>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Search in...</p>
                <div className="space-y-1">
                  {filteredTables.map((table) => (
                    <button
                      key={table.key}
                      onClick={() => handleSelectTable(table)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-left"
                    >
                      <AtSign className="h-3 w-3 text-muted-foreground" />
                      <table.icon className="h-4 w-4" />
                      <span>{table.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search results */}
            {!showTableSelector && searchText.length >= 2 && (
              <>
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Searching...
                  </div>
                ) : results && results.length > 0 ? (
                  <div>
                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Results</p>
                    <div className="space-y-1">
                      {results.map((result) => {
                        const Icon = getTableIcon(result.type)
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => handleSelectResult(result)}
                            className="flex items-center gap-3 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-left"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium">{result.name}</span>
                                {result.display_id && (
                                  <span className="text-xs text-muted-foreground">
                                    #{result.display_id}
                                  </span>
                                )}
                              </div>
                              {result.subtitle && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {result.status && (
                                <Badge variant="outline" className={cn('text-xs', getStatusColor(result.status))}>
                                  {result.status.replace(/_/g, ' ')}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs capitalize">
                                {result.type}
                              </Badge>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No results found.
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {!showTableSelector && searchText.length < 2 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <p>Type to search across all tables</p>
                <p className="mt-1 text-xs">
                  Use <kbd className="rounded border px-1">@table</kbd> to search specific tables
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
