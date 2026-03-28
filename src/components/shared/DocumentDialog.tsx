import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { cn, formatFileSize } from '@/lib/utils'
import { useDocumentMutations } from '@/hooks/useDocuments'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { usePhases } from '@/hooks/usePhases'
import { useSets } from '@/hooks/useSets'
import { usePitches } from '@/hooks/usePitches'
import { useRequirements } from '@/hooks/useRequirements'
import { useLeads } from '@/hooks/useLeads'
import { Loader2, Upload, FileIcon, X, ChevronRight, Link as LinkIcon } from 'lucide-react'
import type { Document, EntityType } from '@/types/database'

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'sow', label: 'SOW' },
  { value: 'brief', label: 'Brief' },
  { value: 'reference', label: 'Reference' },
  { value: 'deliverable', label: 'Deliverable' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'report', label: 'Report' },
  { value: 'meeting_notes', label: 'Meeting Notes' },
  { value: 'other', label: 'Other' },
]

const VISIBILITY_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'client', label: 'Client-Visible' },
  { value: 'public', label: 'Public' },
]

const documentFormSchema = z.object({
  name: z.string().min(1, 'Document name is required'),
  document_type: z.string().optional(),
  description: z.string().optional(),
  external_link: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  visibility: z.enum(['internal', 'client', 'public']).default('internal'),
  show_in_client_portal: z.boolean().default(false),
  // Association fields
  client_id: z.string().optional(),
  lead_id: z.string().optional(),
  project_id: z.string().optional(),
  phase_id: z.string().optional(),
  set_id: z.string().optional(),
  pitch_id: z.string().optional(),
  requirement_id: z.string().optional(),
})

type DocumentFormValues = z.infer<typeof documentFormSchema>

interface ParentContext {
  clientName?: string
  projectName?: string
  phaseName?: string
  setName?: string
  pitchName?: string
  requirementName?: string
  leadName?: string
}

export interface DocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  // Primary entity
  entityType: EntityType | string
  entityId: string

  // Full parent chain (auto-populated from context)
  clientId?: string | null
  leadId?: string | null
  projectId?: string | null
  phaseId?: string | null
  setId?: string | null
  pitchId?: string | null
  requirementId?: string | null

  // Parent names for breadcrumb display
  parentContext?: ParentContext

  // For edit mode
  document?: Document | null

  onSuccess?: () => void
}

// Helper component for association fields
function AssociationField({
  label,
  lockedValue,
  isLocked,
  currentValue,
  options,
  onValueChange,
  placeholder,
}: {
  label: string
  lockedValue?: string | null
  isLocked: boolean
  currentValue: string
  options: { value: string; label: string }[]
  onValueChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {isLocked ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {lockedValue || 'Linked'}
          </Badge>
          <span className="text-xs text-muted-foreground">
            (auto-linked from source page)
          </span>
        </div>
      ) : (
        <SearchableSelect
          options={options}
          value={currentValue}
          onValueChange={(v) => onValueChange(v || '')}
          placeholder={placeholder}
          clearable
          emptyMessage={`No ${label.toLowerCase()}s found`}
        />
      )}
    </div>
  )
}

