import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAllDiscussions, useAuth, useBulkDelete, useDiscussionMutations } from '@/hooks'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import {
  GridToolbar,
  GridSearch,
  GridFilterMultiSelect,
} from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import { DiscussionView } from '@/components/shared/DiscussionView'
import { NewDiscussionDialog } from '@/components/shared'
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

const ENTITY_TYPE_OPTIONS = [
  { value: 'client', label: 'Client' },
  { value: 'project', label: 'Project' },
  { value: 'phase', label: 'Phase' },
  { value: 'set', label: 'Set' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'requirement', label: 'Requirement' },
  { value: 'lead', label: 'Lead' },
] as const

export function DiscussionsPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<DiscussionStatus | 'all'>('open')
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null)
  const [showNewDiscussion, setShowNewDiscussion] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  // Multi-valued, as the old FilterBar's parent filter was.
  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>([])

  const hasActiveFilters = !!searchQuery || entityTypeFilter.length > 0

  const clearFilters = () => {
    setSearchQuery('')
    setEntityTypeFilter([])
  }

  // Fetch all discussions using the fixed hook (no arguments needed)
  const { data: allDiscussions, isLoading, error, refetch } = useAllDiscussions()

  // Only a discussion's author may delete it (same rule as DiscussionThread),
  // so bulk delete refuses anything the current user did not start.
  const { user } = useAuth()
  const { deleteDiscussion } = useDiscussionMutations()
  const deleteDiscussionAsync = deleteDiscussion.mutateAsync
  const deleteOwnDiscussion = useCallback(
    (id: string) => {
      const discussion = allDiscussions?.find(d => d.id === id)
      if (!discussion || !user || discussion.author_id !== user.id) {
        return Promise.reject(new Error('You can only delete discussions you started.'))
      }
      return deleteDiscussionAsync(id)
    },
    [allDiscussions, user, deleteDiscussionAsync]
  )
  const onBulkDelete = useBulkDelete(deleteOwnDiscussion, {
    singular: 'discussion',
    plural: 'discussions',
    queryKey: ['discussions'],
  })

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

  const entityNameOf = (entityId: string | null | undefined) =>
    (entityId ? entityNames?.get(entityId) : undefined) ||
    entityId?.slice(0, 8) ||
    'Unknown'

  // Filter discussions by search and entity type
  const filteredDiscussions = useMemo(() => {
    if (!discussions) return []

    return discussions.filter(d => {
      // Entity type filter
      if (
        entityTypeFilter.length > 0 &&
        !entityTypeFilter.includes(d.entity_type ?? '')
      ) {
        return false
      }

      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase()
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
  }, [discussions, searchQuery, entityTypeFilter, entityNames])

  // Count by status for tab badges
  const statusCounts = useMemo(() => {
    if (!allDiscussions) return { open: 0, closed: 0 }
    return {
      open: allDiscussions.filter(d => d.status !== 'closed').length,
      closed: allDiscussions.filter(d => d.status === 'closed').length,
    }
  }, [allDiscussions])

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

  type Discussion = (typeof filteredDiscussions)[number]

  // Double-click / mobile tap navigates to the owning entity's discussion tab.
  const openDiscussionEntity = (discussion: Discussion) => {
    if (!discussion.entity_type || !discussion.entity_id) return
    const basePath = ENTITY_URL_MAP[discussion.entity_type as EntityType] || '/clients'
    navigate(`${basePath}/${discussion.entity_id}?tab=discussions`)
  }

  const subjectOf = (discussion: Discussion) =>
    discussion.subject || discussion.title || discussion.content.slice(0, 60)

  const statusLabelOf = (discussion: Discussion) =>
    discussion.status === 'closed' ? 'Closed' : discussion.is_internal ? 'Internal' : 'Open'

  // ---------------------------------------------------------------------------
  // Columns
  //
  // The discussion subject identifies the row; the four facts needed to triage
  // a thread (what it is attached to, how busy it is, whether it is still open)
  // are secondary. See docs/DESIGN-SYSTEM.md section 4.1.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<Discussion>[]>(
    () => [
      {
        id: 'subject',
        header: 'Discussion',
        priority: 'primary',
        hideable: false,
        // No fixed 300px floor: the column still gets a sensible desktop width
        // but a 390px viewport renders cards, so nothing can overflow.
        minWidth: '240px',
        accessor: row => subjectOf(row),
        cell: row => (
          <div className="flex items-start gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={row.author?.avatar_url} />
              <AvatarFallback className="text-xs">
                {getInitials(row.author?.full_name || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-sm font-medium',
                  row.status === 'closed' && 'text-muted-foreground'
                )}
              >
                <TruncatedCell value={subjectOf(row)} maxLines={1} />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.author?.full_name}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'entity_type',
        header: 'Type',
        priority: 'secondary',
        width: '130px',
        accessor: row =>
          ENTITY_TYPE_CONFIG[row.entity_type as EntityType]?.label ?? row.entity_type ?? '',
        cell: row => {
          const config = ENTITY_TYPE_CONFIG[row.entity_type as EntityType]
          const Icon = config?.icon || MessageSquare
          return (
            <Badge variant="secondary" className={cn('gap-1 text-xs', config?.color)}>
              <Icon className="h-3 w-3" />
              {config?.label ?? row.entity_type}
            </Badge>
          )
        },
      },
      {
        id: 'entity',
        header: 'Entity',
        priority: 'secondary',
        width: '180px',
        accessor: row => entityNameOf(row.entity_id),
        cell: row => (
          <span className="text-sm font-medium">
            <TruncatedCell value={entityNameOf(row.entity_id)} maxLines={1} />
          </span>
        ),
      },
      {
        id: 'reply_count',
        header: 'Replies',
        priority: 'secondary',
        width: '100px',
        numeric: true,
        accessor: row => row.reply_count ?? 0,
        cell: row => (
          <span className="inline-flex items-center justify-end gap-1 text-muted-foreground">
            <MessageCircle className="h-3 w-3" />
            <span className="text-xs">{row.reply_count || 0}</span>
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '120px',
        accessor: row => statusLabelOf(row),
        cell: row =>
          row.status === 'closed' ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3" />
              Closed
            </Badge>
          ) : row.is_internal ? (
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              Internal
            </Badge>
          ) : (
            <Badge variant="default" className="text-xs">
              Open
            </Badge>
          ),
      },
      {
        id: 'created_at',
        header: 'Created',
        width: '140px',
        accessor: row => new Date(row.created_at),
        cell: row => (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
          </span>
        ),
      },
    ],
    // entityNames feeds the Entity column; recompute when the lookup resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityNames]
  )

  return (
    <PageShell
      title="Discussions"
      description="View and participate in all conversations across your workspace"
      icon={MessageSquare}
      actions={
        <Button onClick={() => setShowNewDiscussion(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Discussion
        </Button>
      }
    >
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

      <DataGrid
        columns={columns}
        data={filteredDiscussions}
        getRowId={row => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="discussions"
        defaultSort={{ columnId: 'created_at', direction: 'desc' }}
        ariaLabel="Discussions"
        // Single click opens the thread panel, double click or a mobile tap
        // opens the owning record. Section 4.5.
        onRowClick={row => setSelectedDiscussionId(row.id)}
        onRowOpen={openDiscussionEntity}
        bulkDelete={{ entityName: 'discussion', onDelete: onBulkDelete, entityPath: 'discussions', onNavigate: navigate }}
        exportOptions={{ fileName: 'Discussions' }}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        emptyState={{
          icon: MessageSquare,
          title: 'No discussions found',
          description: "Start a discussion from any entity's detail page.",
        }}
        toolbar={
          <GridToolbar
            activeFilterCount={entityTypeFilter.length}
            onClearFilters={clearFilters}
            search={
              <GridSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by subject, author or entity..."
              />
            }
          >
            <GridFilterMultiSelect
              label="Entity Type"
              options={ENTITY_TYPE_OPTIONS}
              values={entityTypeFilter}
              onChange={setEntityTypeFilter}
            />
          </GridToolbar>
        }
      />

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
    </PageShell>
  )
}
