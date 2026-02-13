import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCreateContact } from '@/hooks/useContacts'
import { useClients } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { ContactRole } from '@/types/database'
import { Loader2 } from 'lucide-react'
import { CONTACT_ROLE_OPTIONS } from '@/lib/utils'

const contactFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.string().optional(),
  client_id: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

interface ContactFormProps {
  defaultValues?: Partial<ContactFormValues>
  onSuccess?: () => void
}

export function ContactForm({ defaultValues, onSuccess }: ContactFormProps) {
  const createContact = useCreateContact()
  const { data: clients } = useClients()

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: '',
      client_id: '',
      ...defaultValues,
    },
  })

  const onSubmit = async (data: ContactFormValues) => {
    await createContact.mutateAsync({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      role: (data.role as ContactRole) || undefined,
      client_id: data.client_id || undefined,
    })
    form.reset()
    onSuccess?.()
  }

  const clientOptions = clients?.map((c) => ({
    value: c.id,
    label: c.name,
  })) || []

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input placeholder="John" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="john@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="+1 (555) 123-4567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <SearchableSelect
                  options={[...CONTACT_ROLE_OPTIONS]}
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  placeholder="Select role..."
                  clearable
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link to Client</FormLabel>
                <SearchableSelect
                  options={clientOptions}
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  placeholder="Select client..."
                  clearable
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={createContact.isPending}>
            {createContact.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Contact
          </Button>
        </div>
      </form>
    </Form>
  )
}
