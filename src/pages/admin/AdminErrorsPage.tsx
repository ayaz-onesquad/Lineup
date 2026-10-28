import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertOctagon,
  Bug,
  CheckCircle2,
  Eye,
  EyeOff,
  RotateCcw,
  Siren,
  Users,
  Wrench,
} from 'lucide-react'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { StatTile } from '@/components/shared/StatTile'
import { RichTextEditor, RichTextView } from '@/components/shared/RichTextEditor'
import { isRichTextEmpty, toRichTextHtml } from '@/lib/sanitize'
import { toast } from '@/hooks/use-toast'
import { cn, formatDate } from '@/lib/utils'
import {
  APP_ERROR_STATUS_LABEL,
  useAppErrorGroups,
  useAppErrorOccurrences,
  useReviewAppError,
  type AppErrorGroup,
  type AppErrorStatus,
} from '@/hooks/useAppErrors'

const STATUS_STYLE: Record<AppErrorStatus, string> = {
  new: 'bg-red-100 text-red-700 border-red-200',
  acknowledged: 'bg-blue-100 text-blue-700 border-blue-200',
  action_required: 'bg-amber-100 text-amber-800 border-amber-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ignored: 'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_FILTERS = [
  { value: 'open', label: 'Open (new, acknowledged, action required)' },
  { value: 'new', label: 'New' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'action_required', label: 'Action required' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'all', label: 'All' },
]

const OPEN: AppErrorStatus[] = ['new', 'acknowledged', 'action_required']

function StatusBadge({ status }: { status: AppErrorStatus }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', STATUS_STYLE[status])}>
      {APP_ERROR_STATUS_LABEL[status]}
    </Badge>
  )
}

/**
 * Admin > Errors. Every application error lands here (migration 073) and is
 * worked to a decision: acknowledged, needs action, resolved, or ignored as a
 * one-off. A closed error that recurs reopens as New.
 */
