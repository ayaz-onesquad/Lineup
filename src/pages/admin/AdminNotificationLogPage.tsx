import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '@/components/ui/searchable-select'
import {
  CheckCircle2,
  XCircle,
  Activity,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import {
  useNotificationLogStats,
  useNotificationLog,
  useNotificationLogTriggerKeys,
  useNotificationLogTenants,
} from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import type { NotificationLogFilters, NotificationSendLogWithTenant } from '@/types/notifications'

// Status filter options
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
]

export function AdminNotificationLogPage() {
  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>('all')
  const [triggerFilter, setTriggerFilter] = useState<string | undefined>(undefined)
  const [tenantFilter, setTenantFilter] = useState<string | undefined>(undefined)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Expanded failed rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Build filters object
  const filters: NotificationLogFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusFilter === 'all' ? null : statusFilter,
      triggerKey: triggerFilter || null,
      tenantId: tenantFilter || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }),
    [search, statusFilter, triggerFilter, tenantFilter, dateFrom, dateTo]
  )

  // Queries
  const { data: stats, isLoading: isLoadingStats, refetch: refetchStats } = useNotificationLogStats()
  const {
    data: logPage,
    isLoading: isLoadingLog,
    refetch: refetchLog,
  } = useNotificationLog(filters, page)
  const { data: triggerKeys } = useNotificationLogTriggerKeys()
  const { data: tenants } = useNotificationLogTenants()

  // Reset page when filters change
  const handleFilterChange = () => {
    setPage(1)
  }

  // Toggle row expansion
  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Prepare dropdown options
  const triggerOptions: SearchableSelectOption[] = useMemo(
    () =>
      (triggerKeys || []).map((key) => ({
        value: key,
        label: key,
      })),
    [triggerKeys]
  )

  const tenantOptions: SearchableSelectOption[] = useMemo(
    () =>
      (tenants || []).map((t) => ({
        value: t.id,
        label: t.name,
      })),
    [tenants]
  )

  // Format sent_at timestamp
  const formatTimestamp = (sentAt: string | null, createdAt: string) => {
    const date = sentAt || createdAt
    // formatDate returns 'MMM d, yyyy' format, append time manually
    const dateObj = new Date(date)
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }
    return dateObj.toLocaleDateString('en-US', options)
  }

  // Truncate text with ellipsis
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  // Refetch all data
  const handleRefresh = () => {
    refetchStats()
    refetchLog()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'Admin', href: '/admin' },
            { label: 'Notifications', href: '/admin/notifications' },
            { label: 'Send Log' },
          ]}
        />
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Email Send Log</h1>
            <p className="text-muted-foreground mt-1">
              All notification emails sent across all tenants
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sent"
          value={stats?.totalSent ?? 0}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          isLoading={isLoadingStats}
          bgColor="bg-green-50"
        />
        <StatCard
          title="Total Failed"
          value={stats?.totalFailed ?? 0}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          isLoading={isLoadingStats}
          bgColor="bg-red-50"
        />
        <StatCard
          title="Sent Today"
          value={stats?.sentToday ?? 0}
          icon={<Mail className="h-5 w-5 text-blue-600" />}
          isLoading={isLoadingStats}
          bgColor="bg-blue-50"
        />
        <StatCard
          title="Failed Today"
          value={stats?.failedToday ?? 0}
          icon={<Activity className="h-5 w-5 text-amber-600" />}
          isLoading={isLoadingStats}
          bgColor="bg-amber-50"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <Label htmlFor="search" className="text-xs text-muted-foreground">
                Search
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Email or subject..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    handleFilterChange()
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex mt-1 rounded-md border overflow-hidden">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex-1 px-3 py-2 text-sm font-medium transition-colors',
                      statusFilter === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    )}
                    onClick={() => {
                      setStatusFilter(option.value as 'all' | 'sent' | 'failed')
                      handleFilterChange()
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger Filter */}
            <div>
              <Label className="text-xs text-muted-foreground">Trigger</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={triggerOptions}
                  value={triggerFilter}
                  onValueChange={(value) => {
                    setTriggerFilter(value)
                    handleFilterChange()
                  }}
                  placeholder="All triggers"
                  searchPlaceholder="Search triggers..."
                  clearable
                />
              </div>
            </div>

            {/* Tenant Filter */}
            <div>
              <Label className="text-xs text-muted-foreground">Tenant</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={tenantOptions}
                  value={tenantFilter}
                  onValueChange={(value) => {
                    setTenantFilter(value)
                    handleFilterChange()
                  }}
                  placeholder="All tenants"
                  searchPlaceholder="Search tenants..."
                  clearable
                />
              </div>
            </div>

            {/* Date Range */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    handleFilterChange()
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="dateTo" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    handleFilterChange()
                  }}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        {isLoadingLog ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !logPage || logPage.data.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No emails logged yet.
            </p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Emails will appear here once the notification system begins sending.
            </p>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Sent At</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="hidden md:table-cell">Subject</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="hidden lg:table-cell">Tenant</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logPage.data.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isExpanded={expandedRows.has(log.id)}
                    onToggleExpand={() => toggleRowExpansion(log.id)}
                    formatTimestamp={formatTimestamp}
                    truncateText={truncateText}
                  />
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 50 + 1} to{' '}
                {Math.min(page * 50, logPage.totalCount)} of {logPage.totalCount} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {page} of {logPage.totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= logPage.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  title: string
  value: number
  icon: React.ReactNode
  isLoading: boolean
  bgColor: string
}

