import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePassword, usePasswordMutations } from '@/hooks/usePasswords'
import { passwordsApi } from '@/services/api'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AuditTrail } from '@/components/shared/AuditTrail'
import type { UserProfile } from '@/types/database'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { DeleteRecordButton } from '@/components/shared'
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
  ScrollText,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { copySecret, secretClipboardTtlSeconds } from '@/lib/clipboard'

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
  // Blank means "keep the stored password". The field can no longer be
  // pre-filled, because the secret is not sent to the browser with the record.
  password: z.string().optional(),
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
  const { updatePassword, deletePassword } = usePasswordMutations()

  // Access history. Readable by the tenant's admins only (RLS), and refetched
  // after a reveal so the entry the user just generated shows up.
  const { data: accessLog, refetch: refetchAccessLog } = useQuery({
    queryKey: ['password', 'access-log', passwordId],
    queryFn: () => passwordsApi.getAccessLog(passwordId!),
    enabled: !!passwordId,
  })

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPasswordRevealed, setIsPasswordRevealed] = useState(false)
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  // The decrypted secret, held only while the user is looking at it.
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [isFetchingSecret, setIsFetchingSecret] = useState(false)

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
        // The secret is not shipped with the record. The field starts empty and
        // is only submitted when the user actually types a new password.
        password: '',
        category: password.category || '',
        notes: password.notes || '',
        password_changed_at: password.password_changed_at?.split('T')[0] || '',
      })
      setRevealedSecret(null)
      setIsPasswordRevealed(false)
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
      // An empty password field means "leave the stored secret alone". The
      // field cannot be pre-filled, so this is the only safe interpretation.
      const newSecret = data.password?.trim() ?? ''
      const updateData: Record<string, unknown> = {
        id: passwordId,
        application_name: data.application_name,
        url: data.url?.trim() || null,
        username: data.username?.trim() || null,
        email: data.email?.trim() || null,
        category: data.category || null,
        notes: data.notes || null,
      }

      if (newSecret) {
        updateData.password = newSecret
        // password_set_secret stamps password_changed_at server-side.
      } else if (data.password_changed_at) {
        updateData.password_changed_at = data.password_changed_at
      }

      await updatePassword.mutateAsync(updateData as { id: string })
      setIsEditing(false)
      setShowPasswordInput(false)
      setRevealedSecret(null)
      setIsPasswordRevealed(false)
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
      password: '',
      category: password?.category || '',
      notes: password?.notes || '',
      password_changed_at: password?.password_changed_at?.split('T')[0] || '',
    })
    setIsEditing(false)
    setShowPasswordInput(false)
  }

  /**
   * Fetches the decrypted secret once and caches it for this page view.
   * Each call to the server is written to the password access log.
   */
  const fetchSecret = async (): Promise<string | null> => {
    if (!passwordId) return null
    if (revealedSecret !== null) return revealedSecret

    setIsFetchingSecret(true)
    try {
      const secret = await passwordsApi.reveal(passwordId)
      setRevealedSecret(secret)
      void refetchAccessLog()
      return secret
    } catch (error) {
      toast({
        title: 'Could not retrieve the password',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      })
      return null
    } finally {
      setIsFetchingSecret(false)
    }
  }

  const handleToggleReveal = async () => {
    if (isPasswordRevealed) {
      // Drop the plaintext from memory when hiding it again.
      setIsPasswordRevealed(false)
      setRevealedSecret(null)
      return
    }
    const secret = await fetchSecret()
    if (secret !== null) setIsPasswordRevealed(true)
  }

  const handleCopyPassword = async () => {
    const secret = await fetchSecret()
    if (secret === null) return

    const copied = await copySecret(secret)
    toast({
      title: copied ? 'Password copied' : 'Could not copy',
      description: copied
        ? `Cleared from the clipboard automatically in ${secretClipboardTtlSeconds()} seconds.`
        : 'Your browser blocked clipboard access. Reveal the password and copy it manually.',
      variant: copied ? undefined : 'destructive',
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-2 md:items-center md:gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <Lock className="h-6 w-6 shrink-0 text-muted-foreground" />
            <h1 className="text-xl leading-tight sm:text-2xl md:text-3xl font-bold tracking-tight break-words min-w-0">
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
          <div className="flex flex-wrap justify-end gap-2 mb-6">
            {isEditing ? (
              <>
                <DeleteRecordButton
                  entityName="password"
                  recordName={password.application_name}
                  onDelete={() => deletePassword.mutateAsync(password.id)}
                  redirectTo="/passwords"
                  disabled={isSaving}
                />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
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
                        placeholder="Leave blank to keep the current password"
                        autoComplete="new-password"
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
                        {isPasswordRevealed && revealedSecret !== null
                          ? revealedSecret
                          : '••••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isFetchingSecret}
                        title={
                          isPasswordRevealed
                            ? 'Hide'
                            : 'Reveal (recorded in the access log)'
                        }
                        onClick={() => void handleToggleReveal()}
                      >
                        {isFetchingSecret ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isPasswordRevealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isFetchingSecret}
                        title="Copy (recorded in the access log)"
                        onClick={() => void handleCopyPassword()}
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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
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

            {/* Credential access log */}
            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Access history</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Every reveal, copy and change of this credential. The log is
                append-only and cannot be edited or deleted from the app.
              </p>
              {!accessLog?.length ? (
                <p className="text-sm text-muted-foreground">
                  No access recorded yet.
                </p>
              ) : (
                <div className="rounded-md border divide-y">
                  {accessLog.slice(0, 15).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {entry.action}
                        </Badge>
                        <span>{entry.user?.full_name ?? 'Unknown user'}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatDateTime(entry.accessed_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
