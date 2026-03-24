import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useFinancialEntryMutations, useFinancialGroups } from '@/hooks/useFinancials'
import { useClients } from '@/hooks/useClients'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense', description: 'Money going out' },
  { value: 'revenue', label: 'Revenue', description: 'Money coming in' },
]

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly', description: 'Every 7 days' },
  { value: 'monthly', label: 'Monthly', description: 'Once per month' },
  { value: 'quarterly', label: 'Quarterly', description: 'Every 3 months' },
  { value: 'yearly', label: 'Yearly', description: 'Once per year' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD', description: 'US Dollar' },
  { value: 'EUR', label: 'EUR', description: 'Euro' },
  { value: 'GBP', label: 'GBP', description: 'British Pound' },
  { value: 'CAD', label: 'CAD', description: 'Canadian Dollar' },
  { value: 'AUD', label: 'AUD', description: 'Australian Dollar' },
  { value: 'MXN', label: 'MXN', description: 'Mexican Peso' },
]

const financialEntryFormSchema = z
  .object({
    type: z.enum(['expense', 'revenue'], { required_error: 'Type is required' }),
    name: z.string().min(1, 'Name is required'),
    group_id: z.string().optional().nullable(),
    amount: z.coerce
      .number({ invalid_type_error: 'Amount is required' })
      .min(0.01, 'Amount must be greater than 0'),
    currency: z.string().default('USD'),
    is_recurring: z.boolean().default(false),
    frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional().nullable(),
    recurrence_day: z.coerce.number().min(1).max(31).optional().nullable(),
    start_date: z.string().min(1, 'Date is required'),
    end_date: z.string().optional().nullable(),
    client_id: z.string().optional().nullable(),
    vendor: z.string().optional(),
    reference_number: z.string().optional(),
    description: z.string().optional(),
  })
  .refine(
    (data) => {
      // frequency required if is_recurring
      if (data.is_recurring && !data.frequency) return false
      return true
    },
    { message: 'Frequency is required for recurring entries', path: ['frequency'] }
  )

type FinancialEntryFormData = z.infer<typeof financialEntryFormSchema>

interface FinancialEntryFormProps {
  onSuccess?: () => void
}

export function FinancialEntryForm({ onSuccess }: FinancialEntryFormProps) {
  const { createEntry } = useFinancialEntryMutations()
  const { data: groups = [] } = useFinancialGroups()
  const { data: clients = [] } = useClients()

  const form = useForm<FinancialEntryFormData>({
    resolver: zodResolver(financialEntryFormSchema),
    defaultValues: {
      type: 'expense',
      name: '',
      group_id: null,
      amount: undefined,
      currency: 'USD',
      is_recurring: false,
      frequency: null,
      recurrence_day: null,
      start_date: new Date().toISOString().split('T')[0],
      end_date: null,
      client_id: null,
      vendor: '',
      reference_number: '',
      description: '',
    },
  })

  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const watchType = form.watch('type')
  const watchIsRecurring = form.watch('is_recurring')
  const watchFrequency = form.watch('frequency')

  // Filter groups by type
  const filteredGroups = groups.filter(
    (g) => g.type === 'both' || g.type === watchType
  )

  const groupOptions = filteredGroups.map((g) => ({
    value: g.id,
    label: g.name,
    description: g.type === 'both' ? 'All types' : g.type,
  }))

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.company_name || '',
  }))

  const showRecurrenceDay =
    watchIsRecurring &&
    watchFrequency &&
    ['monthly', 'quarterly', 'yearly'].includes(watchFrequency)

  const onSubmit = async (data: FinancialEntryFormData) => {
    await createEntry.mutateAsync({
      type: data.type,
      name: data.name.trim(),
      group_id: data.group_id || null,
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
      description: data.description?.trim() || null,
    })
    form.reset()
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Type</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={TYPE_OPTIONS}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  placeholder="Select type..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Name</FormLabel>
              <FormControl>
                <Input placeholder="GitHub Subscription, Client Retainer, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="group_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Group</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={groupOptions}
                  value={field.value || ''}
                  onValueChange={(value) => field.onChange(value || null)}
                  placeholder="Select group..."
                  emptyMessage="No groups found."
                  clearable
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={CURRENCY_OPTIONS}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || 'USD')}
                    placeholder="Select currency..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="is_recurring"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Recurring Entry</FormLabel>
                <FormDescription>Enable for repeating expenses or revenue</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {watchIsRecurring && (
          <>
            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Frequency</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={FREQUENCY_OPTIONS}
                      value={field.value || ''}
                      onValueChange={(value) => field.onChange(value || null)}
                      placeholder="Select frequency..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showRecurrenceDay && (
              <FormField
                control={form.control}
                name="recurrence_day"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Day of Month</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="1-31"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>Which day of the month this is due</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurrence End Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormDescription>Leave empty to recur indefinitely</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{watchIsRecurring ? 'Start Date' : 'Date'}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="client_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Linked Client</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={clientOptions}
                  value={field.value || ''}
                  onValueChange={(value) => field.onChange(value || null)}
                  placeholder="Internal (no client)"
                  emptyMessage="No clients found."
                  clearable
                />
              </FormControl>
              <FormDescription>
                Link to a client or leave empty for internal entries
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="vendor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendor / Source</FormLabel>
              <FormControl>
                <Input placeholder="GitHub Inc., Client ABC, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reference_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice / Reference #</FormLabel>
              <FormControl>
                <Input placeholder="INV-001, PO-12345" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional notes about this entry..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={createEntry.isPending}>
          {createEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Entry
        </Button>
      </form>
    </Form>
  )
}