export function DocumentDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  clientId: clientIdProp,
  leadId: leadIdProp,
  projectId: projectIdProp,
  phaseId: phaseIdProp,
  setId: setIdProp,
  pitchId: pitchIdProp,
  requirementId: requirementIdProp,
  parentContext,
  document,
  onSuccess,
}: DocumentDialogProps) {
  const { createDocument, updateDocument } = useDocumentMutations()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = !!document

  // Load parent entity data for dropdowns
  const { data: allClients } = useClients()
  const { data: allLeads } = useLeads()
  const { data: allProjects } = useProjects()
  const { data: allPhases } = usePhases()
  const { data: allSets } = useSets()
  const { data: allPitches } = usePitches()
  const { data: allRequirements } = useRequirements()

  // Build options for dropdowns
  const clientOptions = useMemo(
    () => allClients?.map((c) => ({ value: c.id, label: c.name })) ?? [],
    [allClients]
  )
  const leadOptions = useMemo(
    () => allLeads?.map((l) => ({ value: l.id, label: l.lead_name })) ?? [],
    [allLeads]
  )
  const projectOptions = useMemo(
    () => allProjects?.map((p) => ({ value: p.id, label: p.name })) ?? [],
    [allProjects]
  )
  const phaseOptions = useMemo(
    () => allPhases?.map((p) => ({ value: p.id, label: p.name })) ?? [],
    [allPhases]
  )
  const setOptions = useMemo(
    () => allSets?.map((s) => ({ value: s.id, label: s.name })) ?? [],
    [allSets]
  )
  const pitchOptions = useMemo(
    () => allPitches?.map((p) => ({ value: p.id, label: p.name })) ?? [],
    [allPitches]
  )
  const requirementOptions = useMemo(
    () => allRequirements?.map((r) => ({ value: r.id, label: r.title })) ?? [],
    [allRequirements]
  )

  // Locked value names (for display when field is locked)
  const lockedClientName = useMemo(() => {
    if (!clientIdProp || !allClients) return parentContext?.clientName || null
    return allClients.find((c) => c.id === clientIdProp)?.name ?? parentContext?.clientName ?? null
  }, [clientIdProp, allClients, parentContext?.clientName])

  const lockedLeadName = useMemo(() => {
    if (!leadIdProp || !allLeads) return parentContext?.leadName || null
    return allLeads.find((l) => l.id === leadIdProp)?.lead_name ?? parentContext?.leadName ?? null
  }, [leadIdProp, allLeads, parentContext?.leadName])

  const lockedProjectName = useMemo(() => {
    if (!projectIdProp || !allProjects) return parentContext?.projectName || null
    return allProjects.find((p) => p.id === projectIdProp)?.name ?? parentContext?.projectName ?? null
  }, [projectIdProp, allProjects, parentContext?.projectName])

  const lockedPhaseName = useMemo(() => {
    if (!phaseIdProp || !allPhases) return parentContext?.phaseName || null
    return allPhases.find((p) => p.id === phaseIdProp)?.name ?? parentContext?.phaseName ?? null
  }, [phaseIdProp, allPhases, parentContext?.phaseName])

  const lockedSetName = useMemo(() => {
    if (!setIdProp || !allSets) return parentContext?.setName || null
    return allSets.find((s) => s.id === setIdProp)?.name ?? parentContext?.setName ?? null
  }, [setIdProp, allSets, parentContext?.setName])

  const lockedPitchName = useMemo(() => {
    if (!pitchIdProp || !allPitches) return parentContext?.pitchName || null
    return allPitches.find((p) => p.id === pitchIdProp)?.name ?? parentContext?.pitchName ?? null
  }, [pitchIdProp, allPitches, parentContext?.pitchName])

  const lockedRequirementTitle = useMemo(() => {
    if (!requirementIdProp || !allRequirements) return parentContext?.requirementName || null
    return (
      allRequirements.find((r) => r.id === requirementIdProp)?.title ??
      parentContext?.requirementName ??
      null
    )
  }, [requirementIdProp, allRequirements, parentContext?.requirementName])

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      name: document?.name || '',
      document_type: document?.document_type || '',
      description: document?.description || '',
      external_link: document?.external_link || '',
      visibility: (document?.visibility as 'internal' | 'client' | 'public') || 'internal',
      show_in_client_portal: document?.show_in_client_portal || false,
      // Association defaults from props or document
      client_id: clientIdProp || document?.client_id || '',
      lead_id: leadIdProp || document?.lead_id || '',
      project_id: projectIdProp || document?.project_id || '',
      phase_id: phaseIdProp || document?.phase_id || '',
      set_id: setIdProp || document?.set_id || '',
      pitch_id: pitchIdProp || document?.pitch_id || '',
      requirement_id: requirementIdProp || document?.requirement_id || '',
    },
  })

  const watchedVisibility = form.watch('visibility')

  // Reset form when dialog opens/closes or document changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: document?.name || '',
        document_type: document?.document_type || '',
        description: document?.description || '',
        external_link: document?.external_link || '',
        visibility: (document?.visibility as 'internal' | 'client' | 'public') || 'internal',
        show_in_client_portal: document?.show_in_client_portal || false,
        client_id: clientIdProp || document?.client_id || '',
        lead_id: leadIdProp || document?.lead_id || '',
        project_id: projectIdProp || document?.project_id || '',
        phase_id: phaseIdProp || document?.phase_id || '',
        set_id: setIdProp || document?.set_id || '',
        pitch_id: pitchIdProp || document?.pitch_id || '',
        requirement_id: requirementIdProp || document?.requirement_id || '',
      })
      setSelectedFile(null)
      setError(null)
    }
  }, [open, document, form, clientIdProp, leadIdProp, projectIdProp, phaseIdProp, setIdProp, pitchIdProp, requirementIdProp])

  // Build breadcrumb trail from parent context
  const breadcrumbParts: string[] = []
  if (parentContext?.clientName) breadcrumbParts.push(parentContext.clientName)
  if (parentContext?.leadName) breadcrumbParts.push(parentContext.leadName)
  if (parentContext?.projectName) breadcrumbParts.push(parentContext.projectName)
  if (parentContext?.phaseName) breadcrumbParts.push(parentContext.phaseName)
  if (parentContext?.setName) breadcrumbParts.push(parentContext.setName)
  if (parentContext?.pitchName) breadcrumbParts.push(parentContext.pitchName)
  if (parentContext?.requirementName) breadcrumbParts.push(parentContext.requirementName)

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      setSelectedFile(files[0])
      setError(null)
      // Auto-fill name from filename if name is empty
      if (!form.getValues('name')) {
        form.setValue('name', files[0].name.replace(/\.[^/.]+$/, ''))
      }
    }
  }, [form])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeSelectedFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = async (formData: DocumentFormValues) => {
    setError(null)

    // Validation: at least one of file OR external_link required for create
    if (!isEditMode && !formData.external_link && !selectedFile) {
      setError('Please add a file or an external link')
      return
    }

    setIsSaving(true)
    try {
      // Build association values: use prop value if locked, otherwise use form value
      const finalClientId = clientIdProp || formData.client_id || null
      const finalLeadId = leadIdProp || formData.lead_id || null
      const finalProjectId = projectIdProp || formData.project_id || null
      const finalPhaseId = phaseIdProp || formData.phase_id || null
      const finalSetId = setIdProp || formData.set_id || null
      const finalPitchId = pitchIdProp || formData.pitch_id || null
      const finalRequirementId = requirementIdProp || formData.requirement_id || null

      if (isEditMode && document) {
        // Update existing document
        await updateDocument.mutateAsync({
          id: document.id,
          name: formData.name,
          description: formData.description || null,
          document_type: formData.document_type || null,
          external_link: formData.external_link || null,
          visibility: formData.visibility,
          show_in_client_portal: formData.show_in_client_portal,
        })
      } else {
        // Create new document
        await createDocument.mutateAsync({
          name: formData.name,
          description: formData.description || null,
          document_type: formData.document_type || null,
          external_link: formData.external_link || null,
          entity_type: entityType as EntityType,
          entity_id: entityId,
          client_id: finalClientId,
          lead_id: finalLeadId,
          project_id: finalProjectId,
          phase_id: finalPhaseId,
          set_id: finalSetId,
          pitch_id: finalPitchId,
          requirement_id: finalRequirementId,
          visibility: formData.visibility,
          show_in_client_portal: formData.show_in_client_portal,
          file: selectedFile || undefined,
        })
      }

      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      console.error('Document save error:', err)
      // Error is already handled by the mutation's onError
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] flex flex-col max-h-[90vh] p-0 gap-0">
        {/* STICKY HEADER — never scrolls */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{isEditMode ? 'Edit Document' : 'Add Document'}</DialogTitle>
          <DialogDescription className="mt-1">
            {isEditMode
              ? 'Update the document details below.'
              : 'Add a file, a link, or both to attach to this record.'}
          </DialogDescription>
        </div>

        <form onSubmit={form.handleSubmit(handleSave)} className="flex flex-col flex-1 min-h-0">
          {/* SCROLLABLE BODY — only this section scrolls */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="associations">Associations</TabsTrigger>
              </TabsList>

              {/* Tab 1: Details */}
              <TabsContent value="details" className="space-y-6 mt-0">
                {/* Parent Context Breadcrumb */}
                {breadcrumbParts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    {breadcrumbParts.map((part, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        <Badge variant="secondary" className="text-xs font-normal">
                          {part}
                        </Badge>
                      </span>
                    ))}
                  </div>
                )}

                {/* Document Information */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="Document name"
                      {...form.register('name')}
                      className={form.formState.errors.name ? 'border-red-500' : ''}
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="document_type">Document Type</Label>
                    <SearchableSelect
                      options={DOCUMENT_TYPE_OPTIONS}
                      value={form.watch('document_type') || ''}
                      onValueChange={(val) => form.setValue('document_type', val)}
                      placeholder="Select type..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Optional description..."
                      rows={2}
                      {...form.register('description')}
                    />
                  </div>
                </div>

                {/* File / Link Section */}
                <div className="space-y-4">
                  <div className="text-sm font-medium text-muted-foreground">
                    Attach content — add a file, a link, or both
                  </div>

                  {/* External Link */}
                  <div className="space-y-2">
                    <Label htmlFor="external_link" className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      External URL (Google Doc, Figma, etc.)
                    </Label>
                    <Input
                      id="external_link"
                      type="url"
                      placeholder="https://..."
                      {...form.register('external_link')}
                      className={form.formState.errors.external_link ? 'border-red-500' : ''}
                    />
                    {form.formState.errors.external_link && (
                      <p className="text-sm text-red-500">{form.formState.errors.external_link.message}</p>
                    )}
                  </div>

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label>Upload File</Label>
                    {isEditMode && document?.file_url && !selectedFile && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{document.name}</span>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="text-xs"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Replace file
                        </Button>
                      </div>
                    )}

                    {selectedFile ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={removeSelectedFile}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      (!isEditMode || !document?.file_url) && (
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            'border-2 border-dashed rounded-lg p-4 transition-colors text-center cursor-pointer',
                            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
                            'hover:border-primary/50'
                          )}
                        >
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Click to browse or drag and drop
                          </p>
                        </div>
                      )
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files)}
                    />
                  </div>
                </div>

                {/* Visibility */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="visibility">Visibility</Label>
                    <SearchableSelect
                      options={VISIBILITY_OPTIONS}
                      value={form.watch('visibility')}
                      onValueChange={(val) =>
                        form.setValue('visibility', val as 'internal' | 'client' | 'public')
                      }
                      placeholder="Select visibility..."
                    />
                  </div>

                  {watchedVisibility === 'client' && (
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show_in_portal" className="text-sm">
                        Show in Client Portal
                      </Label>
                      <Switch
                        id="show_in_portal"
                        checked={form.watch('show_in_client_portal')}
                        onCheckedChange={(checked) => form.setValue('show_in_client_portal', checked)}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 2: Associations */}
              <TabsContent value="associations" className="mt-0">
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Define which records this document is associated with.
                    Pre-populated fields (from the page you uploaded from) are locked.
                    You can optionally link this document to additional records.
                  </p>

                  {/* Tenant — always read-only */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Tenant</label>
                    <p className="text-sm text-muted-foreground">Auto-assigned to your organization</p>
                  </div>

                  {/* Client */}
                  <AssociationField
                    label="Client"
                    lockedValue={lockedClientName}
                    isLocked={!!clientIdProp}
                    currentValue={form.watch('client_id') || ''}
                    options={clientOptions}
                    onValueChange={(v) => form.setValue('client_id', v)}
                    placeholder="Link to a client..."
                  />

                  {/* Lead */}
                  <AssociationField
                    label="Lead"
                    lockedValue={lockedLeadName}
                    isLocked={!!leadIdProp}
                    currentValue={form.watch('lead_id') || ''}
                    options={leadOptions}
                    onValueChange={(v) => form.setValue('lead_id', v)}
                    placeholder="Link to a lead..."
                  />

                  {/* Project */}
                  <AssociationField
                    label="Project"
                    lockedValue={lockedProjectName}
                    isLocked={!!projectIdProp}
                    currentValue={form.watch('project_id') || ''}
                    options={projectOptions}
                    onValueChange={(v) => form.setValue('project_id', v)}
                    placeholder="Link to a project..."
                  />

                  {/* Phase */}
                  <AssociationField
                    label="Phase"
                    lockedValue={lockedPhaseName}
                    isLocked={!!phaseIdProp}
                    currentValue={form.watch('phase_id') || ''}
                    options={phaseOptions}
                    onValueChange={(v) => form.setValue('phase_id', v)}
                    placeholder="Link to a phase..."
                  />

                  {/* Set */}
                  <AssociationField
                    label="Set"
                    lockedValue={lockedSetName}
                    isLocked={!!setIdProp}
                    currentValue={form.watch('set_id') || ''}
                    options={setOptions}
                    onValueChange={(v) => form.setValue('set_id', v)}
                    placeholder="Link to a set..."
                  />

                  {/* Pitch */}
                  <AssociationField
                    label="Pitch"
                    lockedValue={lockedPitchName}
                    isLocked={!!pitchIdProp}
                    currentValue={form.watch('pitch_id') || ''}
                    options={pitchOptions}
                    onValueChange={(v) => form.setValue('pitch_id', v)}
                    placeholder="Link to a pitch..."
                  />

                  {/* Requirement */}
                  <AssociationField
                    label="Requirement"
                    lockedValue={lockedRequirementTitle}
                    isLocked={!!requirementIdProp}
                    currentValue={form.watch('requirement_id') || ''}
                    options={requirementOptions}
                    onValueChange={(v) => form.setValue('requirement_id', v)}
                    placeholder="Link to a requirement..."
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-md mt-4">
                {error}
              </p>
            )}
          </div>

          {/* STICKY FOOTER — never scrolls */}
          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditMode ? 'Update Document' : 'Save Document'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
