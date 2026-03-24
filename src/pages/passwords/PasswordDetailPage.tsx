import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePassword, usePasswordMutations } from '@/hooks/usePasswords'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AuditTrail } from '@/components/shared/AuditTrail'
import type { UserProfile } from '@/types/database'
import { ViewEditField } from '@/components/shared/ViewEditField'
import {
  ArrowLeft,
  Lock,
  Shield,
  KeyRound,
  Tag,
  Edit,
  X,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react'
// formatDate removed - not used in this component
import { toast } from '@/hooks/use-toast'

const CATEGORY_OPTIONS = [
  { value: 'Internal', label: 'Internal' },
  { value: 'Client Tools', label: 'Client Tools' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Development', label: 'Development' },
  { value: 'Infrastructure', label: 'Infrastructure' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Other', label: 'Other' },
]

const passwordDetailSchema = z.object({
  application_name: z.string().min(1, 'Application name is required'),
  url: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  password: z.string().min(1, 'Password is required'),
  category: z.string().optional(),
  notes: z.string().optional(),
  password_changed_at: z.string().optional(),
})

type PasswordDetailFormValues = z.infer<typeof passwordDetailSchema>

export function PasswordDetailPage() {
  const { passwordId } = useParams<{ passwordId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: password, isLoading } = usePassword(passwordId!)
  const { updatePassword } = usePasswordMutations()

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPasswordRevealed, setIsPasswordRevealed] = useState(false)
  const [showPasswordInput, setShowPasswordInput] = useState(false)

  // Store original password to detect changes
  const originalPasswordRef = useRef<string>('')

  const form = useForm<PasswordDetailFormValues>({
    resolver: zodResolver(passwordDetailSchema),
    defaultValues: {
      application_name: '',
      url: '',
      username: '',
      email: '',
      password: '',
      category: '',
      notes: '',
      password_changed_at: '',
    },
  })

  // Reset form when password data loads
  useEffect(() => {
    if (password && !isEditing) {
      form.reset({
        application_name: password.application_name,
        url: password.url || '',
        username: password.username || '',
        email: password.email || '',
        password: password.password,
        category: password.category || '',
        notes: password.notes || '',
        password_changed_at: password.password_changed_at?.split('T')[0] || '',
      })
      originalPasswordRef.current = password.password
    }
  }, [password?.id, password?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && password && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, password])

  const handleSave = async (data: PasswordDetailFormValues) => {
    if (!passwordId) return
    setIsSaving(true)
    try {
      // Check if password changed and auto-update password_changed_at
      const passwordChanged = data.password !== originalPasswordRef.current
      const updateData: Record<string, unknown> = {
        id: passwordId,
        application_name: data.application_name,
        url: data.url?.trim() || null,
        username: data.username?.trim() || null,
        email: data.email?.trim() || null,
        password: data.password.trim(),
        category: data.category || null,
        notes: data.notes || null,
      }

      // Auto-set password_changed_at if password was modified
      if (passwordChanged) {
        updateData.password_changed_at = new Date().toISOString().split('T')[0]
      } else if (data.password_changed_at) {
        updateData.password_changed_at = data.password_changed_at
      }

      await updatePassword.mutateAsync(updateData as { id: string })
      setIsEditing(false)
      setShowPasswordInput(false)
      originalPasswordRef.current = data.password
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      application_name: password?.application_name || '',
      url: password?.url || '',
      username: password?.username || '',
      email: password?.email || '',
      password: password?.password || '',
      category: password?.category || '',
      notes: password?.notes || '',
      password_changed_at: password?.password_changed_at?.split('T')[0] || '',
    })
    setIsEditing(false)
    setShowPasswordInput(false)
  }

  const handleCopyPassword = () => {
    if (password?.password) {
      navigator.clipboard.writeText(password.password)
      toast({
        title: 'Password copied',
        description: 'Password copied to clipboard.',
      })
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

  if (!password) {
    return (
      <div className="text-center py-12">
        <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Password not found</p>
        <Button variant="link" onClick={() => navigate('/passwords')}>
          Back to Password Manager
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
            <Lock className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('application_name') : password.application_name}
            </h1>
            <Badge variant="outline" className="font-mono">
              PWD-{String(password.display_id).padStart(4, '0')}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {password.category || 'Uncategorized'}
          </p>
        </div>
      </div>

      {/* Main Card */}
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

          {/* Credentials Section */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                Credentials
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <ViewEditField
                  type="text"
                  label="Application Name"
                  required
                  isEditing={isEditing}
                  value={form.watch('application_name')}
                  onChange={(v) => form.setValue('application_name', v)}
                  error={form.formState.errors.application_name?.message}
                />
                <ViewEditField
                  type="text"
                  label="URL / Login Link"
                  isEditing={isEditing}
                  value={form.watch('url') || ''}
                  onChange={(v) => form.setValue('url', v)}
                />
                <ViewEditField
                  type="text"
                  label="Username"
                  isEditing={isEditing}
                  value={form.watch('username') || ''}
                  onChange={(v) => form.setValue('username', v)}
                />
                <ViewEditField
                  type="text"
                  label="Email Address"
                  isEditing={isEditing}
                  value={form.watch('email') || ''}
                  onChange={(v) => form.setValue('email', v)}
                />
              </div>
            </div>

            {/* Password Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
                Password
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Password <span className="text-red-500">*</span>
                  </label>
                  {isEditing ? (
                    <div className="relative mt-1">
                      <Input
                        type={showPasswordInput ? 'text' : 'password'}
                        value={form.watch('password')}
                        onChange={(e) => form.setValue('password', e.target.value.trim())}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPasswordInput(!showPasswordInput)}
                      >
                        {showPasswordInput ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1 h-9">
                      <span className="font-mono">
                        {isPasswordRevealed ? password.password : '••••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setIsPasswordRevealed(!isPasswordRevealed)}
                      >
                        {isPasswordRevealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleCopyPassword}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <ViewEditField
                  type="date"
                  label="Password Last Rotated"
                  isEditing={isEditing}
                  value={form.watch('password_changed_at') || ''}
                  onChange={(v) => form.setValue('password_changed_at', v)}
                />
              </div>
            </div>

            {/* Organization Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag className="h-5 w-5 text-muted-foreground" />
                Organization
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Category
                  </label>
                  {isEditing ? (
                    <div className="mt-1">
                      <SearchableSelect
                        options={CATEGORY_OPTIONS}
                        value={form.watch('category') || ''}
                        onValueChange={(value) => form.setValue('category', value || '')}
                        placeholder="Select category..."
                        searchPlaceholder="Search categories..."
                        emptyMessage="No categories found."
                        clearable
                      />
                    </div>
                  ) : (
                    <p className="mt-1 font-medium">
                      {password.category || <span className="text-muted-foreground">—</span>}
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <ViewEditField
                    type="textarea"
                    label="Notes"
                    isEditing={isEditing}
                    value={form.watch('notes') || ''}
                    onChange={(v) => form.setValue('notes', v)}
                    placeholder="Additional notes about this credential..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Audit Trail */}
            <div className="pt-4 border-t">
              <AuditTrail
                created_at={password.created_at}
                created_by={password.created_by || ''}
                updated_at={password.updated_at}
                updated_by={password.updated_by || undefined}
                creator={password.creator as UserProfile | undefined}
                updater={password.updater as UserProfile | undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
