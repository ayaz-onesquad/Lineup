import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
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
  Mail,
  Edit,
  Save,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { NotificationTemplateEditor } from '@/components/shared/NotificationTemplateEditor'
import {
  useNotificationEmailConfig,
  useUpsertNotificationEmailConfig,
  useNotificationTemplates,
  useUpdateNotificationTemplate,
} from '@/hooks/useNotifications'
import { formatDate } from '@/lib/utils'
import type { NotificationTemplate } from '@/types/notifications'

type SortField = 'name' | 'updated_at'
type SortDirection = 'asc' | 'desc'

export function AdminNotificationsPage() {
  // Email config state
  const [isEditingConfig, setIsEditingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    from_name: '',
    from_email: '',
    reply_to_email: '',
  })

  // Template editing state
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editedSubject, setEditedSubject] = useState('')
  const [editedHtmlBody, setEditedHtmlBody] = useState('')
  const [editedIsActive, setEditedIsActive] = useState(true)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const [showDeactivateWarning, setShowDeactivateWarning] = useState(false)

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Queries
  const { data: emailConfig, isLoading: isLoadingConfig } = useNotificationEmailConfig()
  const { data: templates, isLoading: isLoadingTemplates } = useNotificationTemplates()

  // Mutations
  const upsertEmailConfig = useUpsertNotificationEmailConfig()
  const updateTemplate = useUpdateNotificationTemplate()

  // Sort templates
  const sortedTemplates = useMemo(() => {
    if (!templates) return []
    return [...templates].sort((a, b) => {
      const aValue = sortField === 'name' ? a.name : a.updated_at
      const bValue = sortField === 'name' ? b.name : b.updated_at
      const comparison = aValue.localeCompare(bValue)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [templates, sortField, sortDirection])

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="ml-1 h-4 w-4 inline" />
    ) : (
      <ChevronDown className="ml-1 h-4 w-4 inline" />
    )
  }

  // Handle email config edit
  const startEditingConfig = () => {
    setConfigForm({
      from_name: emailConfig?.from_name || 'LineUp',
      from_email: emailConfig?.from_email || 'noreply@lineup.app',
      reply_to_email: emailConfig?.reply_to_email || '',
    })
    setIsEditingConfig(true)
  }

  const cancelEditingConfig = () => {
    setIsEditingConfig(false)
  }

  const saveConfig = () => {
    upsertEmailConfig.mutate(
      {
        from_name: configForm.from_name,
        from_email: configForm.from_email,
        reply_to_email: configForm.reply_to_email || null,
      },
      {
        onSuccess: () => {
          setIsEditingConfig(false)
        },
      }
    )
  }

  // Handle template editing
  const openTemplateSheet = (template: NotificationTemplate) => {
    setSelectedTemplate(template)
    setEditedSubject(template.subject)
    setEditedHtmlBody(template.html_body)
    setEditedIsActive(template.is_active)
    setActiveTab('edit')
    setIsSheetOpen(true)
  }

  const closeTemplateSheet = () => {
    setIsSheetOpen(false)
    setSelectedTemplate(null)
  }

  const handleActiveToggle = (newValue: boolean) => {
    if (!newValue) {
      // Show warning before deactivating
      setShowDeactivateWarning(true)
    } else {
      setEditedIsActive(true)
    }
  }

  const confirmDeactivate = () => {
    setEditedIsActive(false)
    setShowDeactivateWarning(false)
  }

  const cancelDeactivate = () => {
    setShowDeactivateWarning(false)
  }

  const saveTemplate = () => {
    if (!selectedTemplate) return

    updateTemplate.mutate(
      {
        id: selectedTemplate.id,
        subject: editedSubject,
        html_body: editedHtmlBody,
        is_active: editedIsActive,
      },
      {
        onSuccess: () => {
          closeTemplateSheet()
        },
      }
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'Admin', href: '/admin' },
            { label: 'Notifications' },
          ]}
        />
        <h1 className="text-3xl font-bold tracking-tight mt-2">Notification Management</h1>
        <p className="text-muted-foreground mt-1">
          Configure email sender settings and manage notification templates
        </p>
      </div>

      {/* Section 1: Email Sender Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Email Sender Configuration</CardTitle>
                <CardDescription>
                  Configure the global sender identity for all notification emails
                </CardDescription>
              </div>
            </div>
            {!isEditingConfig && (
              <Button variant="outline" size="sm" onClick={startEditingConfig}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingConfig ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isEditingConfig ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="from_name">
                    From Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="from_name"
                    value={configForm.from_name}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, from_name: e.target.value })
                    }
                    placeholder="LineUp"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from_email">
                    From Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="from_email"
                    type="email"
                    value={configForm.from_email}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, from_email: e.target.value })
                    }
                    placeholder="noreply@lineup.app"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reply_to_email">Reply-To Email</Label>
                  <Input
                    id="reply_to_email"
                    type="email"
                    value={configForm.reply_to_email}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, reply_to_email: e.target.value })
                    }
                    placeholder="support@lineup.app"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={cancelEditingConfig}
                  disabled={upsertEmailConfig.isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={saveConfig} disabled={upsertEmailConfig.isPending}>
                  {upsertEmailConfig.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">From Name</p>
                <p className="font-medium">{emailConfig?.from_name || 'LineUp'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">From Email</p>
                <p className="font-medium">{emailConfig?.from_email || 'noreply@lineup.app'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reply-To Email</p>
                <p className="font-medium">
                  {emailConfig?.reply_to_email || <span className="text-muted-foreground italic">Not set</span>}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Notification Templates */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Notification Templates</h2>

        {isLoadingTemplates ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : sortedTemplates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No templates found.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Run the database migration to seed default templates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('name')}
                  >
                    Name
                    <SortIcon field="name" />
                  </TableHead>
                  <TableHead>Trigger Key</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('updated_at')}
                  >
                    Last Updated
                    <SortIcon field="updated_at" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTemplates.map((template) => (
                  <TableRow
                    key={template.id}
                    className="cursor-pointer"
                    onClick={() => openTemplateSheet(template)}
                  >
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {template.trigger_key}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                      {template.description || '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {template.is_active ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(template.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          openTemplateSheet(template)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Template Edit Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedTemplate && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedTemplate.name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {selectedTemplate.trigger_key}
                  </Badge>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Available Variables */}
                <div>
                  <Label className="text-sm text-muted-foreground">Available Variables</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.keys(selectedTemplate.available_variables).map((variable) => (
                      <Badge
                        key={variable}
                        variant="outline"
                        className="font-mono text-xs cursor-help"
                        title={selectedTemplate.available_variables[variable]}
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
                  />
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="is_active">Template Active</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable or disable this notification globally
                    </p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={editedIsActive}
                    onCheckedChange={handleActiveToggle}
                  />
                </div>

                {/* HTML Body with Edit/Preview Tabs */}
                <NotificationTemplateEditor
                  htmlBody={editedHtmlBody}
                  onHtmlBodyChange={setEditedHtmlBody}
                  availableVariables={selectedTemplate.available_variables}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </div>

              <SheetFooter className="mt-6 gap-2">
                <Button variant="outline" onClick={closeTemplateSheet}>
                  Cancel
                </Button>
                <Button onClick={saveTemplate} disabled={updateTemplate.isPending}>
                  {updateTemplate.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Template
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Deactivate Warning Dialog */}
      <AlertDialog open={showDeactivateWarning} onOpenChange={setShowDeactivateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Disable Template Globally?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Disabling this template will suppress this notification for all tenants, even if
              they have it enabled in their tenant settings. This affects all organizations using
              LineUp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeactivate}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate}>Disable Template</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
