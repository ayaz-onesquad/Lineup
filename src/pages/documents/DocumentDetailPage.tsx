import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDocument, useDocumentMutations } from '@/hooks/useDocuments'
import { documentsApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { formatFileSize } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { UserProfile } from '@/types/database'
import {
  ArrowLeft,
  FileText,
  Link as LinkIcon,
  Info,
  Network,
  Edit,
  X,
  Save,
  Loader2,
  Eye,
  Download,
  ExternalLink,
} from 'lucide-react'

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
  name: z.string().min(1, 'Name is required'),
  document_type: z.string().optional(),
  description: z.string().optional(),
  external_link: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  visibility: z.enum(['internal', 'client', 'public']).default('internal'),
  show_in_client_portal: z.boolean().default(false),
})

type DocumentFormValues = z.infer<typeof documentFormSchema>

function AssociationRow({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href: string
}) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm font-medium text-muted-foreground w-28">{label}</span>
      <button
        className="text-sm text-primary hover:underline flex items-center gap-1"
        onClick={() => navigate(href)}
      >
        {value}
        <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  )
}

export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: document, isLoading } = useDocument(documentId!)
  const { updateDocument } = useDocumentMutations()

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [newFile, setNewFile] = useState<File | null>(null)

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      name: '',
      document_type: '',
      description: '',
      external_link: '',
      visibility: 'internal',
      show_in_client_portal: false,
    },
  })

  // Reset form when document data loads
  useEffect(() => {
    if (document && !isEditing) {
      form.reset({
        name: document.name,
        document_type: document.document_type || '',
        description: document.description || '',
        external_link: document.external_link || '',
        visibility: (document.visibility as 'internal' | 'client' | 'public') || 'internal',
        show_in_client_portal: document.show_in_client_portal || false,
      })
    }
  }, [document?.id, document?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && document && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, document])

  const handleView = async () => {
    if (!document?.file_url) return
    setViewLoading(true)
    try {
      const url = await documentsApi.getSignedUrl(document.file_url)
      window.open(url, '_blank')
    } catch {
      toast({
        title: 'Could not open file',
        description: 'The file may have been moved or deleted from storage.',
        variant: 'destructive',
      })
    } finally {
      setViewLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!document?.file_url) return
    setDownloadLoading(true)
    try {
      const url = await documentsApi.getSignedUrl(document.file_url)
      const a = window.document.createElement('a')
      a.href = url
      a.download = document.name
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not generate a download link for this file.',
        variant: 'destructive',
      })
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleSave = async (data: DocumentFormValues) => {
    if (!documentId) return
    setIsSaving(true)
    try {
      let fileUrl = document?.file_url
      let fileType = document?.file_type
      let fileSizeBytes = document?.file_size_bytes

      // Upload new file if one was selected
      if (newFile) {
        const tenant_id = document?.tenant_id
        if (tenant_id) {
          const uploadResult = await documentsApi.uploadFile(tenant_id, newFile)
          fileUrl = uploadResult.file_url
          fileType = uploadResult.file_type
          fileSizeBytes = uploadResult.file_size_bytes
        }
      }

      await updateDocument.mutateAsync({
        id: documentId,
        name: data.name,
        document_type: data.document_type || null,
        description: data.description || null,
        external_link: data.external_link?.trim() || null,
        visibility: data.visibility,
        show_in_client_portal: data.show_in_client_portal,
        file_url: fileUrl,
        file_type: fileType,
        file_size_bytes: fileSizeBytes,
      })
      setIsEditing(false)
      setNewFile(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      name: document?.name || '',
      document_type: document?.document_type || '',
      description: document?.description || '',
      external_link: document?.external_link || '',
      visibility: (document?.visibility as 'internal' | 'client' | 'public') || 'internal',
      show_in_client_portal: document?.show_in_client_portal || false,
    })
    setIsEditing(false)
    setNewFile(null)
  }

  const getVisibilityBadge = () => {
    const visibility = document?.visibility || 'internal'
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      internal: 'secondary',
      client: 'default',
      public: 'outline',
    }
    const labels: Record<string, string> = {
      internal: 'Internal',
      client: 'Client-Visible',
      public: 'Public',
    }
    return <Badge variant={variants[visibility]}>{labels[visibility]}</Badge>
  }

  const hasFile = !!document?.file_url
  const hasLink = !!document?.external_link

  // Check if there are any associations
  const hasAssociations =
    document?.client ||
    document?.lead ||
    document?.project ||
    document?.phase ||
    document?.set ||
    document?.pitch ||
    document?.requirement

  if (isLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Document not found</p>
        <Button variant="link" onClick={() => navigate('/documents')}>
          Back to Documents
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
            <FileText className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : document.name}
            </h1>
            {document.document_type && (
              <Badge variant="outline">
                {DOCUMENT_TYPE_OPTIONS.find((o) => o.value === document.document_type)?.label ||
                  document.document_type}
              </Badge>
            )}
            {getVisibilityBadge()}
          </div>
          <p className="text-muted-foreground">Documents &gt; {document.name}</p>
        </div>
      </div>

      {/* Main Card */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons */}
          <div className="flex justify-end gap-2 mb-6">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button size="sm" onClick={form.handleSubmit(handleSave)} disabled={isSaving}>
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

          <Tabs defaultValue="details">
            <TabsList className="mb-6">
              <TabsTrigger value="details">
                <Info className="h-4 w-4 mr-2" />
                Details
              </TabsTrigger>
              <TabsTrigger value="associations">
                <Network className="h-4 w-4 mr-2" />
                Associations
              </TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-6">
              {/* Document Information Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Document Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ViewEditField
                    type="text"
                    label="Name"
                    required
                    isEditing={isEditing}
                    value={form.watch('name')}
                    onChange={(v) => form.setValue('name', v)}
                    error={form.formState.errors.name?.message}
                  />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      Document Type
                    </label>
                    {isEditing ? (
                      <SearchableSelect
                        options={DOCUMENT_TYPE_OPTIONS}
                        value={form.watch('document_type') || ''}
                        onValueChange={(v) => form.setValue('document_type', v || '')}
                        placeholder="Select type..."
                        clearable
                      />
                    ) : (
                      <p className="h-9 flex items-center">
                        {DOCUMENT_TYPE_OPTIONS.find((o) => o.value === document.document_type)
                          ?.label || '—'}
                      </p>
                    )}
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <ViewEditField
                      type="textarea"
                      label="Description"
                      isEditing={isEditing}
                      value={form.watch('description') || ''}
                      onChange={(v) => form.setValue('description', v)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      Visibility
                    </label>
                    {isEditing ? (
                      <SearchableSelect
                        options={VISIBILITY_OPTIONS}
                        value={form.watch('visibility')}
                        onValueChange={(v) =>
                          form.setValue('visibility', (v as 'internal' | 'client' | 'public') || 'internal')
                        }
                        placeholder="Select visibility..."
                      />
                    ) : (
                      <p className="h-9 flex items-center">
                        {VISIBILITY_OPTIONS.find((o) => o.value === document.visibility)?.label ||
                          'Internal'}
                      </p>
                    )}
                  </div>
                  {(form.watch('visibility') === 'client' || document.visibility === 'client') && (
                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <>
                          <Switch
                            checked={form.watch('show_in_client_portal')}
                            onCheckedChange={(v) => form.setValue('show_in_client_portal', v)}
                          />
                          <div>
                            <div className="text-sm font-medium">Show in Client Portal</div>
                            <p className="text-xs text-muted-foreground">
                              Make this document visible in the client portal
                            </p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-1 block">
                            Show in Client Portal
                          </label>
                          <p>{document.show_in_client_portal ? 'Enabled' : 'Disabled'}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Content Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-muted-foreground" />
                  Content
                </h3>
                <div className="space-y-4">
                  {/* External Link */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      External Link
                    </label>
                    {isEditing ? (
                      <Input
                        type="url"
                        value={form.watch('external_link') || ''}
                        onChange={(e) => form.setValue('external_link', e.target.value)}
                        placeholder="https://..."
                      />
                    ) : hasLink ? (
                      <button
                        className="text-primary hover:underline flex items-center gap-1"
                        onClick={() => window.open(document.external_link!, '_blank')}
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <p className="text-muted-foreground">—</p>
                    )}
                    {form.formState.errors.external_link && (
                      <p className="text-xs text-destructive mt-1">
                        {form.formState.errors.external_link.message}
                      </p>
                    )}
                  </div>

                  {/* Uploaded File */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      Uploaded File
                    </label>
                    {isEditing ? (
                      <div className="space-y-2">
                        {hasFile && !newFile && (
                          <p className="text-sm">
                            Current: {document.name}
                            {document.file_size_bytes && (
                              <span className="text-muted-foreground ml-2">
                                ({formatFileSize(document.file_size_bytes)})
                              </span>
                            )}
                          </p>
                        )}
                        {newFile && (
                          <p className="text-sm text-green-600">
                            New file: {newFile.name} ({formatFileSize(newFile.size)})
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                            className="max-w-xs"
                          />
                          {newFile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setNewFile(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : hasFile ? (
                      <div className="flex items-center gap-4">
                        <span className="text-sm">
                          {document.name}
                          {document.file_size_bytes && (
                            <span className="text-muted-foreground ml-2">
                              ({formatFileSize(document.file_size_bytes)})
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleView}
                            disabled={viewLoading}
                          >
                            {viewLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Eye className="h-4 w-4 mr-2" />
                            )}
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownload}
                            disabled={downloadLoading}
                          >
                            {downloadLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Download
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No file attached</p>
                    )}
                  </div>

                  {!hasFile && !hasLink && !isEditing && (
                    <p className="text-muted-foreground italic">No content attached</p>
                  )}
                </div>
              </div>

              {/* Audit Trail */}
              <AuditTrail
                created_at={document.created_at}
                created_by={document.uploaded_by || ''}
                updated_at={document.updated_at}
                updated_by={document.updated_by || undefined}
                creator={document.uploader as UserProfile | undefined}
                updater={document.updater as UserProfile | undefined}
              />
            </TabsContent>

            {/* Associations Tab */}
            <TabsContent value="associations">
              <div className="space-y-3">
                {document.client && (
                  <AssociationRow
                    label="Client"
                    value={document.client.name}
                    href={`/clients/${document.client_id}`}
                  />
                )}
                {document.lead && (
                  <AssociationRow
                    label="Lead"
                    value={document.lead.name}
                    href={`/leads/${document.lead_id}`}
                  />
                )}
                {document.project && (
                  <AssociationRow
                    label="Project"
                    value={document.project.name}
                    href={`/projects/${document.project_id}`}
                  />
                )}
                {document.phase && (
                  <AssociationRow
                    label="Phase"
                    value={document.phase.name}
                    href={`/phases/${document.phase_id}`}
                  />
                )}
                {document.set && (
                  <AssociationRow
                    label="Set"
                    value={document.set.name}
                    href={`/sets/${document.set_id}`}
                  />
                )}
                {document.pitch && (
                  <AssociationRow
                    label="Pitch"
                    value={document.pitch.name}
                    href={`/pitches/${document.pitch_id}`}
                  />
                )}
                {document.requirement && (
                  <AssociationRow
                    label="Requirement"
                    value={document.requirement.name}
                    href={`/requirements/${document.requirement_id}`}
                  />
                )}
                {!hasAssociations && (
                  <p className="text-muted-foreground text-center py-8">No associations</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
