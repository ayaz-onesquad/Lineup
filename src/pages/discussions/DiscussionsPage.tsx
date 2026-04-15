import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useTenantStore } from '@/stores'
import { useAllDiscussions } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MessageSquare,
  Search,
  Clock,
  Users,
  FolderKanban,
  ListOrdered,
  Layers,
  Presentation,
  CheckSquare,
  Target,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getInitials, cn } from '@/lib/utils'
import type { EntityType } from '@/types/database'

// Entity type config for badges and icons (partial - only for discussion-supported entities)
const ENTITY_TYPE_CONFIG: Partial<Record<EntityType, { label: string; icon: React.ElementType; color: string }>> = {
  client: { label: 'Client', icon: Users, color: 'bg-blue-100 text-blue-700' },
  project: { label: 'Project', icon: FolderKanban, color: 'bg-purple-100 text-purple-700' },
  phase: { label: 'Phase', icon: ListOrdered, color: 'bg-indigo-100 text-indigo-700' },
  set: { label: 'Set', icon: Layers, color: 'bg-pink-100 text-pink-700' },
  pitch: { label: 'Pitch', icon: Presentation, color: 'bg-cyan-100 text-cyan-700' },
  requirement: { label: 'Requirement', icon: CheckSquare, color: 'bg-orange-100 text-orange-700' },
  lead: { label: 'Lead', icon: Target, color: 'bg-green-100 text-green-700' },
}

// Map entity type to URL path
const ENTITY_URL_MAP: Partial<Record<EntityType, string>> = {
  client: '/clients',
  project: '/projects',
  phase: '/phases',
  set: '/sets',
  pitch: '/pitches',
  requirement: '/requirements',
  lead: '/leads',
}

