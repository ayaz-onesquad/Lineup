import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionSecurityApi } from '@/services/api/sessionSecurity'
import { useAuthStore, useTenantStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Timer, Loader2, Check, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { TenantSecuritySettings } from '@/types/database'

/** Mirrors the CHECK constraints on tenant_security_settings (migration 068). */
const LIMITS = {
  idle_timeout_minutes: { min: 5, max: 480 },
  absolute_session_hours: { min: 1, max: 720 },
  warn_before_logout_seconds: { min: 15, max: 600 },
  remember_device_days: { min: 1, max: 90 },
  signed_url_ttl_seconds: { min: 30, max: 3600 },
} as const

type NumericField = keyof typeof LIMITS

interface FormState {
  idle_timeout_minutes: number
  absolute_session_hours: number
  warn_before_logout_seconds: number
  remember_device_days: number
  signed_url_ttl_seconds: number
  allow_remember_device: boolean
  block_document_download: boolean
}

function toFormState(settings: TenantSecuritySettings): FormState {
  return {
    idle_timeout_minutes: settings.idle_timeout_minutes,
    absolute_session_hours: settings.absolute_session_hours,
    warn_before_logout_seconds: settings.warn_before_logout_seconds,
    remember_device_days: settings.remember_device_days,
    signed_url_ttl_seconds: settings.signed_url_ttl_seconds,
    allow_remember_device: settings.allow_remember_device,
    block_document_download: settings.block_document_download,
  }
}

/**
 * Lets an OrgAdmin set how long a session may live and how documents may be
 * handled. The client reads these values through `get_effective_session_policy`
 * and enforces them, so tightening them here takes effect for every member on
 * their next policy refresh.
 */
export function SessionPolicyCard() {
  const { currentTenant } = useTenantStore()
  const { user } = useAuthStore()
  const { role } = useUserRole()
  const queryClient = useQueryClient()

  const isAdmin = role === 'org_admin' || role === 'sys_admin'

  const { data: settings, isPending } = useQuery({
    queryKey: ['tenant-security-settings', currentTenant?.id],
    queryFn: () => sessionSecurityApi.getTenantSettings(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })

  // `draft` holds unsaved edits only. The displayed form falls back to the
  // fetched row, so no effect is needed to copy server state into component
  // state (which would cause a cascading render on every refetch).
  const [draft, setDraft] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Partial<Record<NumericField, string>>>({})

  const form: FormState | null = draft ?? (settings ? toFormState(settings) : null)

  const save = useMutation({
    mutationFn: (values: FormState) =>
      sessionSecurityApi.updateTenantSettings(currentTenant!.id, user!.id, values),
    onSuccess: () => {
      // Drop the draft so the freshly saved server row becomes the source of truth.
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['tenant-security-settings'] })
      // Every member's enforcement reads from this query.
      queryClient.invalidateQueries({ queryKey: ['session-policy'] })
      toast({
        title: 'Session policy updated',
        description: 'The new limits apply the next time each member’s session is checked.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not save the session policy',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const setNumber = (field: NumericField, raw: string) => {
    if (!form) return
    const value = Number(raw)
    setDraft(current => ({ ...(current ?? form), [field]: value }))

    const { min, max } = LIMITS[field]
    setErrors(prev => ({
      ...prev,
      [field]:
        !Number.isFinite(value) || value < min || value > max
          ? `Must be between ${min} and ${max}`
          : undefined,
    }))
  }

  const hasErrors = Object.values(errors).some(Boolean)

  if (isPending || !form) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Session Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          Session Policy
        </CardTitle>
        <CardDescription>
          How long a signed-in session may last. Everyone in this organisation is
          signed out automatically once either limit is reached.
          {!isAdmin && ' Only an organisation administrator can change these.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            id="idle-timeout"
            label="Idle timeout"
            unit="minutes"
            value={form.idle_timeout_minutes}
            min={LIMITS.idle_timeout_minutes.min}
            max={LIMITS.idle_timeout_minutes.max}
            error={errors.idle_timeout_minutes}
            disabled={!isAdmin}
            onChange={v => setNumber('idle_timeout_minutes', v)}
            help="No mouse, keyboard or touch activity for this long ends the session."
          />

          <NumberField
            id="absolute-session"
            label="Maximum session length"
            unit="hours"
            value={form.absolute_session_hours}
            min={LIMITS.absolute_session_hours.min}
            max={LIMITS.absolute_session_hours.max}
            error={errors.absolute_session_hours}
            disabled={!isAdmin}
            onChange={v => setNumber('absolute_session_hours', v)}
            help="A hard cap measured from sign-in. Activity does not extend it."
          />

          <NumberField
            id="warn-before"
            label="Warn before sign-out"
            unit="seconds"
            value={form.warn_before_logout_seconds}
            min={LIMITS.warn_before_logout_seconds.min}
            max={LIMITS.warn_before_logout_seconds.max}
            error={errors.warn_before_logout_seconds}
            disabled={!isAdmin}
            onChange={v => setNumber('warn_before_logout_seconds', v)}
            help="How much notice the countdown dialog gives."
          />

          <NumberField
            id="remember-days"
            label="Keep signed in for"
            unit="days"
            value={form.remember_device_days}
            min={LIMITS.remember_device_days.min}
            max={LIMITS.remember_device_days.max}
            error={errors.remember_device_days}
            disabled={!isAdmin || !form.allow_remember_device}
            onChange={v => setNumber('remember_device_days', v)}
            help="Replaces the maximum session length when a member ticks “Keep me signed in”. The idle timeout still applies."
          />
        </div>

        <ToggleRow
          id="allow-remember"
          label="Allow “Keep me signed in on this device”"
          help="Turn this off to apply the maximum session length to everyone, with no opt-out."
          checked={form.allow_remember_device}
          disabled={!isAdmin}
          onChange={checked =>
              setDraft(current => ({ ...(current ?? form), allow_remember_device: checked }))
          }
        />

        <Separator />

        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Document handling</h4>
        </div>

        <ToggleRow
          id="block-downloads"
          label="Block all document downloads"
          help="An organisation-wide override. Documents can still be read in the app, but no download link is ever issued, even for documents marked downloadable."
          checked={form.block_document_download}
          disabled={!isAdmin}
          onChange={checked =>
              setDraft(current => ({ ...(current ?? form), block_document_download: checked }))
          }
        />

        <NumberField
          id="signed-url-ttl"
          label="Document link lifetime"
          unit="seconds"
          value={form.signed_url_ttl_seconds}
          min={LIMITS.signed_url_ttl_seconds.min}
          max={LIMITS.signed_url_ttl_seconds.max}
          error={errors.signed_url_ttl_seconds}
          disabled={!isAdmin}
          onChange={v => setNumber('signed_url_ttl_seconds', v)}
          help="How long a generated document link stays valid. Shorter is safer: a copied link stops working sooner."
        />

        {isAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => form && save.mutate(form)}
              disabled={save.isPending || hasErrors}
            >
              {save.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Save Session Policy
                </>
              )}
            </Button>
            {settings && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null)
                  setErrors({})
                }}
                disabled={save.isPending}
              >
                Reset
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NumberField({
  id,
  label,
  unit,
  value,
  min,
  max,
  error,
  disabled,
  onChange,
  help,
}: {
  id: string
  label: string
  unit: string
  value: number
  min: number
  max: number
  error?: string
  disabled?: boolean
  onChange: (value: string) => void
  help: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="max-w-[120px]"
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{help}</p>
      )}
    </div>
  )
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  help: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}
