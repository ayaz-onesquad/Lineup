import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRequirementMutations } from '@/hooks/useRequirements'
import { useSets } from '@/hooks/useSets'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

const requirementSchema = z.object({
  set_id: z.string().min(1, 'Set is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  requirement_type: z.enum([
    'task',
    'open_item',
    'technical',
    'support',
    'internal_deliverable',
    'client_deliverable',
  ]),
  due_date: z.string().optional(),
  estimated_hours: z.coerce.number().optional(),
  assigned_to_id: z.string().optional(),
  requires_document: z.boolean(),
  requires_review: z.boolean(),
  show_in_client_portal: z.boolean(),
})

type RequirementFormData = z.infer<typeof requirementSchema>

interface RequirementFormProps {
  defaultValues?: Partial<RequirementFormData>
  onSuccess?: () => void
}

export function RequirementForm({ defaultValues, onSuccess }: RequirementFormProps) {
  const { createRequirement } = useRequirementMutations()
  const { data: sets } = useSets()
  const { data: users } = useTenantUsers()

  const form = useForm<RequirementFormData>({
    resolver: zodResolver(requirementSchema),
    defaultValues: {
      set_id: defaultValues?.set_id || '',
      title: '',
      description: '',
      requirement_type: 'task',
      due_date: '',
      estimated_hours: undefined,
      assigned_to_id: '',
      requires_document: false,
      requires_review: false,
      show_in_client_portal: false,
    },
  })

  const onSubmit = async (data: RequirementFormData) => {
    await createRequirement.mutateAsync(data)
    form.reset()
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="set_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Set</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a set" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sets?.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.projects?.name} - {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Create homepage mockup" {...field} />
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
                  placeholder="Describe the requirement..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="requirement_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="open_item">Open Item</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="internal_deliverable">Internal Deliverable</SelectItem>
                    <SelectItem value="client_deliverable">Client Deliverable</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="assigned_to_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assign To</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.user_profiles?.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estimated_hours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Hours</FormLabel>
                <FormControl>
                  <Input type="number" step="0.5" placeholder="4" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-3">
          <FormField
            control={form.control}
            name="requires_document"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Requires Document</FormLabel>
                  <FormDescription>
                    A document must be attached to complete this requirement
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="requires_review"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Requires Review</FormLabel>
                  <FormDescription>
                    This requirement needs to be reviewed before completion
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="show_in_client_portal"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Show in Client Portal</FormLabel>
                  <FormDescription>
                    Make this requirement visible to the client
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={createRequirement.isPending}>
          {createRequirement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Requirement
        </Button>
      </form>
    </Form>
  )
}