export function AdminErrorsPage() {
  const { data: groups, isLoading, error, refetch } = useAppErrorGroups()
  const [statusFilter, setStatusFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const list = groups ?? []
    const dayAgo = Date.now() - 864e5
    return {
      new: list.filter((g) => g.status === 'new').length,
      action: list.filter((g) => g.status === 'action_required').length,
      last24h: list.filter((g) => new Date(g.last_seen_at).getTime() > dayAgo).length,
      users: new Set(list.filter((g) => OPEN.includes(g.status)).flatMap((g) => g.affected_users)).size,
    }
  }, [groups])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (groups ?? []).filter((g) => {
      const statusOk =
        statusFilter === 'all' ||
        (statusFilter === 'open' ? OPEN.includes(g.status) : g.status === statusFilter)
      const searchOk =
        !term ||
        g.message.toLowerCase().includes(term) ||
        (g.code ?? '').toLowerCase().includes(term) ||
        (g.last_url ?? '').toLowerCase().includes(term)
      return statusOk && searchOk
    })
  }, [groups, statusFilter, search])

  const columns = useMemo<DataGridColumn<AppErrorGroup>[]>(
    () => [
      {
        id: 'id',
        header: 'ID',
        width: '80px',
        hideOnMobile: true,
        accessor: (g) => g.display_id,
        cell: (g) => <span className="font-mono text-xs text-muted-foreground">ERR-{g.display_id}</span>,
        exportValue: (g) => `ERR-${g.display_id}`,
      },
      {
        id: 'message',
        header: 'Error',
        priority: 'primary',
        minWidth: '320px',
        accessor: (g) => g.message,
        cell: (g) => (
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium break-words">{g.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {g.error_name}
              {g.code && <span className="ml-1 font-mono">· {g.code}</span>}
              {g.regressed_at && <span className="ml-1 font-medium text-red-600">· Regressed</span>}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '150px',
        accessor: (g) => APP_ERROR_STATUS_LABEL[g.status],
        cell: (g) => <StatusBadge status={g.status} />,
      },
      {
        id: 'count',
        header: 'Events',
        priority: 'secondary',
        width: '90px',
        numeric: true,
        accessor: (g) => g.occurrence_count,
      },
      {
        id: 'users',
        header: 'Users',
        width: '80px',
        numeric: true,
        accessor: (g) => g.affected_users.length,
      },
      {
        id: 'lastSeen',
        header: 'Last seen',
        priority: 'secondary',
        width: '140px',
        accessor: (g) => new Date(g.last_seen_at),
        cell: (g) => formatDistanceToNow(new Date(g.last_seen_at), { addSuffix: true }),
      },
      {
        id: 'firstSeen',
        header: 'First seen',
        width: '120px',
        accessor: (g) => new Date(g.first_seen_at),
        cell: (g) => formatDate(g.first_seen_at),
      },
      {
        id: 'tenant',
        header: 'Tenant',
        minWidth: '160px',
        accessor: (g) => g.tenants?.name ?? '',
        cell: (g) => g.tenants?.name ?? '—',
      },
      {
        id: 'source',
        header: 'Source',
        width: '110px',
        accessor: (g) => g.source,
        cell: (g) => <span className="capitalize">{g.source.replace('_', ' ')}</span>,
      },
    ],
    []
  )

  const selected = (groups ?? []).find((g) => g.id === selectedId) ?? null

  return (
    <PageShell
      title="Errors"
      description="Every application error, grouped. Review each one and close it out."
      icon={Bug}
    >
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile index={0} label="New" value={counts.new} format={(v) => Math.round(v).toString()}
          icon={Siren} tone={counts.new > 0 ? 'danger' : 'neutral'} isLoading={isLoading}
          detail="Not yet reviewed" onClick={() => setStatusFilter('new')} />
        <StatTile index={1} label="Action required" value={counts.action} format={(v) => Math.round(v).toString()}
          icon={Wrench} tone={counts.action > 0 ? 'warning' : 'neutral'} isLoading={isLoading}
          detail="Need a fix" onClick={() => setStatusFilter('action_required')} />
        <StatTile index={2} label="Active in 24h" value={counts.last24h} format={(v) => Math.round(v).toString()}
          icon={AlertOctagon} tone="primary" isLoading={isLoading} detail="Distinct errors seen" />
        <StatTile index={3} label="Users affected" value={counts.users} format={(v) => Math.round(v).toString()}
          icon={Users} tone="neutral" isLoading={isLoading} detail="By open errors" />
      </div>

      <DataGrid
        columns={columns}
        data={filtered}
        getRowId={(g) => g.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        onRowClick={(g) => setSelectedId(g.id)}
        onRowOpen={(g) => setSelectedId(g.id)}
        defaultSort={{ columnId: 'lastSeen', direction: 'desc' }}
        storageKey="admin-errors"
        exportOptions={{ fileName: 'LineUp Errors' }}
        hasActiveFilters={statusFilter !== 'all' || !!search}
        onClearFilters={() => {
          setStatusFilter('all')
          setSearch('')
        }}
        emptyState={{
          icon: CheckCircle2,
          title: 'No errors to review',
          description: 'New errors appear here as soon as they happen.',
        }}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search message, code or page"
              className="sm:max-w-xs"
              aria-label="Search errors"
            />
            <SearchableSelect
              options={STATUS_FILTERS}
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v ?? 'open')}
              placeholder="Status"
              className="sm:w-72"
            />
          </div>
        }
        ariaLabel="Application errors"
      />

      <ErrorDetailSheet group={selected} onClose={() => setSelectedId(null)} />
    </PageShell>
  )
}

