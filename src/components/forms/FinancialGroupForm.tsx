import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useFinancialGroupMutations } from '@/hooks/useFinancials'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'
import type { FinancialGroup } from '@/types/database'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense', description: 'For expense entries only' },
  { value: 'revenue', label: 'Revenue', description: 'For revenue entries only' },
  { value: 'both', label: 'Both', description: 'For all entry types' },
]

const COLOR_OPTIONS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6b7280', label: 'Gray' },
]

const financialGroupFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['expense', 'revenue', 'both'], { required_error: 'Type is required' }),
  color: z.string().optional().nullable(),
})

type FinancialGroupFormData = z.infer<typeof financialGroupFormSchema>

interface FinancialGroupFormProps {
  group?: FinancialGroup | null
  onSuccess?: () => void
  onCancel?: () => void
}

export function FinancialGroupForm({ group, onSuccess, onCancel }: FinancialGroupFormProps) {
  const { createGroup, updateGroup } = useFinancialGroupMutations()
  const isEditing = !!group

  const form = useForm<FinancialGroupFormData>({
    resolver: zodResolver(financialGroupFormSchema),
    defaultValues: {
      name: group?.name || '',
      type: group?.type || 'expense',
      color: group?.color || null,
    },
  })

  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const onSubmit = async (data: FinancialGroupFormData) => {
    if (isEditing && group) {
      await updateGroup.mutateAsync({
        id: group.id,
        name: data.name.trim(),
        type: data.type,
        color: data.color || null,
      })
    } else {
      await createGroup.mutateAsync({
        name: data.name.trim(),
        type: data.type,
        color: data.color || null,
      })
    }
    form.reset()
    onSuccess?.()
  }

  const isPending = createGroup.isPending || updateGroup.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Name</FormLabel>
              <FormControl>
                <Input placeholder="SaaS Tools, Client Revenue, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <SearchableSelect
                    options={COLOR_OPTIONS.map((c) => ({
                      ...c,
                      description: c.value,
                    }))}
                    value={field.value || ''}
                    onValueChange={(value) => field.onChange(value || null)}
                    placeholder="Select color..."
                    clearable
                  />
                  {field.value && (
                    <div
                      className="h-8 w-8 rounded border"
                      style={{ backgroundColor: field.value }}
                    />
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Update Group' : 'Create Group'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
