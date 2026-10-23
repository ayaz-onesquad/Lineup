import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useFinancialEntries,
  useFinancialGroups,
  useFinancialEntryMutations,
  useFinancialGroupMutations,
  useFinancialOccurrenceMutations,
} from '@/hooks/useFinancials'
import { useUIStore, type EntityType } from '@/stores'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { GridToolbar, GridSearch } from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  DollarSign,
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'
import { formatFrequency, formatCurrency } from '@/utils/recurrenceUtils'
import { FinancialGroupForm } from '@/components/forms/FinancialGroupForm'
import type { FinancialEntry, FinancialGroup, FinancialOccurrence } from '@/types/database'

// ============================================================================
// HELPERS
// ============================================================================

function getEntryStatus(entry: FinancialEntry): {
  label: string
  variant: 'default' | 'destructive' | 'secondary' | 'outline'
} {
  const occurrences = entry.occurrences || []
  const hasOverdue = occurrences.some((o) => o.status === 'overdue')
  const hasPending = occurrences.some((o) => o.status === 'pending')

  if (hasOverdue) return { label: 'Overdue', variant: 'destructive' }
  if (hasPending) return { label: 'Pending', variant: 'secondary' }
  return { label: 'Up to Date', variant: 'outline' }
}

function getNextDueDate(entry: FinancialEntry): string | null {
  const occurrences = entry.occurrences || []
  const pending = occurrences
    .filter((o) => o.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  return pending[0]?.due_date || null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinancialsPage() {
  const navigate = useNavigate()
  const {
    data: entries = [],
    isLoading: entriesLoading,
    error: entriesError,
    refetch: refetchEntries,
  } = useFinancialEntries()
  const { data: groups = [], isLoading: groupsLoading } = useFinancialGroups()
  const { deleteEntry } = useFinancialEntryMutations()
  const { deleteGroup } = useFinancialGroupMutations()
  const { updateOccurrenceStatus } = useFinancialOccurrenceMutations()
  const { openCreateModal } = useUIStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<FinancialGroup | null>(null)
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  const isLoading = entriesLoading || groupsLoading

  // ─── KPI Calculations ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    let monthlyRevenue = 0
    let monthlyExpenses = 0
    let overdueCount = 0

    entries.forEach((entry) => {
      const occurrences = entry.occurrences || []
      occurrences.forEach((occ) => {
        const dueDate = new Date(occ.due_date)
        const isCurrentMonth =
          dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear

        if (isCurrentMonth) {
          if (entry.type === 'revenue') {
            monthlyRevenue += occ.amount
          } else {
            monthlyExpenses += occ.amount
          }
        }

        if (occ.status === 'overdue') {
          overdueCount++
        }
      })
    })

    return {
      monthlyRevenue,
      monthlyExpenses,
      netIncome: monthlyRevenue - monthlyExpenses,
      overdueCount,
    }
  }, [entries])

  // ─── Filtered Entries ─────────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    let filtered = entries

    // Filter by tab
    if (activeTab === 'expenses') {
      filtered = filtered.filter((e) => e.type === 'expense')
    } else if (activeTab === 'revenue') {
      filtered = filtered.filter((e) => e.type === 'revenue')
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.vendor?.toLowerCase().includes(q) ||
          e.client?.name?.toLowerCase().includes(q) ||
          e.group?.name?.toLowerCase().includes(q)
      )
    }

    return filtered
  }, [entries, activeTab, searchQuery])

  // ─── Calendar Data ────────────────────────────────────────────────────────
  const calendarData = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    // Group occurrences by date
    const occurrencesByDate: Record<
      string,
      Array<{ entry: FinancialEntry; occurrence: FinancialOccurrence }>
    > = {}

    entries.forEach((entry) => {
      const occurrences = entry.occurrences || []
      occurrences.forEach((occ) => {
        const date = occ.due_date
        if (!occurrencesByDate[date]) {
          occurrencesByDate[date] = []
        }
        occurrencesByDate[date].push({ entry, occurrence: occ })
      })
    })

    return { daysInMonth, startDayOfWeek, occurrencesByDate, year, month }
  }, [entries, calendarMonth])

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (entryToDelete) {
      await deleteEntry.mutateAsync(entryToDelete)
      setDeleteDialogOpen(false)
      setEntryToDelete(null)
    }
  }

  const confirmDelete = (id: string) => {
    setEntryToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteGroup = async () => {
    if (groupToDelete) {
      await deleteGroup.mutateAsync(groupToDelete)
      setGroupToDelete(null)
    }
  }

  const handleOccurrenceStatusChange = async (
    occurrenceId: string,
    entryId: string,
    newStatus: string
  ) => {
    const isPaidOrReceived = newStatus === 'paid' || newStatus === 'received'
    await updateOccurrenceStatus.mutateAsync({
      id: occurrenceId,
      entryId,
      status: newStatus as 'pending' | 'paid' | 'received' | 'overdue' | 'cancelled',
      paid_date: isPaidOrReceived ? new Date().toISOString().split('T')[0] : null,
    })
  }

  const entriesGrid = (
    <EntriesGrid
      entries={filteredEntries}
      isLoading={isLoading}
      error={entriesError as Error | null}
      onRetry={refetchEntries}
      onDelete={confirmDelete}
      onNavigate={navigate}
      openCreateModal={openCreateModal}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <PageShell
      title="Financial Manager"
      description="Track expenses and revenue"
      icon={DollarSign}
      // The entries grid carries ten columns; let it use the full viewport.
      constrainWidth={false}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => setGroupsDialogOpen(true)}
            className="w-full sm:w-auto"
          >
            <Settings className="mr-2 h-4 w-4" />
            Manage Groups
          </Button>
          <Button
            onClick={() => openCreateModal('financial_entry')}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Entry
          </Button>
        </>
      }
    >
      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-green-600">
              {formatCurrency(kpis.monthlyRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-red-600">
              {formatCurrency(kpis.monthlyExpenses)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                kpis.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {formatCurrency(kpis.netIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Revenue - Expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{kpis.overdueCount}</div>
            <p className="text-xs text-muted-foreground">Occurrences past due</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Entries</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        {/* All / Expenses / Revenue Tabs */}
        <TabsContent value="all" className="mt-4">
          {entriesGrid}
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          {entriesGrid}
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          {entriesGrid}
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1)
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next month"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1)
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* A seven-column month grid cannot shrink to a 390px viewport
                  without 50px cells, so it scrolls inside its own container
                  rather than squeezing. See docs/DESIGN-SYSTEM.md section 2.2. */}
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div className="grid min-w-[640px] grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
                  {/* Header */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div
                      key={day}
                      className="bg-muted p-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                  {/* Empty cells before first day */}
                  {Array.from({ length: calendarData.startDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[80px] bg-background p-2" />
                  ))}
                  {/* Days */}
                  {Array.from({ length: calendarData.daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dateStr = `${calendarData.year}-${String(calendarData.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const dayOccurrences = calendarData.occurrencesByDate[dateStr] || []
                    const isToday =
                      new Date().toISOString().split('T')[0] === dateStr

                    return (
                      <div
                        key={day}
                        className={cn(
                          'min-h-[80px] border-l border-t bg-background p-2 first:border-l-0',
                          isToday && 'bg-primary/5'
                        )}
                      >
                        <div
                          className={cn(
                            'mb-1 text-sm',
                            isToday && 'font-bold text-primary'
                          )}
                        >
                          {day}
                        </div>
                        <div className="space-y-1">
                          {dayOccurrences.slice(0, 3).map(({ entry, occurrence }) => (
                            <CalendarOccurrenceChip
                              key={occurrence.id}
                              entry={entry}
                              occurrence={occurrence}
                              onStatusChange={handleOccurrenceStatusChange}
                            />
                          ))}
                          {dayOccurrences.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{dayOccurrences.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Entry Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this financial entry and all its occurrences. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Groups Dialog */}
      <Dialog open={groupsDialogOpen} onOpenChange={setGroupsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Financial Groups</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Groups list. A four-column table cannot hold name, type, colour
                and two actions inside a 390px dialog, so this is a card list
                per docs/DESIGN-SYSTEM.md section 3. */}
            {groups.length === 0 ? (
              <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                No groups yet. Create one below.
              </p>
            ) : (
              <ul className="space-y-2">
                {groups.map((group) => (
                  <li
                    key={group.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
                  >
                    {group.color ? (
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0 rounded border"
                        style={{ backgroundColor: group.color }}
                      />
                    ) : (
                      <span className="h-5 w-5 shrink-0 rounded border border-dashed" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {group.name}
                    </span>
                    <Badge
                      variant={
                        group.type === 'expense'
                          ? 'destructive'
                          : group.type === 'revenue'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {group.type}
                    </Badge>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${group.name}`}
                        onClick={() => setEditingGroup(group)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${group.name}`}
                        onClick={() => setGroupToDelete(group.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add/Edit Group Form */}
            <div className="border-t pt-4">
              <h4 className="mb-3 text-sm font-medium">
                {editingGroup ? 'Edit Group' : 'Add New Group'}
              </h4>
              <FinancialGroupForm
                group={editingGroup}
                onSuccess={() => setEditingGroup(null)}
                onCancel={editingGroup ? () => setEditingGroup(null) : undefined}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <AlertDialog open={!!groupToDelete} onOpenChange={() => setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the group. Entries using this group will have their group cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface EntriesGridProps {
  entries: FinancialEntry[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  onDelete: (id: string) => void
  onNavigate: (path: string) => void
  openCreateModal: (type: EntityType) => void
  searchQuery: string
  onSearchChange: (value: string) => void
}

function EntriesGrid({
  entries,
  isLoading,
  error,
  onRetry,
  onDelete,
  onNavigate,
  openCreateModal,
  searchQuery,
  onSearchChange,
}: EntriesGridProps) {
  // ---------------------------------------------------------------------------
  // Columns
  //
  // The entry name identifies the row and is the sticky first column, so it
  // stays visible while the wide financial data scrolls. Money and counts are
  // `numeric`, which right-aligns them with tabular figures so digits line up
  // by place value (docs/DESIGN-SYSTEM.md section 4.3).
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<FinancialEntry>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        priority: 'primary',
        hideable: false,
        minWidth: '200px',
        accessor: (row) => row.name,
        cell: (row) => (
          <span className="font-medium">
            <TruncatedCell value={row.name} maxLines={1} />
          </span>
        ),
      },
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        width: '90px',
        accessor: (row) => row.display_id ?? 0,
        cell: (row) => (
          <Badge variant="outline" className="font-mono text-xs">
            {row.display_id || '—'}
          </Badge>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        priority: 'secondary',
        width: '110px',
        accessor: (row) => (row.type === 'expense' ? 'Expense' : 'Revenue'),
        cell: (row) => (
          <Badge variant={row.type === 'expense' ? 'destructive' : 'default'}>
            {row.type === 'expense' ? 'Expense' : 'Revenue'}
          </Badge>
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        priority: 'secondary',
        width: '130px',
        numeric: true,
        accessor: (row) => row.amount,
        cell: (row) => formatCurrency(row.amount, row.currency),
      },
      {
        id: 'next_due',
        header: 'Next Due',
        priority: 'secondary',
        mobileLabel: 'Next due',
        width: '130px',
        accessor: (row) => getNextDueDate(row),
        cell: (row) => {
          const nextDue = getNextDueDate(row)
          return nextDue ? (
            formatDate(nextDue)
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '130px',
        accessor: (row) => getEntryStatus(row).label,
        cell: (row) => {
          const status = getEntryStatus(row)
          return <Badge variant={status.variant}>{status.label}</Badge>
        },
      },
      {
        id: 'group',
        header: 'Group',
        width: '150px',
        accessor: (row) => row.group?.name ?? '',
        cell: (row) =>
          row.group ? (
            <Badge
              variant="secondary"
              style={
                row.group.color
                  ? { backgroundColor: row.group.color, color: '#fff' }
                  : undefined
              }
            >
              {row.group.name}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'frequency',
        header: 'Frequency',
        width: '150px',
        accessor: (row) => formatFrequency(row.frequency, row.recurrence_day),
      },
      {
        id: 'start_date',
        header: 'Start Date',
        mobileLabel: 'Start',
        width: '130px',
        accessor: (row) => row.start_date,
        cell: (row) => formatDate(row.start_date),
      },
      {
        id: 'client',
        header: 'Client',
        width: '160px',
        accessor: (row) => row.client?.name ?? '',
        cell: (row) =>
          row.client?.name ? (
            <TruncatedCell value={row.client.name} maxLines={1} />
          ) : (
            <span className="text-muted-foreground">Internal</span>
          ),
      },
      {
        id: 'occurrences',
        header: 'Occurrences',
        mobileLabel: 'Occurrences',
        width: '130px',
        numeric: true,
        accessor: (row) => (row.occurrences || []).length,
      },
    ],
    []
  )

  return (
    <DataGrid
      columns={columns}
      data={entries}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      // The densest grid in the app: compact rows, with the name pinned so the
      // row's identity survives horizontal scrolling. Sections 2.6 and 4.4.
      density="compact"
      stickyFirstColumn
      storageKey="financials"
      defaultSort={{ columnId: 'next_due', direction: 'asc' }}
      ariaLabel="Financial entries"
      // Double click, Enter, or a mobile tap opens the entry. Section 4.5.
      onRowOpen={(row) => onNavigate(`/financials/${row.id}`)}
      hasActiveFilters={!!searchQuery}
      onClearFilters={() => onSearchChange('')}
      emptyState={{
        icon: DollarSign,
        title: 'No entries yet',
        description: 'Start by adding your first financial entry.',
        action: (
          <Button onClick={() => openCreateModal('financial_entry')}>
            <Plus className="mr-2 h-4 w-4" />
            Add First Entry
          </Button>
        ),
      }}
      toolbar={
        <GridToolbar
          search={
            <GridSearch
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Search by name, vendor, client or group..."
            />
          }
        />
      }
      rowActions={(row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50">
            <DropdownMenuItem onClick={() => onNavigate(`/financials/${row.id}?edit=true`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(row.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    />
  )
}

interface CalendarOccurrenceChipProps {
  entry: FinancialEntry
  occurrence: FinancialOccurrence
  onStatusChange: (occurrenceId: string, entryId: string, status: string) => void
}

function CalendarOccurrenceChip({
  entry,
  occurrence,
  onStatusChange,
}: CalendarOccurrenceChipProps) {
  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'received', label: 'Received' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full truncate rounded px-1.5 py-0.5 text-left text-xs tabular-nums',
            entry.type === 'expense'
              ? 'bg-red-100 text-red-800 hover:bg-red-200'
              : 'bg-green-100 text-green-800 hover:bg-green-200',
            occurrence.status === 'paid' || occurrence.status === 'received'
              ? 'opacity-50'
              : ''
          )}
        >
          {formatCurrency(occurrence.amount, occurrence.currency)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="space-y-2">
          <div className="font-medium">{entry.name}</div>
          <div className="text-sm text-muted-foreground">
            {formatCurrency(occurrence.amount, occurrence.currency)} -{' '}
            {entry.type === 'expense' ? 'Expense' : 'Revenue'}
          </div>
          <div className="pt-2">
            <label className="text-sm font-medium">Status</label>
            <SearchableSelect
              options={statusOptions}
              value={occurrence.status}
              onValueChange={(value) => {
                if (value) {
                  onStatusChange(occurrence.id, entry.id, value)
                }
              }}
              placeholder="Select status..."
            />
          </div>
          {occurrence.paid_date && (
            <div className="text-xs text-muted-foreground">
              Paid: {formatDate(occurrence.paid_date)}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