function ErrorDetailSheet({ group, onClose }: { group: AppErrorGroup | null; onClose: () => void }) {
  const { data: occurrences, isLoading } = useAppErrorOccurrences(group?.id ?? null)
  const review = useReviewAppError()
  const [note, setNote] = useState('')

  const act = async (status: AppErrorStatus) => {
    if (!group) return
    try {
      await review.mutateAsync({
        groupId: group.id,
        status,
        note: isRichTextEmpty(note) ? undefined : note,
      })
      setNote('')
      toast({ title: `Marked ${APP_ERROR_STATUS_LABEL[status].toLowerCase()}` })
    } catch (e) {
      toast({
        title: 'Could not update the error',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const latest = occurrences?.[0]

  return (
    <Sheet open={!!group} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {group && (
          <>
            <SheetHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">ERR-{group.display_id}</span>
                <StatusBadge status={group.status} />
                {group.code && <Badge variant="outline" className="font-mono">{group.code}</Badge>}
                {group.regressed_at && (
                  <Badge variant="destructive">Regressed {formatDate(group.regressed_at)}</Badge>
                )}
              </div>
              <SheetTitle className="break-words text-lg leading-snug">{group.message}</SheetTitle>
              <SheetDescription>
                {group.occurrence_count} events · {group.affected_users.length} users · first seen{' '}
                {formatDate(group.first_seen_at)} · last seen{' '}
                {formatDistanceToNow(new Date(group.last_seen_at), { addSuffix: true })}
                {group.release && ` · build ${group.release}`}
              </SheetDescription>
            </SheetHeader>

            {/* Review */}
            <section className="mt-6 space-y-3 rounded-lg border p-4">
              <h3 className="text-sm font-semibold">Review</h3>
              {group.resolution_note && !isRichTextEmpty(group.resolution_note) && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <RichTextView content={toRichTextHtml(group.resolution_note)} />
                  {group.reviewed_at && (
                    <p className="mt-1 text-xs text-muted-foreground">Last reviewed {formatDate(group.reviewed_at)}</p>
                  )}
                </div>
              )}
              <RichTextEditor
                content={note}
                onChange={setNote}
                placeholder="What was the cause, and what was done? (optional)"
                minHeight="80px"
              />
              <div className="flex flex-wrap gap-2">
                {group.status !== 'acknowledged' && OPEN.includes(group.status) && (
                  <Button size="sm" variant="outline" onClick={() => act('acknowledged')} disabled={review.isPending}>
                    <Eye className="mr-2 h-4 w-4" /> Acknowledge
                  </Button>
                )}
                {group.status !== 'action_required' && OPEN.includes(group.status) && (
                  <Button size="sm" variant="outline" onClick={() => act('action_required')} disabled={review.isPending}>
                    <Wrench className="mr-2 h-4 w-4" /> Action required
                  </Button>
                )}
                {OPEN.includes(group.status) && (
                  <>
                    <Button size="sm" onClick={() => act('resolved')} disabled={review.isPending}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act('ignored')} disabled={review.isPending}>
                      <EyeOff className="mr-2 h-4 w-4" /> Ignore (one-off)
                    </Button>
                  </>
                )}
                {!OPEN.includes(group.status) && (
                  <Button size="sm" variant="outline" onClick={() => act('new')} disabled={review.isPending}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Reopen
                  </Button>
                )}
              </div>
            </section>

            {/* Latest occurrence detail: Supabase details/hint, component stack */}
            {latest && Object.keys(latest.context ?? {}).length > 0 && (
              <section className="mt-6 space-y-2">
                <h3 className="text-sm font-semibold">Latest details</h3>
                <pre className="scrollbar-visible max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(latest.context, null, 2)}
                </pre>
              </section>
            )}

            {group.stack && (
              <section className="mt-6 space-y-2">
                <h3 className="text-sm font-semibold">Stack trace</h3>
                <pre className="scrollbar-visible max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {group.stack}
                </pre>
              </section>
            )}

            <section className="mt-6 space-y-2 pb-6">
              <h3 className="text-sm font-semibold">Recent occurrences</h3>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {(occurrences ?? []).map((o) => (
                    <li key={o.id} className="space-y-0.5 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="font-medium">{o.tenants?.name ?? 'No tenant'}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(o.occurred_at), { addSuffix: true })}
                        </span>
                      </div>
                      {o.url && <p className="break-all text-xs text-muted-foreground">{o.url}</p>}
                      <p className="text-xs text-muted-foreground">
                        {o.user_id ? `User ${o.user_id.slice(0, 8)}` : 'Signed out'}
                        {o.release && ` · build ${o.release}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