function StatCard({ title, value, icon, isLoading, bgColor }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center">
          <div className={cn('flex items-center justify-center w-16 h-20', bgColor)}>
            {icon}
          </div>
          <div className="flex-1 px-4">
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">{title}</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Log Row Component
interface LogRowProps {
  log: NotificationSendLogWithTenant
  isExpanded: boolean
  onToggleExpand: () => void
  formatTimestamp: (sentAt: string | null, createdAt: string) => string
  truncateText: (text: string, maxLength: number) => string
}

function LogRow({
  log,
  isExpanded,
  onToggleExpand,
  formatTimestamp,
  truncateText,
}: LogRowProps) {
  const isFailed = log.status === 'failed'
  const hasError = isFailed && log.error_message

  return (
    <>
      <TableRow
        className={cn(
          isFailed && 'bg-red-50/50',
          hasError && 'cursor-pointer hover:bg-muted/50'
        )}
        onClick={() => hasError && onToggleExpand()}
      >
        <TableCell className="font-mono text-xs">
          {formatTimestamp(log.sent_at, log.created_at)}
        </TableCell>
        <TableCell className="font-medium">{log.recipient_email}</TableCell>
        <TableCell className="hidden md:table-cell">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">{truncateText(log.subject, 60)}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              <p>{log.subject}</p>
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className="font-mono text-xs">
            {log.trigger_key}
          </Badge>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          {log.tenants?.name || (
            <span className="text-muted-foreground italic">System</span>
          )}
        </TableCell>
        <TableCell className="text-center">
          {log.status === 'sent' ? (
            <Badge
              variant="outline"
              className="bg-green-50 text-green-700 border-green-200"
            >
              Sent
            </Badge>
          ) : log.status === 'failed' ? (
            <Badge
              variant="outline"
              className="bg-red-50 text-red-700 border-red-200"
            >
              Failed
            </Badge>
          ) : (
            <Badge variant="outline">Queued</Badge>
          )}
        </TableCell>
        <TableCell>
          {hasError && (
            <Button variant="ghost" size="icon" className="h-8 w-8">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && hasError && (
        <TableRow>
          <TableCell colSpan={7} className="bg-red-50/30 border-l-4 border-l-red-400">
            <div className="py-2">
              <p className="text-xs font-semibold text-red-700 mb-1">Error Message:</p>
              <pre className="text-xs bg-red-100 border border-red-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {log.error_message}
              </pre>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
