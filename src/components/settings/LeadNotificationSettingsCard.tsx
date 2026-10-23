import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leadIntakeSettingsApi } from '@/services/api/leadIntakeSettings'
import { useTenantStore } from '@/stores'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Loader2, Check, X, Plus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { isValidEmail } from '@/lib/security'
import type { LeadIntakeSettings, UpdateLeadIntakeSettingsInput } from '@/types/database'

/** Mirrors the CHECK constraints on lead_intake_settings (migration 072). */
const MAX_EMAILS = 20
const MAX_USERS = 50

const EMPTY: UpdateLeadIntakeSettingsInput = {
  notify_user_ids: [],
  notify_emails: [],
  mockup_task_assignee_id: null,
  notify_on_new_leads: true,
}

function toDraft(settings: LeadIntakeSettings | null | undefined): UpdateLeadIntakeSettingsInput {
  if (!settings) return EMPTY
  return {
    notify_user_ids: settings.notify_user_ids ?? [],
    notify_emails: settings.notify_emails ?? [],
    mockup_task_assignee_id: settings.mockup_task_assignee_id ?? null,
    notify_on_new_leads: settings.notify_on_new_leads ?? true,
  }
}

/**
 * Settings > Leads (org admins). Who is emailed when a new lead comes in, from the
 * website or added in LineUp, and who website mock-up tasks are assigned to.
 * Read by website-lead-intake and by the notify_lead_created trigger.
 */
export function LeadNotificationSettingsCard() {
  const { currentTenant } = useTenantStore()
  const { data: users } = useTenantUsers()
  const queryClient = useQueryClient()

  const { data: settings, isPending } = useQuery({
    queryKey: ['lead-intake-settings', currentTenant?.id],
    queryFn: () => leadIntakeSettingsApi.get(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })

  // Unsaved edits only; the form falls back to the fetched row.
  const [draft, setDraft] = useState<UpdateLeadIntakeSettingsInput | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  const form = draft ?? toDraft(settings)
  const update = (patch: Partial<UpdateLeadIntakeSettingsInput>) =>
    setDraft((current) => ({ ...(current ?? form), ...patch }))

  const save = useMutation({
    mutationFn: (values: UpdateLeadIntakeSettingsInput) =>
      leadIntakeSettingsApi.save(currentTenant!.id, values),
    onSuccess: () => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['lead-intake-settings'] })
      toast({ title: 'Lead notifications saved' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not save lead notifications',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Team members, by user_profiles.id (what the settings store)
  const memberOptions = useMemo(
    () =>
      (users || [])
        .filter((u) => u.user_profiles?.id)
        .map((u) => ({
          value: u.user_profiles!.id,
          label: u.user_profiles?.full_name || 'Unknown',
        })),
    [users]
  )
  const memberName = (id: string) =>
    memberOptions.find((o) => o.value === id)?.label ?? 'Former member'
  const addableMembers = memberOptions.filter((o) => !form.notify_user_ids.includes(o.value))

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address')
      return
    }
    if (form.notify_emails.includes(email)) {
      setEmailError('That address is already on the list')
      return
    }
    if (form.notify_emails.length >= MAX_EMAILS) {
      setEmailError(`Up to ${MAX_EMAILS} extra addresses`)
      return
    }
    update({ notify_emails: [...form.notify_emails, email] })
    setEmailInput('')
    setEmailError(null)
  }

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Leads
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

  const nobodyNotified = form.notify_user_ids.length === 0 && form.notify_emails.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Leads
        </CardTitle>
        <CardDescription>
          Who hears about new leads, and who website mock-up requests are assigned to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Team members */}
        <div className="space-y-2">
          <Label>Team members to notify</Label>
          <p className="text-xs text-muted-foreground">
            Each gets an email at their login address when a new lead comes in.
          </p>
          {form.notify_user_ids.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.notify_user_ids.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                  {memberName(id)}
                  <button
                    type="button"
                    className="rounded-sm p-1 hover:bg-muted coarse:min-h-touch coarse:min-w-touch"
                    aria-label={`Stop notifying ${memberName(id)}`}
                    onClick={() =>
                      update({ notify_user_ids: form.notify_user_ids.filter((u) => u !== id) })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="max-w-sm">
            <SearchableSelect
              options={addableMembers}
              value=""
              onValueChange={(value) => {
                if (value && form.notify_user_ids.length < MAX_USERS) {
                  update({ notify_user_ids: [...form.notify_user_ids, value] })
                }
              }}
              placeholder="Add a team member..."
              searchPlaceholder="Search team..."
              emptyMessage="No more team members."
              disabled={addableMembers.length === 0}
            />
          </div>
        </div>

        {/* Extra addresses */}
        <div className="space-y-2">
          <Label htmlFor="lead-notify-email">Other email addresses</Label>
          <p className="text-xs text-muted-foreground">
            For people outside LineUp or a shared inbox. Up to {MAX_EMAILS}.
          </p>
          {form.notify_emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.notify_emails.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  <button
                    type="button"
                    className="rounded-sm p-1 hover:bg-muted coarse:min-h-touch coarse:min-w-touch"
                    aria-label={`Remove ${email}`}
                    onClick={() =>
                      update({ notify_emails: form.notify_emails.filter((e) => e !== email) })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex max-w-sm gap-2">
            <Input
              id="lead-notify-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value)
                setEmailError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEmail()
                }
              }}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'lead-notify-email-error' : undefined}
            />
            <Button type="button" variant="outline" onClick={addEmail}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          {emailError && (
            <p id="lead-notify-email-error" className="text-xs text-destructive">
              {emailError}
            </p>
          )}
        </div>

        {nobodyNotified && (
          <p className="text-sm text-muted-foreground">
            Nobody is on the list yet. Website requests still go to the address set on the intake
            function; leads added in LineUp send no email.
          </p>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="lead-notify-all" className="font-normal">
              Email for leads added in LineUp too
            </Label>
            <p className="text-xs text-muted-foreground">
              Leads created by hand, imports and automations. Website requests always send an
              email.
            </p>
          </div>
          <Switch
            id="lead-notify-all"
            checked={form.notify_on_new_leads}
            onCheckedChange={(checked) => update({ notify_on_new_leads: checked })}
            className="mt-0.5 shrink-0"
          />
        </div>

        <Separator />

        {/* Mock-up task assignee */}
        <div className="space-y-2">
          <Label>Assign website mock-up tasks to</Label>
          <p className="text-xs text-muted-foreground">
            When someone asks for a free mock-up on the website, the task on the new lead goes to
            this person. Leave it empty to use the intake function's user.
          </p>
          <div className="max-w-sm">
            <SearchableSelect
              options={memberOptions}
              value={form.mockup_task_assignee_id ?? ''}
              onValueChange={(value) => update({ mockup_task_assignee_id: value || null })}
              placeholder="The intake user (default)"
              searchPlaceholder="Search team..."
              emptyMessage="No team members found."
              clearable
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending || draft === null}>
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save lead notifications
          </Button>
          {draft !== null && !save.isPending && (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard changes
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