export function DiscussionsPage() {
  const navigate = useNavigate()
  const { currentTenant } = useTenantStore()

  const [search, setSearch] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | ''>('')
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'internal' | 'external'>('all')

  // Fetch all discussions using the new hook
  const { data: discussions, isLoading } = useAllDiscussions(
    currentTenant?.id,
    {
      entityType: entityTypeFilter || undefined,
      visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
    }
  )

  // Collect unique entity IDs by type for batch name resolution
  const entityIdsByType = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    discussions?.forEach(d => {
      if (!map[d.entity_type]) map[d.entity_type] = new Set()
      map[d.entity_type].add(d.entity_id)
    })
    return map
  }, [discussions])

  // Batch fetch entity names
  const { data: entityNames } = useQuery({
    queryKey: ['entity-names', Object.fromEntries(
      Object.entries(entityIdsByType).map(([k, v]) => [k, Array.from(v)])
    )],
    queryFn: async () => {
      const nameMap = new Map<string, string>()

      // Fetch clients
      if (entityIdsByType.client?.size) {
        const { data } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', Array.from(entityIdsByType.client))
        data?.forEach(c => nameMap.set(c.id, c.name))
      }

      // Fetch projects
      if (entityIdsByType.project?.size) {
        const { data } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', Array.from(entityIdsByType.project))
        data?.forEach(p => nameMap.set(p.id, p.name))
      }

      // Fetch phases
      if (entityIdsByType.phase?.size) {
        const { data } = await supabase
          .from('phases')
          .select('id, name')
          .in('id', Array.from(entityIdsByType.phase))
        data?.forEach(p => nameMap.set(p.id, p.name))
      }

      // Fetch sets
      if (entityIdsByType.set?.size) {
        const { data } = await supabase
          .from('sets')
          .select('id, name')
          .in('id', Array.from(entityIdsByType.set))
        data?.forEach(s => nameMap.set(s.id, s.name))
      }

      // Fetch pitches
      if (entityIdsByType.pitch?.size) {
        const { data } = await supabase
          .from('pitches')
          .select('id, name')
          .in('id', Array.from(entityIdsByType.pitch))
        data?.forEach(p => nameMap.set(p.id, p.name))
      }

      // Fetch requirements
      if (entityIdsByType.requirement?.size) {
        const { data } = await supabase
          .from('requirements')
          .select('id, title')
          .in('id', Array.from(entityIdsByType.requirement))
        data?.forEach(r => nameMap.set(r.id, r.title || 'Untitled'))
      }

      // Fetch leads
      if (entityIdsByType.lead?.size) {
        const { data } = await supabase
          .from('leads')
          .select('id, company_name')
          .in('id', Array.from(entityIdsByType.lead))
        data?.forEach(l => nameMap.set(l.id, l.company_name || 'Untitled'))
      }

      return nameMap
    },
    enabled: !!discussions && discussions.length > 0,
  })

  // Entity type filter options
  const entityTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'client', label: 'Client' },
    { value: 'project', label: 'Project' },
    { value: 'phase', label: 'Phase' },
    { value: 'set', label: 'Set' },
    { value: 'pitch', label: 'Pitch' },
    { value: 'requirement', label: 'Requirement' },
  ]

  // Filter discussions by search
  const filteredDiscussions = useMemo(() => {
    if (!discussions) return []
    if (!search) return discussions

    const searchLower = search.toLowerCase()
    return discussions.filter(d => {
      const entityName = entityNames?.get(d.entity_id) || ''
      return (
        d.title?.toLowerCase().includes(searchLower) ||
        d.content.toLowerCase().includes(searchLower) ||
        d.author?.full_name?.toLowerCase().includes(searchLower) ||
        entityName.toLowerCase().includes(searchLower)
      )
    })
  }, [discussions, search, entityNames])

  // Navigate to entity detail page with discussions tab
  const handleRowClick = (discussion: typeof filteredDiscussions[0]) => {
    const basePath = ENTITY_URL_MAP[discussion.entity_type as EntityType] || '/clients'
    navigate(`${basePath}/${discussion.entity_id}?tab=discussions`)
  }

  // Visibility filter options
  const visibilityOptions = [
    { value: 'all', label: 'All' },
    { value: 'internal', label: 'Internal Only' },
    { value: 'external', label: 'External Only' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Discussions</h1>
        <p className="text-sm text-muted-foreground">
          View and participate in all conversations across your workspace
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search discussions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-[180px]">
          <SearchableSelect
            options={entityTypeOptions}
            value={entityTypeFilter}
            onValueChange={(v) => setEntityTypeFilter((v || '') as EntityType | '')}
            placeholder="Entity Type"
            searchPlaceholder="Search types..."
            emptyMessage="No types found."
            clearable
          />
        </div>
        <div className="w-[150px]">
          <SearchableSelect
            options={visibilityOptions}
            value={visibilityFilter}
            onValueChange={(v) => setVisibilityFilter((v || 'all') as 'all' | 'internal' | 'external')}
            placeholder="Visibility"
            searchPlaceholder="Filter..."
            emptyMessage="No options."
          />
        </div>
      </div>

      {/* Discussions List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !filteredDiscussions?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No discussions found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start a discussion from any entity's detail page
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="min-w-[300px]">Discussion</TableHead>
                  <TableHead className="w-[100px]">Visibility</TableHead>
                  <TableHead className="w-[120px]">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDiscussions.map((discussion) => {
                  const entityType = discussion.entity_type as EntityType
                  const config = ENTITY_TYPE_CONFIG[entityType]
                  const Icon = config?.icon || MessageSquare
                  const entityName = entityNames?.get(discussion.entity_id) || discussion.entity_id.slice(0, 8)

                  return (
                    <TableRow
                      key={discussion.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(discussion)}
                    >
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn('text-xs gap-1', config?.color)}
                        >
                          <Icon className="h-3 w-3" />
                          {config?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm hover:underline">
                          {entityName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={discussion.author?.avatar_url} />
                            <AvatarFallback className="text-xs">
                              {getInitials(discussion.author?.full_name || 'U')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                              {discussion.content.slice(0, 80)}
                              {discussion.content.length > 80 && '...'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {discussion.author?.full_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={discussion.is_internal ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {discussion.is_internal ? 'Internal' : 'External'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Clock className="h-3 w-3" />
                          <span>
                            {formatDistanceToNow(new Date(discussion.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
