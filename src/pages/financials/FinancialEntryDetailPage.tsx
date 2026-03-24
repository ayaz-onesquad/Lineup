import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useFinancialEntry,
  useFinancialEntryMutations,
  useFinancialOccurrenceMutations,
  useFinancialGroups,
} from '@/hooks/useFinancials'
import { useClients } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  ArrowLeft,
  DollarSign,
  FileText,
  Calendar,
  Edit,
  X,
  Save,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { formatFrequency, formatCurrency } from '@/utils/recurrenceUtils'
import type { UserProfile, FinancialOccurrence } from '@/types/database'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'revenue', label: 'Revenue' },
]

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CAD', label: 'CAD' },
  { value: 'AUD', label: 'AUD' },
  { value: 'MXN', label: 'MXN' },
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'received', label: 'Received' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
]

const entryDetailSchema = z
  .object({
    type: z.enum(['expense', 'revenue']),
    name: z.string().min(1, 'Name is required'),
    group_id: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
    currency: z.string().default('USD'),
    is_recurring: z.boolean().default(false),
    frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional().nullable(),
    recurrence_day: z.coerce.number().min(1).max(31).optional().nullable(),
    start_date: z.string().min(1, 'Date is required'),
    end_date: z.string().optional().nullable(),
    client_id: z.string().optional().nullable(),
    vendor: z.string().optional().nullable(),
    reference_number: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.is_recurring && !data.frequency) return false
      return true
    },
    { message: 'Frequency is required for recurring entries', path: ['frequency'] }
  )

type EntryDetailFormValues = z.infer<typeof entryDetailSchema>

