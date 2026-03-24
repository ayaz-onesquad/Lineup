import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePasswordMutations } from '@/hooks/usePasswords'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const CATEGORY_OPTIONS = [
  { value: 'Internal', label: 'Internal', description: 'Internal tools and services' },
  { value: 'Client Tools', label: 'Client Tools', description: 'Client-specific accounts' },
  { value: 'Finance', label: 'Finance', description: 'Financial and billing services' },
  { value: 'Development', label: 'Development', description: 'Development tools and APIs' },
  { value: 'Infrastructure', label: 'Infrastructure', description: 'Cloud and hosting services' },
  { value: 'Marketing', label: 'Marketing', description: 'Marketing platforms' },
  { value: 'Other', label: 'Other', description: 'Miscellaneous credentials' },
]

const passwordFormSchema = z.object({
  application_name: z.string().min(1, 'Application name is required'),
  url: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  password: z.string().min(1, 'Password is required'),
  category: z.string().optional(),
  notes: z.string().optional(),
})

type PasswordFormData = z.infer<typeof passwordFormSchema>

interface PasswordFormProps {
  onSuccess?: () => void
}

export function PasswordForm({ onSuccess }: PasswordFormProps) {
  const { createPassword } = usePasswordMutations()
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      application_name: '',
      url: '',
      username: '',
      email: '',
      password: '',
      category: '',
      notes: '',
    },
  })

  // Scroll to first error on validation failure
  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const onSubmit = async (data: PasswordFormData) => {
    await createPassword.mutateAsync({
      application_name: data.application_name,
      url: data.url?.trim() || null,
      username: data.username?.trim() || null,
      email: data.email?.trim() || null,
      password: data.password.trim(), // Strip whitespace per CLAUDE.md
      category: data.category || null,
      notes: data.notes || null,
    })
    form.reset()
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-4">
        <FormField
          control={form.control}
          name="application_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Application Name</FormLabel>
              <FormControl>
                <Input placeholder="AWS Console, Stripe, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL / Login Link</FormLabel>
              <FormControl>
                <Input placeholder="https://console.aws.amazon.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="admin" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="admin@company.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.trim())}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={CATEGORY_OPTIONS}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value || '')}
                  placeholder="Select category..."
                  searchPlaceholder="Search or type custom..."
                  emptyMessage="No categories found."
                  clearable
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional notes about this credential..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={createPassword.isPending}>
          {createPassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Password
        </Button>
      </form>
    </Form>
  )
}
