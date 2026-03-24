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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Search,
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
  const { data: entries = [], isLoading: entriesLoading } = useFinancialEntries()
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

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Manager</h1>
            <p className="text-muted-foreground">Track expenses and revenue</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGroupsDialogOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Manage Groups
          </Button>
          <Button onClick={() => openCreateModal('financial_entry')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
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
            <div className="text-2xl font-bold text-red-600">
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
                'text-2xl font-bold',
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
            <div className="text-2xl font-bold">{kpis.overdueCount}</div>
            <p className="text-xs text-muted-foreground">Occurrences past due</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="all">All Entries</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          {activeTab !== 'calendar' && (
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          )}
        </div>

        {/* All / Expenses / Revenue Tabs */}
        <TabsContent value="all" className="mt-4">
          <EntriesTable
            entries={filteredEntries}
            isLoading={isLoading}
            onDelete={confirmDelete}
            onNavigate={navigate}
            openCreateModal={openCreateModal}
          />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <EntriesTable
            entries={filteredEntries}
            isLoading={isLoading}
            onDelete={confirmDelete}
            onNavigate={navigate}
            openCreateModal={openCreateModal}
          />
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <EntriesTable
            entries={filteredEntries}
            isLoading={isLoading}
            onDelete={confirmDelete}
            onNavigate={navigate}
            openCreateModal={openCreateModal}
          />
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
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
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {/* Header */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    className="bg-muted p-2 text-center text-sm font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
                {/* Empty cells before first day */}
                {Array.from({ length: calendarData.startDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-background p-2 min-h-[80px]" />
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
                        'bg-background p-2 min-h-[80px] border-l border-t first:border-l-0',
                        isToday && 'bg-primary/5'
                      )}
                    >
                      <div
                        className={cn(
                          'text-sm mb-1',
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
            {/* Groups Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      {group.color ? (
                        <div
                          className="h-5 w-5 rounded border"
                          style={{ backgroundColor: group.color }}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingGroup(group)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setGroupToDelete(group.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No groups yet. Create one below.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Add/Edit Group Form */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">
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
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface EntriesTableProps {
  entries: FinancialEntry[]
  isLoading: boolean
  onDelete: (id: string, e: React.MouseEvent) => void
  onNavigate: (path: string) => void
  openCreateModal: (type: EntityType) => void
}

function EntriesTable({
  entries,
  isLoading,
  onDelete,
  onNavigate,
  openCreateModal,
}: EntriesTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader className="text-center py-12">
          <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <CardTitle>No entries yet</CardTitle>
          <CardDescription>Start by adding your first financial entry.</CardDescription>
          <Button className="mt-4" onClick={() => openCreateModal('financial_entry')}>
            <Plus className="mr-2 h-4 w-4" />
            Add First Entry
          </Button>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Next Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const status = getEntryStatus(entry)
              const nextDue = getNextDueDate(entry)

              return (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onDoubleClick={() => onNavigate(`/financials/${entry.id}`)}
                >
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {entry.display_id || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{entry.name}</TableCell>
                  <TableCell>
                    <Badge variant={entry.type === 'expense' ? 'destructive' : 'default'}>
                      {entry.type === 'expense' ? 'Expense' : 'Revenue'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.group ? (
                      <Badge
                        variant="secondary"
                        style={
                          entry.group.color
                            ? { backgroundColor: entry.group.color, color: '#fff' }
                            : undefined
                        }
                      >
                        {entry.group.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(entry.amount, entry.currency)}</TableCell>
                  <TableCell>
                    {formatFrequency(entry.frequency, entry.recurrence_day)}
                  </TableCell>
                  <TableCell>{formatDate(entry.start_date)}</TableCell>
                  <TableCell>
                    {entry.client?.name || (
                      <span className="text-muted-foreground">Internal</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {nextDue ? formatDate(nextDue) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onNavigate(`/financials/${entry.id}?edit=true`)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => onDelete(entry.id, e as unknown as React.MouseEvent)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
            'w-full text-left text-xs px-1.5 py-0.5 rounded truncate',
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