export function FinancialEntryDetailPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: entry, isLoading } = useFinancialEntry(entryId!)
  const { data: groups = [] } = useFinancialGroups()
  const { data: clients = [] } = useClients()
  const { updateEntry } = useFinancialEntryMutations()
  const {
    updateOccurrenceStatus,
    deleteOccurrence,
    regenerateOccurrences,
  } = useFinancialOccurrenceMutations()

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [occurrenceToDelete, setOccurrenceToDelete] = useState<string | null>(null)

  const form = useForm<EntryDetailFormValues>({
    resolver: zodResolver(entryDetailSchema),
    defaultValues: {
      type: 'expense',
      name: '',
      group_id: null,
      description: null,
      amount: 0,
      currency: 'USD',
      is_recurring: false,
      frequency: null,
      recurrence_day: null,
      start_date: '',
      end_date: null,
      client_id: null,
      vendor: null,
      reference_number: null,
    },
  })

  // Reset form when entry data loads
  useEffect(() => {
    if (entry && !isEditing) {
      form.reset({
        type: entry.type,
        name: entry.name,
        group_id: entry.group_id,
        description: entry.description,
        amount: entry.amount,
        currency: entry.currency,
        is_recurring: entry.is_recurring,
        frequency: entry.frequency,
        recurrence_day: entry.recurrence_day,
        start_date: entry.start_date,
        end_date: entry.end_date,
        client_id: entry.client_id,
        vendor: entry.vendor,
        reference_number: entry.reference_number,
      })
    }
  }, [entry?.id, entry?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true
  useEffect(() => {
    if (shouldEditOnLoad && entry && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, entry])

  const watchType = form.watch('type')
  const watchIsRecurring = form.watch('is_recurring')
  const watchFrequency = form.watch('frequency')

  const filteredGroups = groups.filter((g) => g.type === 'both' || g.type === watchType)
  const groupOptions = filteredGroups.map((g) => ({ value: g.id, label: g.name }))
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }))

  const showRecurrenceDay =
    watchIsRecurring &&
    watchFrequency &&
    ['monthly', 'quarterly', 'yearly'].includes(watchFrequency)

  // Occurrence stats
  const occurrences = entry?.occurrences || []
  const pendingCount = occurrences.filter((o) => o.status === 'pending').length
  const paidCount = occurrences.filter(
    (o) => o.status === 'paid' || o.status === 'received'
  ).length

  const handleSave = async (data: EntryDetailFormValues) => {
    if (!entryId) return
    setIsSaving(true)
    try {
      await updateEntry.mutateAsync({
        id: entryId,
        type: data.type,
        name: data.name.trim(),
        group_id: data.group_id || null,
        description: data.description?.trim() || null,
        amount: data.amount,
        currency: data.currency,
        is_recurring: data.is_recurring,
        frequency: data.is_recurring ? data.frequency : null,
        recurrence_day: data.is_recurring && showRecurrenceDay ? data.recurrence_day : null,
        start_date: data.start_date,
        end_date: data.is_recurring && data.end_date ? data.end_date : null,
        client_id: data.client_id || null,
        vendor: data.vendor?.trim() || null,
        reference_number: data.reference_number?.trim() || null,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (entry) {
      form.reset({
        type: entry.type,
        name: entry.name,
        group_id: entry.group_id,
        description: entry.description,
        amount: entry.amount,
        currency: entry.currency,
        is_recurring: entry.is_recurring,
        frequency: entry.frequency,
        recurrence_day: entry.recurrence_day,
        start_date: entry.start_date,
        end_date: entry.end_date,
        client_id: entry.client_id,
        vendor: entry.vendor,
        reference_number: entry.reference_number,
      })
    }
    setIsEditing(false)
  }

  const handleOccurrenceStatusChange = async (
    occurrence: FinancialOccurrence,
    newStatus: string
  ) => {
    const isPaidOrReceived = newStatus === 'paid' || newStatus === 'received'
    await updateOccurrenceStatus.mutateAsync({
      id: occurrence.id,
      entryId: entryId!,
      status: newStatus as 'pending' | 'paid' | 'received' | 'overdue' | 'cancelled',
      paid_date: isPaidOrReceived ? new Date().toISOString().split('T')[0] : null,
    })
  }

  const handleDeleteOccurrence = async () => {
    if (occurrenceToDelete) {
      await deleteOccurrence.mutateAsync({
        id: occurrenceToDelete,
        entryId: entryId!,
      })
      setOccurrenceToDelete(null)
    }
  }

  const handleRegenerateOccurrences = async () => {
    if (entryId) {
      await regenerateOccurrences.mutateAsync(entryId)
    }
  }

  if (isLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="text-center py-12">
        <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Entry not found</p>
        <Button variant="link" onClick={() => navigate('/financials')}>
          Back to Financial Manager
        </Button>
      </div>
    )
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : entry.name}
            </h1>
            <Badge variant="outline" className="font-mono">
              {entry.display_id || '—'}
            </Badge>
            <Badge variant={entry.type === 'expense' ? 'destructive' : 'default'}>
              {entry.type === 'expense' ? 'Expense' : 'Revenue'}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {formatCurrency(entry.amount, entry.currency)} •{' '}
            {formatFrequency(entry.frequency, entry.recurrence_day)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="occurrences">
            Occurrences ({occurrences.length})
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card className="card-carbon">
            <CardContent className="pt-6">
              {/* Edit/Save buttons */}
              <div className="flex justify-end gap-2 mb-6">
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={form.handleSubmit(handleSave)}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>

              <div className="space-y-6">
                {/* Entry Details Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    Entry Details
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <ViewEditField
                      type="text"
                      label="Name"
                      required
                      isEditing={isEditing}
                      value={form.watch('name')}
                      onChange={(v) => form.setValue('name', v)}
                      error={form.formState.errors.name?.message}
                    />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Type <span className="text-red-500">*</span>
                      </label>
                      {isEditing ? (
                        <div className="mt-1">
                          <SearchableSelect
                            options={TYPE_OPTIONS}
                            value={form.watch('type')}
                            onValueChange={(v) =>
                              form.setValue('type', v as 'expense' | 'revenue')
                            }
                            placeholder="Select type..."
                          />
                        </div>
                      ) : (
                        <p className="mt-1 font-medium">
                          {entry.type === 'expense' ? 'Expense' : 'Revenue'}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Group
                      </label>
                      {isEditing ? (
                        <div className="mt-1">
                          <SearchableSelect
                            options={groupOptions}
                            value={form.watch('group_id') || ''}
                            onValueChange={(v) => form.setValue('group_id', v || null)}
                            placeholder="Select group..."
                            clearable
                          />
                        </div>
                      ) : (
                        <p className="mt-1 font-medium">
                          {entry.group?.name || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="col-span-full">
                      <ViewEditField
                        type="textarea"
                        label="Description"
                        isEditing={isEditing}
                        value={form.watch('description') || ''}
                        onChange={(v) => form.setValue('description', v || null)}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                {/* Financial Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                    Financial Details
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <ViewEditField
                      type="text"
                      label="Amount"
                      required
                      isEditing={isEditing}
                      value={String(form.watch('amount') || '')}
                      onChange={(v: string) => form.setValue('amount', parseFloat(v) || 0)}
                      error={form.formState.errors.amount?.message}
                    />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Currency
                      </label>
                      {isEditing ? (
                        <div className="mt-1">
                          <SearchableSelect
                            options={CURRENCY_OPTIONS}
                            value={form.watch('currency')}
                            onValueChange={(v) => form.setValue('currency', v || 'USD')}
                            placeholder="Select currency..."
                          />
                        </div>
                      ) : (
                        <p className="mt-1 font-medium">{entry.currency}</p>
                      )}
                    </div>
                    <ViewEditField
                      type="text"
                      label="Vendor / Source"
                      isEditing={isEditing}
                      value={form.watch('vendor') || ''}
                      onChange={(v) => form.setValue('vendor', v || null)}
                    />
                    <ViewEditField
                      type="text"
                      label="Invoice / Reference #"
                      isEditing={isEditing}
                      value={form.watch('reference_number') || ''}
                      onChange={(v) => form.setValue('reference_number', v || null)}
                    />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Linked Client
                      </label>
                      {isEditing ? (
                        <div className="mt-1">
                          <SearchableSelect
                            options={clientOptions}
                            value={form.watch('client_id') || ''}
                            onValueChange={(v) => form.setValue('client_id', v || null)}
                            placeholder="Internal (no client)"
                            clearable
                          />
                        </div>
                      ) : (
                        <p className="mt-1 font-medium">
                          {entry.client?.name || (
                            <span className="text-muted-foreground">Internal</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Schedule Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    Schedule
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <ViewEditField
                      type="date"
                      label={watchIsRecurring ? 'Start Date' : 'Date'}
                      required
                      isEditing={isEditing}
                      value={form.watch('start_date')}
                      onChange={(v) => form.setValue('start_date', v)}
                      error={form.formState.errors.start_date?.message}
                    />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Recurring
                      </label>
                      {isEditing ? (
                        <div className="mt-1 flex items-center h-9">
                          <Switch
                            checked={form.watch('is_recurring')}
                            onCheckedChange={(v) => form.setValue('is_recurring', v)}
                          />
                          <span className="ml-2 text-sm">
                            {form.watch('is_recurring') ? 'Yes' : 'No'}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-1 font-medium">
                          {entry.is_recurring ? 'Yes' : 'No'}
                        </p>
                      )}
                    </div>
                    {(watchIsRecurring || entry.is_recurring) && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Frequency{' '}
                            {isEditing && watchIsRecurring && (
                              <span className="text-red-500">*</span>
                            )}
                          </label>
                          {isEditing ? (
                            <div className="mt-1">
                              <SearchableSelect
                                options={FREQUENCY_OPTIONS}
                                value={form.watch('frequency') || ''}
                                onValueChange={(v) =>
                                  form.setValue(
                                    'frequency',
                                    (v as 'weekly' | 'monthly' | 'quarterly' | 'yearly') ||
                                      null
                                  )
                                }
                                placeholder="Select frequency..."
                              />
                            </div>
                          ) : (
                            <p className="mt-1 font-medium">
                              {formatFrequency(entry.frequency, entry.recurrence_day)}
                            </p>
                          )}
                          {form.formState.errors.frequency && (
                            <p className="text-sm text-destructive mt-1">
                              {form.formState.errors.frequency.message}
                            </p>
                          )}
                        </div>
                        {showRecurrenceDay && (
                          <ViewEditField
                            type="text"
                            label="Day of Month"
                            isEditing={isEditing}
                            value={String(form.watch('recurrence_day') || '')}
                            onChange={(v: string) =>
                              form.setValue('recurrence_day', v ? parseInt(v) : null)
                            }
                          />
                        )}
                        <ViewEditField
                          type="date"
                          label="End Date"
                          isEditing={isEditing}
                          value={form.watch('end_date') || ''}
                          onChange={(v) => form.setValue('end_date', v || null)}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Audit Trail */}
                <div className="pt-4 border-t">
                  <AuditTrail
                    created_at={entry.created_at}
                    created_by={entry.created_by || ''}
                    updated_at={entry.updated_at}
                    updated_by={entry.updated_by || undefined}
                    creator={entry.creator as UserProfile | undefined}
                    updater={entry.updater as UserProfile | undefined}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Occurrences Tab */}
        <TabsContent value="occurrences">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Occurrences</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {occurrences.length} occurrences • {pendingCount} pending • {paidCount}{' '}
                    paid
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateOccurrences}
                  disabled={regenerateOccurrences.isPending}
                >
                  {regenerateOccurrences.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Regenerate Occurrences
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {occurrences.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No occurrences generated yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid Date</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occurrences.map((occ) => (
                      <TableRow key={occ.id}>
                        <TableCell>{formatDate(occ.due_date)}</TableCell>
                        <TableCell>{formatCurrency(occ.amount, occ.currency)}</TableCell>
                        <TableCell>
                          <SearchableSelect
                            options={STATUS_OPTIONS}
                            value={occ.status}
                            onValueChange={(v) => {
                              if (v) handleOccurrenceStatusChange(occ, v)
                            }}
                            placeholder="Select status..."
                          />
                        </TableCell>
                        <TableCell>
                          {occ.paid_date ? (
                            formatDate(occ.paid_date)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {occ.notes || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setOccurrenceToDelete(occ.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Occurrence Confirmation */}
      <AlertDialog
        open={!!occurrenceToDelete}
        onOpenChange={() => setOccurrenceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Occurrence?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this occurrence. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOccurrence}
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
