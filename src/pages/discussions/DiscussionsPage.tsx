import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAllDiscussions, useDataGridFilters, type FilterConfig } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DiscussionView } from '@/components/shared/DiscussionView'
import { FilterBar, NewDiscussionDialog } from '@/components/shared'
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
  Clock,
  Users,
  FolderKanban,
  ListOrdered,
  Layers,
  Presentation,
  CheckSquare,
  Target,
  MessageCircle,
  CheckCircle2,
  Lock,
  Plus,
  Filter,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getInitials, cn } from '@/lib/utils'
import type { EntityType, DiscussionStatus } from '@/types/database'

// Entity type config for badges and icons
const ENTITY_TYPE_CONFIG: Partial<
  Record<EntityType, { label: string; icon: React.ElementType; color: string }>
> = {
  client: { label: 'Client', icon: Users, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  project: { label: 'Project', icon: FolderKanban, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  phase: { label: 'Phase', icon: ListOrdered, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  set: { label: 'Set', icon: Layers, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  pitch: { label: 'Pitch', icon: Presentation, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  requirement: { label: 'Requirement', icon: CheckSquare, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  lead: { label: 'Lead', icon: Target, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
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
  const [statusFilter, setStatusFilter] = useState<DiscussionStatus | 'all'>('open')
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null)
  const [showNewDiscussion, setShowNewDiscussion] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Filter configuration for discussions
  const filterConfig: FilterConfig = useMemo(() => ({
    search: true,
    parentFilters: [
      {
        key: 'entity_type',
        label: 'Entity Type',
        options: [
          { value: 'client', label: 'Client' },
          { value: 'project', label: 'Project' },
          { value: 'phase', label: 'Phase' },
          { value: 'set', label: 'Set' },
          { value: 'pitch', label: 'Pitch' },
          { value: 'requirement', label: 'Requirement' },
          { value: 'lead', label: 'Lead' },
        ],
      },
    ],
  }), [])

  const {
    filters,
    setSearch,
    setStatuses,
    setParent,
    setDateFrom,
    setDateTo,
    clearAll,
    hasActiveFilters,
    activeFilterCount,
  } = useDataGridFilters(filterConfig)

  // Fetch all discussions using the fixed hook (no arguments needed)
  const { data: allDiscussions, isLoading } = useAllDiscussions()

  // Filter discussions by status
  const discussions = useMemo(() => {
    if (!allDiscussions) return []
    if (statusFilter === 'all') return allDiscussions
    return allDiscussions.filter(d => d.status === statusFilter)
  }, [allDiscussions, statusFilter])

  // Collect unique entity IDs by type for batch name resolution
  const entityIdsByType = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    discussions?.forEach(d => {
      if (d.entity_type) {
        if (!map[d.entity_type]) map[d.entity_type] = new Set()
        map[d.entity_type].add(d.entity_id!)
      }
    })
    return map
  }, [discussions])

  // Batch fetch entity names
  const { data: entityNames } = useQuery({
    queryKey: [
      'entity-names',
      Object.fromEntries(
        Object.entries(entityIdsByType).map(([k, v]) => [k, Array.from(v)])
      ),
    ],
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
          .from('project_phases')
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
          .select('id, lead_name')
          .in('id', Array.from(entityIdsByType.lead))
        data?.forEach(l => nameMap.set(l.id, l.lead_name || 'Untitled'))
      }

      return nameMap
    },
    enabled: !!discussions && discussions.length > 0,
  })

  // Filter discussions by search and entity type
  const filteredDiscussions = useMemo(() => {
    if (!discussions) return []

    return discussions.filter(d => {
      // Entity type filter
      const entityTypeValues = filters.parents['entity_type'] ?? []
      if (entityTypeValues.length > 0 && !entityTypeValues.includes(d.entity_type ?? '')) {
        return false
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const entityName = entityNames?.get(d.entity_id!) || ''
        const subject = d.subject || d.title || ''
        return (
          subject.toLowerCase().includes(searchLower) ||
          d.content.toLowerCase().includes(searchLower) ||
          d.author?.full_name?.toLowerCase().includes(searchLower) ||
          entityName.toLowerCase().includes(searchLower)
        )
      }

      return true
    })
  }, [discussions, filters, entityNames])

  // Count by status for tab badges
  const statusCounts = useMemo(() => {
    if (!allDiscussions) return { open: 0, closed: 0 }
    return {
      open: allDiscussions.filter(d => d.status !== 'closed').length,
      closed: allDiscussions.filter(d => d.status === 'closed').length,
    }
  }, [allDiscussions])

  // Handle row click - open discussion view
  const handleRowClick = (discussionId: string) => {
    setSelectedDiscussionId(discussionId)
  }

  // Get parent record for the selected discussion
  const selectedDiscussion = useMemo(() => {
    return filteredDiscussions?.find(d => d.id === selectedDiscussionId)
  }, [filteredDiscussions, selectedDiscussionId])

  const selectedParentRecord = useMemo(() => {
    if (!selectedDiscussion?.entity_type || !selectedDiscussion?.entity_id) return undefined
    const entityType = selectedDiscussion.entity_type as EntityType
    const basePath = ENTITY_URL_MAP[entityType] || '/clients'
    const entityName = entityNames?.get(selectedDiscussion.entity_id) || selectedDiscussion.entity_id.slice(0, 8)
    return {
      entityType: entityType,
      entityId: selectedDiscussion.entity_id,
      entityName: entityName,
      entityPath: `${basePath}/${selectedDiscussion.entity_id}`,
    }
  }, [selectedDiscussion, entityNames])

  // Handle double-click - navigate to entity
  const handleRowDoubleClick = (discussion: (typeof filteredDiscussions)[0]) => {
    if (!discussion.entity_type || !discussion.entity_id) return
    const basePath = ENTITY_URL_MAP[discussion.entity_type as EntityType] || '/clients'
    navigate(`${basePath}/${discussion.entity_id}?tab=discussions`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Discussions
          </h1>
          <p className="text-sm text-muted-foreground">
            View and participate in all conversations across your workspace
          </p>
        </div>
        <Button onClick={() => setShowNewDiscussion(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Discussion
        </Button>
      </div>

      {/* Status Tabs */}
      <Tabs
        value={statusFilter}
        onValueChange={v => setStatusFilter(v as DiscussionStatus | 'all')}
      >
        <TabsList>
          <TabsTrigger value="open">
            Active
            {statusCounts.open > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {statusCounts.open}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="closed">
            Closed
            {statusCounts.closed > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {statusCounts.closed}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Toolbar Row */}
      <div className="flex items-center gap-2">
        {/* Result count - only when filters active */}
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground">
            {filteredDiscussions.length} of {allDiscussions?.length ?? 0}
          </span>
        )}

        {/* Push button to the right */}
        <div className="ml-auto flex items-center gap-2">
          {/* Filter toggle button */}
          <Button
            variant={filtersOpen || hasActiveFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen(v => !v)}
            className="gap-1.5"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="h-4 px-1 text-xs ml-0.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Collapsible FilterBar */}
      <FilterBar
        config={filterConfig}
        filters={filters}
        onSearch={setSearch}
        onStatuses={setStatuses}
        onParent={setParent}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        onClearAll={clearAll}
        hasActiveFilters={hasActiveFilters}
        resultCount={filteredDiscussions.length}
        totalCount={allDiscussions?.length ?? 0}
        collapsed={!filtersOpen}
      />

      {/* Discussions List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
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
                  <TableHead className="w-[180px]">Entity</TableHead>
                  <TableHead className="min-w-[300px]">Discussion</TableHead>
                  <TableHead className="w-[80px]">Replies</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[120px]">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDiscussions.map(discussion => {
                  const entityType = discussion.entity_type as EntityType
                  const config = ENTITY_TYPE_CONFIG[entityType]
                  const Icon = config?.icon || MessageSquare
                  const entityName =
                    entityNames?.get(discussion.entity_id!) ||
                    discussion.entity_id?.slice(0, 8) ||
                    'Unknown'
                  const subject =
                    discussion.subject ||
                    discussion.title ||
                    discussion.content.slice(0, 60)
                  const isClosed = discussion.status === 'closed'

                  return (
                    <TableRow
                      key={discussion.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(discussion.id)}
                      onDoubleClick={() => handleRowDoubleClick(discussion)}
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
                        <span className="font-medium text-sm">{entityName}</span>
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
                            <p
                              className={cn(
                                'text-sm font-medium truncate max-w-[300px]',
                                isClosed && 'text-muted-foreground'
                              )}
                            >
                              {subject.length > 60
                                ? subject.slice(0, 60) + '...'
                                : subject}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {discussion.author?.full_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MessageCircle className="h-3 w-3" />
                          <span className="text-xs">
                            {discussion.reply_count || 0}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isClosed ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Closed
                          </Badge>
                        ) : discussion.is_internal ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Lock className="h-3 w-3" />
                            Internal
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            Open
                          </Badge>
                        )}
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

      {/* Discussion View Sheet */}
      <DiscussionView
        discussionId={selectedDiscussionId}
        open={!!selectedDiscussionId}
        onOpenChange={open => {
          if (!open) setSelectedDiscussionId(null)
        }}
        parentRecord={selectedParentRecord}
      />

      {/* New Discussion Dialog */}
      <NewDiscussionDialog
        open={showNewDiscussion}
        onOpenChange={setShowNewDiscussion}
      />
    </div>
  )
}
