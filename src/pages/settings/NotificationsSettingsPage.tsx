import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Bell,
  Edit,
  Save,
  Loader2,
  Info,
  RotateCcw,
  Trash2,
  Plus,
  UserPlus,
  CheckCircle2,
  XCircle,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { NotificationTemplateEditor } from '@/components/shared/NotificationTemplateEditor'
import { useTenantStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { useTenantUsers } from '@/hooks/useTenant'
import {
  useNotificationTemplates,
  useTenantNotificationSettings,
  useUpsertTenantNotificationSetting,
  useNotificationSubscriptions,
  useAddNotificationSubscription,
  useRemoveNotificationSubscription,
  useTenantNotificationLogStats,
  useTenantNotificationLog,
  useTenantNotificationLogTriggerKeys,
} from '@/hooks/useNotifications'
import { cn, formatDate, getInitials } from '@/lib/utils'
import type {
  TenantNotificationSettingWithTemplate,
  NotificationLogFilters,
} from '@/types/notifications'

// Category definitions for grouping notifications
const NOTIFICATION_CATEGORIES: Record<string, { label: string; triggers: string[] }> = {
  system: {
    label: 'System Notifications',
    triggers: ['user.welcome'],
  },
  task: {
    label: 'Task Notifications',
    triggers: ['task.assigned'],
  },
  digest: {
    label: 'Digest Notifications',
    triggers: ['daily.summary', 'weekly.summary'],
  },
  discussion: {
    label: 'Discussion Notifications',
    triggers: ['discussion.post', 'discussion.reply'],
  },
}

// Merged row type for the table
interface MergedNotificationRow {
  id: string
  templateId: string
  triggerKey: string
  name: string
  description: string | null
  subject: string
  htmlBody: string
  availableVariables: Record<string, string>
  globalIsActive: boolean
  tenantIsActive: boolean
  hasOverride: boolean
  customSubject: string | null
  customHtmlBody: string | null
  tenantSettingId: string | null
  tenantUpdatedAt: string | null
  category: string
}

export function NotificationsSettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { role, isLoading: roleLoading } = useUserRole()
  const tenantId = currentTenant?.id

  // Check if user is org_admin
  const isOrgAdmin = role === 'org_admin' || role === 'sys_admin'

  // Redirect non-admins
  if (!roleLoading && !isOrgAdmin) {
    navigate('/dashboard', { replace: true })
    return null
  }

  // State for template editing
  const [selectedRow, setSelectedRow] = useState<MergedNotificationRow | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editedSubject, setEditedSubject] = useState('')
  const [editedHtmlBody, setEditedHtmlBody] = useState('')
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [togglingRowId, setTogglingRowId] = useState<string | null>(null)

  // State for subscriptions
  const [isAddSubscriberOpen, setIsAddSubscriberOpen] = useState(false)
  const [subscriberUserId, setSubscriberUserId] = useState<string>('')
  const [subscriberTrigger, setSubscriberTrigger] = useState<string>('')
  const [removingSubscriptionId, setRemovingSubscriptionId] = useState<string | null>(null)

  // State for Send Log tab
  const [logSearch, setLogSearch] = useState('')
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'sent' | 'failed'>('all')
  const [logTriggerFilter, setLogTriggerFilter] = useState<string | undefined>(undefined)
  const [logPage, setLogPage] = useState(1)
  const [expandedLogRows, setExpandedLogRows] = useState<Set<string>>(new Set())

  // Build log filters object
  const logFilters: NotificationLogFilters = useMemo(
    () => ({
      search: logSearch || undefined,
      status: logStatusFilter === 'all' ? null : logStatusFilter,
      triggerKey: logTriggerFilter || null,
    }),
    [logSearch, logStatusFilter, logTriggerFilter]
  )

  // Queries
  const { data: globalTemplates, isLoading: isLoadingTemplates } = useNotificationTemplates()
  const { data: tenantSettings, isLoading: isLoadingSettings } = useTenantNotificationSettings(tenantId)
  const { data: subscriptions, isLoading: isLoadingSubscriptions } = useNotificationSubscriptions(tenantId)
  const { data: tenantUsers, isLoading: isLoadingUsers } = useTenantUsers(tenantId)

  // Send Log queries
  const { data: logStats, isLoading: isLoadingLogStats, refetch: refetchLogStats } = useTenantNotificationLogStats(tenantId)
  const { data: logPageData, isLoading: isLoadingLogPage, refetch: refetchLogPage } = useTenantNotificationLog(tenantId, logFilters, logPage)
  const { data: logTriggerKeys } = useTenantNotificationLogTriggerKeys(tenantId)

  // Mutations
  const upsertSetting = useUpsertTenantNotificationSetting()
  const addSubscription = useAddNotificationSubscription()
  const removeSubscription = useRemoveNotificationSubscription()

  // Build merged rows
  const mergedRows = useMemo<MergedNotificationRow[]>(() => {
    if (!globalTemplates) return []

    return globalTemplates.map((template) => {
      const tenantSetting = tenantSettings?.find((s) => s.trigger_key === template.trigger_key)

      // Determine category
      let category = 'other'
      for (const [cat, config] of Object.entries(NOTIFICATION_CATEGORIES)) {
        if (config.triggers.includes(template.trigger_key)) {
          category = cat
          break
        }
      }

      return {
        id: tenantSetting?.id || template.id,
        templateId: template.id,
        triggerKey: template.trigger_key,
        name: template.name,
        description: template.description,
        subject: template.subject,
        htmlBody: template.html_body,
        availableVariables: template.available_variables,
        globalIsActive: template.is_active,
        tenantIsActive: tenantSetting?.is_active ?? template.is_active,
        hasOverride: tenantSetting?.has_override ?? false,
        customSubject: tenantSetting?.custom_subject ?? null,
        customHtmlBody: tenantSetting?.custom_html_body ?? null,
        tenantSettingId: tenantSetting?.id ?? null,
        tenantUpdatedAt: tenantSetting?.updated_at ?? null,
        category,
      }
    })
  }, [globalTemplates, tenantSettings])

  // Group rows by category
  const groupedRows = useMemo(() => {
    const groups: Record<string, MergedNotificationRow[]> = {}
    const categoryOrder = ['system', 'task', 'digest', 'discussion', 'other']

    categoryOrder.forEach((cat) => {
      const rows = mergedRows.filter((r) => r.category === cat)
      if (rows.length > 0) {
        groups[cat] = rows
      }
    })

    return groups
  }, [mergedRows])

  // Active templates for subscription dropdown
  const activeTemplates = useMemo(() => {
    return mergedRows
      .filter((r) => r.globalIsActive && r.tenantIsActive)
      .map((r) => ({
        value: r.triggerKey,
        label: r.name,
        description: r.description || undefined,
      }))
  }, [mergedRows])

  // User options for subscriber dropdown
  const userOptions = useMemo(() => {
    if (!tenantUsers) return []
    return tenantUsers.map((u) => ({
      value: u.user_id,
      label: u.user_profiles?.full_name || 'Unknown User',
    }))
  }, [tenantUsers])

  // Handle toggle active
  const handleToggleActive = async (row: MergedNotificationRow, newValue: boolean) => {
    if (!tenantId) return
    if (!row.globalIsActive) return // Can't toggle if globally disabled

    setTogglingRowId(row.id)

    // Optimistic update
    queryClient.setQueryData<TenantNotificationSettingWithTemplate[]>(
      ['tenant-notification-settings', tenantId],
      (old) => {
        if (!old) {
          // Create a new entry optimistically
          return [{
            id: 'temp-' + row.triggerKey,
            tenant_id: tenantId,
            template_id: row.templateId,
            trigger_key: row.triggerKey,
            is_active: newValue,
            custom_subject: null,
            custom_html_body: null,
            has_override: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: null,
            updated_by: null,
          }]
        }

        const existing = old.find((s) => s.trigger_key === row.triggerKey)
        if (existing) {
          return old.map((s) =>
            s.trigger_key === row.triggerKey ? { ...s, is_active: newValue } : s
          )
        } else {
          return [...old, {
            id: 'temp-' + row.triggerKey,
            tenant_id: tenantId,
            template_id: row.templateId,
            trigger_key: row.triggerKey,
            is_active: newValue,
            custom_subject: null,
            custom_html_body: null,
            has_override: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: null,
            updated_by: null,
          }]
        }
      }
    )

    try {
      await upsertSetting.mutateAsync({
        tenantId,
        trigger_key: row.triggerKey,
        template_id: row.templateId,
        is_active: newValue,
      })
    } catch {
      // Rollback on error
      queryClient.invalidateQueries({ queryKey: ['tenant-notification-settings', tenantId] })
    } finally {
      setTogglingRowId(null)
    }
  }

  // Open template sheet
  const openTemplateSheet = (row: MergedNotificationRow) => {
    setSelectedRow(row)
    setEditedSubject(row.hasOverride && row.customSubject ? row.customSubject : row.subject)
    setEditedHtmlBody(row.hasOverride && row.customHtmlBody ? row.customHtmlBody : row.htmlBody)
    setActiveTab('edit')
    setIsCustomizing(false)
    setIsSheetOpen(true)
  }

  // Close template sheet
  const closeTemplateSheet = () => {
    setIsSheetOpen(false)
    setSelectedRow(null)
    setIsCustomizing(false)
  }

  // Start customizing
  const startCustomizing = () => {
    if (!selectedRow) return
    setEditedSubject(selectedRow.subject)
    setEditedHtmlBody(selectedRow.htmlBody)
    setIsCustomizing(true)
  }

  // Save template customization
  const saveTemplate = async () => {
    if (!selectedRow || !tenantId) return

    await upsertSetting.mutateAsync({
      tenantId,
      trigger_key: selectedRow.triggerKey,
      template_id: selectedRow.templateId,
      custom_subject: editedSubject,
      custom_html_body: editedHtmlBody,
    })

    closeTemplateSheet()
  }

  // Restore default template
  const handleRestoreDefault = async () => {
    if (!selectedRow || !tenantId) return

    await upsertSetting.mutateAsync({
      tenantId,
      trigger_key: selectedRow.triggerKey,
      template_id: selectedRow.templateId,
      custom_subject: null,
      custom_html_body: null,
    })

    setShowRestoreDialog(false)
    closeTemplateSheet()
  }

  // Add subscriber
  const handleAddSubscriber = async () => {
    if (!tenantId || !subscriberUserId || !subscriberTrigger) return

    await addSubscription.mutateAsync({
      tenantId,
      triggerKey: subscriberTrigger,
      userId: subscriberUserId,
    })

    setSubscriberUserId('')
    setSubscriberTrigger('')
    setIsAddSubscriberOpen(false)
  }

  // Remove subscriber
  const handleRemoveSubscriber = async (subscriptionId: string) => {
    if (!tenantId) return

    await removeSubscription.mutateAsync({
      id: subscriptionId,
      tenantId,
    })

    setRemovingSubscriptionId(null)
  }

  // Send Log helpers
  const handleLogFilterChange = () => {
    setLogPage(1)
  }

  const toggleLogRowExpansion = (id: string) => {
    setExpandedLogRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleRefreshLog = () => {
    refetchLogStats()
    refetchLogPage()
  }

  // Format timestamp for log
  const formatLogTimestamp = (sentAt: string | null, createdAt: string) => {
    const date = sentAt || createdAt
    const dateObj = new Date(date)
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }
    return dateObj.toLocaleDateString('en-US', options)
  }

  // Truncate text with ellipsis
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  // Trigger options for log filter dropdown
  const logTriggerOptions = useMemo(
    () =>
      (logTriggerKeys || []).map((key) => ({
        value: key,
        label: key,
      })),
    [logTriggerKeys]
  )

  // Status filter options for log
  const LOG_STATUS_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
  ]

  const isLoading = isLoadingTemplates || isLoadingSettings || roleLoading

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage email notifications for your organization.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="settings" className="w-full">
        <TabsList>
          <TabsTrigger value="settings">Notification Settings</TabsTrigger>
          <TabsTrigger value="log">Send Log</TabsTrigger>
        </TabsList>

        {/* Tab 1: Notification Settings */}
        <TabsContent value="settings" className="space-y-8 mt-6">
          {/* Section 1: Notifications Table */}
          <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Templates
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : Object.keys(groupedRows).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No notification templates configured.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Notification Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="text-center">Template</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedRows).map(([category, rows]) => (
                  <>
                    {/* Category header row */}
                    <TableRow key={`category-${category}`} className="bg-[#f4f4f4] hover:bg-[#f4f4f4]">
                      <TableCell
                        colSpan={6}
                        className="py-2 text-xs font-semibold tracking-widest uppercase text-[#525252]"
                      >
                        {NOTIFICATION_CATEGORIES[category]?.label || 'Other Notifications'}
                      </TableCell>
                    </TableRow>
                    {/* Notification rows */}
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {row.triggerKey}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                          {row.description || '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.hasOverride ? (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              Custom
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                              Default
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {!row.globalIsActive ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center gap-1">
                                  <Switch disabled checked={false} />
                                  <Info className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                This notification has been disabled by your system administrator.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <Switch
                                checked={row.tenantIsActive}
                                onCheckedChange={(checked) => handleToggleActive(row, checked)}
                                disabled={togglingRowId === row.id}
                              />
                              {togglingRowId === row.id && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openTemplateSheet(row)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit Template
                            </Button>
                            {row.hasOverride && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedRow(row)
                                  setShowRestoreDialog(true)
                                }}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Section 2: Additional Subscribers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Additional Subscribers
              </CardTitle>
              <CardDescription>
                Subscribe team members to notifications even if they are not directly assigned to those records.
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddSubscriberOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Subscriber
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSubscriptions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !subscriptions || subscriptions.length === 0 ? (
            <div className="text-center py-8">
              <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No additional subscribers. Use "Add Subscriber" to notify team members about events relevant to them.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Notification Trigger</TableHead>
                  <TableHead>Subscribed By</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="w-[80px]">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {getInitials(sub.user_profiles?.full_name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {sub.user_profiles?.full_name || 'Unknown User'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {sub.trigger_key}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sub.subscribed_by_profile?.full_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(sub.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setRemovingSubscriptionId(sub.id)}
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

        {/* Tab 2: Send Log */}
        <TabsContent value="log" className="space-y-6 mt-6">
          {/* Refresh Button */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefreshLog}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center">
                  <div className="flex items-center justify-center w-16 h-20 bg-green-50">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 px-4">
                    {isLoadingLogStats ? (
                      <>
                        <Skeleton className="h-8 w-16 mb-1" />
                        <Skeleton className="h-4 w-20" />
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold">{(logStats?.totalSent ?? 0).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Total Sent</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center">
                  <div className="flex items-center justify-center w-16 h-20 bg-red-50">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="flex-1 px-4">
                    {isLoadingLogStats ? (
                      <>
                        <Skeleton className="h-8 w-16 mb-1" />
                        <Skeleton className="h-4 w-20" />
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold">{(logStats?.totalFailed ?? 0).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Total Failed</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center">
                  <div className="flex items-center justify-center w-16 h-20 bg-blue-50">
                    <Mail className="h-5 w-5 text-[#0f62fe]" />
                  </div>
                  <div className="flex-1 px-4">
                    {isLoadingLogStats ? (
                      <>
                        <Skeleton className="h-8 w-16 mb-1" />
                        <Skeleton className="h-4 w-20" />
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold">{(logStats?.sentToday ?? 0).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Sent Today</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search */}
                <div>
                  <Label htmlFor="log-search" className="text-xs text-muted-foreground">
                    Search
                  </Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="log-search"
                      placeholder="Email or subject..."
                      value={logSearch}
                      onChange={(e) => {
                        setLogSearch(e.target.value)
                        handleLogFilterChange()
                      }}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="flex mt-1 rounded-md border overflow-hidden">
                    {LOG_STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          'flex-1 px-3 py-2 text-sm font-medium transition-colors',
                          logStatusFilter === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        )}
                        onClick={() => {
                          setLogStatusFilter(option.value as 'all' | 'sent' | 'failed')
                          handleLogFilterChange()
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trigger Filter */}
                <div>
                  <Label className="text-xs text-muted-foreground">Trigger</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={logTriggerOptions}
                      value={logTriggerFilter}
                      onValueChange={(value) => {
                        setLogTriggerFilter(value)
                        handleLogFilterChange()
                      }}
                      placeholder="All triggers"
                      searchPlaceholder="Search triggers..."
                      clearable
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Log Table */}
          <Card>
            {isLoadingLogPage ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !logPageData || logPageData.data.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No notifications have been sent for your organization yet.
                </p>
                <p className="text-sm text-muted-foreground mt-1 text-center">
                  Once notification emails begin sending, they will appear here.
                </p>
              </CardContent>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Sent At</TableHead>
                      <TableHead>Recipient Email</TableHead>
                      <TableHead className="hidden md:table-cell">Subject</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logPageData.data.map((log) => {
                      const isFailed = log.status === 'failed'
                      const hasError = isFailed && log.error_message
                      const isExpanded = expandedLogRows.has(log.id)

                      return (
                        <>
                          <TableRow
                            key={log.id}
                            className={cn(
                              isFailed && 'bg-red-50/50',
                              hasError && 'cursor-pointer hover:bg-muted/50'
                            )}
                            onClick={() => hasError && toggleLogRowExpansion(log.id)}
                          >
                            <TableCell className="font-mono text-xs">
                              {formatLogTimestamp(log.sent_at, log.created_at)}
                            </TableCell>
                            <TableCell className="font-medium">{log.recipient_email}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{truncateText(log.subject, 60)}</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md">
                                  <p>{log.subject}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {log.trigger_key}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {log.status === 'sent' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-700 border-green-200"
                                >
                                  Sent
                                </Badge>
                              ) : log.status === 'failed' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-red-50 text-red-700 border-red-200"
                                >
                                  Failed
                                </Badge>
                              ) : (
                                <Badge variant="outline">Queued</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {hasError && (
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && hasError && (
                            <TableRow key={`${log.id}-error`}>
                              <TableCell colSpan={6} className="bg-red-50/30 border-l-4 border-l-red-400">
                                <div className="py-2">
                                  <p className="text-xs font-semibold text-red-700 mb-1">Error Message:</p>
                                  <pre className="text-xs bg-red-100 border border-red-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                                    {log.error_message}
                                  </pre>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(logPage - 1) * 25 + 1} to{' '}
                    {Math.min(logPage * 25, logPageData.totalCount)} of {logPageData.totalCount} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogPage(logPage - 1)}
                      disabled={logPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm px-2">
                      Page {logPage} of {logPageData.totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogPage(logPage + 1)}
                      disabled={logPage >= logPageData.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Edit Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedRow && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedRow.name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {selectedRow.triggerKey}
                  </Badge>
                  {selectedRow.hasOverride || isCustomizing ? (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                      Custom Template
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                      Using Default Template
                    </Badge>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Default template banner */}
                {!selectedRow.hasOverride && !isCustomizing && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-blue-800 mb-3">
                      You are currently using the default template. Click "Customize Template" to create your own version.
                    </p>
                    <Button variant="outline" size="sm" onClick={startCustomizing}>
                      Customize Template
                    </Button>
                  </div>
                )}

                {/* Last modified timestamp for overrides */}
                {selectedRow.hasOverride && selectedRow.tenantUpdatedAt && (
                  <p className="text-sm text-muted-foreground">
                    Last modified: {formatDate(selectedRow.tenantUpdatedAt)}
                  </p>
                )}

                {/* Available Variables */}
                <div>
                  <Label className="text-sm text-muted-foreground">Available Variables</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.keys(selectedRow.availableVariables).map((variable) => (
                      <Badge
                        key={variable}
                        variant="outline"
                        className="font-mono text-xs cursor-help"
                        title={selectedRow.availableVariables[variable]}
                      >
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    placeholder="Email subject..."
                    disabled={!selectedRow.hasOverride && !isCustomizing}
                  />
                </div>

                {/* HTML Body with Edit/Preview Tabs */}
                <NotificationTemplateEditor
                  htmlBody={editedHtmlBody}
                  onHtmlBodyChange={setEditedHtmlBody}
                  availableVariables={selectedRow.availableVariables}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  readOnly={!selectedRow.hasOverride && !isCustomizing}
                />
              </div>

              <SheetFooter className="mt-6 gap-2">
                {(selectedRow.hasOverride || isCustomizing) && (
                  <>
                    {selectedRow.hasOverride && (
                      <Button
                        variant="outline"
                        onClick={() => setShowRestoreDialog(true)}
                        className="mr-auto"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore Default
                      </Button>
                    )}
                    <Button variant="outline" onClick={closeTemplateSheet}>
                      Cancel
                    </Button>
                    <Button onClick={saveTemplate} disabled={upsertSetting.isPending}>
                      {upsertSetting.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Template
                    </Button>
                  </>
                )}
                {!selectedRow.hasOverride && !isCustomizing && (
                  <Button variant="outline" onClick={closeTemplateSheet}>
                    Close
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Restore Default Confirmation Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Default Template?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will remove your custom template and revert to the system default.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreDefault}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {upsertSetting.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Restore Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Subscriber Dialog */}
      <Dialog open={isAddSubscriberOpen} onOpenChange={setIsAddSubscriberOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Subscriber</DialogTitle>
            <DialogDescription>
              Subscribe a team member to a notification trigger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <SearchableSelect
                options={userOptions}
                value={subscriberUserId}
                onValueChange={(value) => setSubscriberUserId(value || '')}
                placeholder="Select a team member..."
                isLoading={isLoadingUsers}
              />
            </div>
            <div className="space-y-2">
              <Label>Notification Trigger</Label>
              <SearchableSelect
                options={activeTemplates}
                value={subscriberTrigger}
                onValueChange={(value) => setSubscriberTrigger(value || '')}
                placeholder="Select a notification..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddSubscriberOpen(false)
                setSubscriberUserId('')
                setSubscriberTrigger('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSubscriber}
              disabled={!subscriberUserId || !subscriberTrigger || addSubscription.isPending}
            >
              {addSubscription.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Subscriber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Subscriber Confirmation Dialog */}
      <AlertDialog
        open={!!removingSubscriptionId}
        onOpenChange={(open) => !open && setRemovingSubscriptionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Subscriber?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this subscription? The user will no longer receive
              these notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingSubscriptionId && handleRemoveSubscriber(removingSubscriptionId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeSubscription.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
