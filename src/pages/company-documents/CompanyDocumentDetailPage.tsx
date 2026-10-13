import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCompanyDocument,
  useCompanyDocumentMutations,
  useCompanyDocumentVersions,
  useCompanyDocumentAccessLog,
  useCompanyDocumentAcknowledgements,
} from '@/hooks/useCompanyDocuments'
import { useTenantUsers } from '@/hooks/useTenant'
import { useSessionPolicy } from '@/hooks/useSessionPolicy'
import { useAuthStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import { SecureDocumentViewer } from '@/components/shared/SecureDocumentViewer'
import {
  ArrowLeft,
  BookLock,
  Edit,
  Save,
  X,
  Loader2,
  Download,
  Lock,
  ShieldCheck,
  History,
  ScrollText,
  CheckCircle2,
  UploadCloud,
  ExternalLink,
  CalendarClock,
  FileText,
} from 'lucide-react'
import { formatDate, formatDateTime, formatFileSize, cn } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/urlSafety'
import { sanitizeRichText } from '@/lib/sanitize'
import {
  COMPANY_DOCUMENT_TYPE_OPTIONS,
  COMPANY_DOCUMENT_STATUS_OPTIONS,
  COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS,
  COMPANY_DOCUMENT_CATEGORY_OPTIONS,
  COMPANY_DOCUMENT_STATUS_STYLES,
  COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES,
  COMPANY_DOCUMENT_ACCEPT,
  companyDocumentTypeLabel,
  companyDocumentStatusLabel,
  validateCompanyDocumentFile,
  CompanyDocumentValidationError,
} from '@/lib/companyDocuments'
import { toast } from '@/hooks/use-toast'
import type {
  CompanyDocumentType,
  CompanyDocumentStatus,
  CompanyDocumentConfidentiality,
  UserProfile,
} from '@/types/database'

const detailSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  document_type: z.string().min(1),
  category: z.string().optional(),
  reference_code: z.string().max(100).optional(),
  version: z.string().min(1, 'Version is required').max(50),
  status: z.string().min(1),
  confidentiality: z.string().min(1),
  owner_user_id: z.string().optional(),
  effective_date: z.string().optional(),
  review_due_date: z.string().optional(),
  description: z.string().optional(),
  external_link: z.string().optional(),
  allow_download: z.boolean(),
  watermark_on_view: z.boolean(),
  requires_acknowledgement: z.boolean(),
})

type DetailFormValues = z.infer<typeof detailSchema>

export function CompanyDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { policy } = useSessionPolicy()

  const { data: doc, isLoading } = useCompanyDocument(documentId)
  const { updateDocument, uploadFile, downloadDocument, acknowledgeDocument } =
    useCompanyDocumentMutations()
  const { data: tenantUsers } = useTenantUsers()
  const { data: versions } = useCompanyDocumentVersions(documentId)
  const { data: accessLog } = useCompanyDocumentAccessLog(documentId)
  const { data: acknowledgements } = useCompanyDocumentAcknowledgements(documentId)

  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === 'true')
  const [isSaving, setIsSaving] = useState(false)
  const [replacementFile, setReplacementFile] = useState<File | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<DetailFormValues>({
    resolver: zodResolver(detailSchema),
    defaultValues: {
      title: '',
      document_type: 'sop',
      category: '',
      reference_code: '',
      version: '1.0',
      status: 'draft',
      confidentiality: 'internal',
      owner_user_id: '',
      effective_date: '',
      review_due_date: '',
      description: '',
      external_link: '',
      allow_download: false,
      watermark_on_view: true,
      requires_acknowledgement: false,
    },
  })

  // Hydrate the form whenever fresh data arrives and we are not mid-edit, so an
  // in-progress edit is never clobbered by a background refetch.
  useEffect(() => {
    if (!doc || isEditing) return
    form.reset({
      title: doc.title,
      document_type: doc.document_type,
      category: doc.category ?? '',
      reference_code: doc.reference_code ?? '',
      version: doc.version,
      status: doc.status,
      confidentiality: doc.confidentiality,
      owner_user_id: doc.owner_user_id ?? '',
      effective_date: doc.effective_date ?? '',
      review_due_date: doc.review_due_date ?? '',
      description: doc.description ?? '',
      external_link: doc.external_link ?? '',
      allow_download: doc.allow_download,
      watermark_on_view: doc.watermark_on_view,
      requires_acknowledgement: doc.requires_acknowledgement,
    })
  }, [doc, isEditing, form])

  const ownerOptions = (tenantUsers ?? []).map(tu => ({
    value: tu.user_id,
    label: tu.user_profiles?.full_name || 'Unnamed user',
    description: tu.role,
  }))

  const startEditing = () => {
    setIsEditing(true)
    const next = new URLSearchParams(searchParams)
    next.set('edit', 'true')
    setSearchParams(next, { replace: true })
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setReplacementFile(null)
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
    if (doc) form.reset()
  }

  const pickReplacement = (file: File) => {
    try {
      validateCompanyDocumentFile(file)
      setReplacementFile(file)
    } catch (err) {
      toast({
        title: 'File not accepted',
        description:
          err instanceof CompanyDocumentValidationError
            ? err.message
            : 'That file could not be accepted.',
        variant: 'destructive',
      })
    }
  }

  const onSave = async (values: DetailFormValues) => {
    if (!doc) return

    // The database requires a document to point at either a stored file or an
    // external link. Catch it here so the user sees a sentence rather than a
    // constraint violation.
    const willHaveFile = !!replacementFile || !!doc.storage_path
    const willHaveLink = !!values.external_link?.trim()
    if (!willHaveFile && !willHaveLink) {
      toast({
        title: 'Nothing to point at',
        description:
          'Upload a file or keep an external link. A document record cannot have neither.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      let fileFields = {}

      if (replacementFile) {
        // Replacing the file archives the current one into the version history
        // automatically (see the archive trigger in migration 067).
        const uploaded = await uploadFile.mutateAsync({ file: replacementFile })
        fileFields = uploaded
      }

      await updateDocument.mutateAsync({
        id: doc.id,
        title: values.title.trim(),
        document_type: values.document_type as CompanyDocumentType,
        category: values.category || null,
        reference_code: values.reference_code?.trim() || null,
        version: values.version.trim(),
        status: values.status as CompanyDocumentStatus,
        confidentiality: values.confidentiality as CompanyDocumentConfidentiality,
        owner_user_id: values.owner_user_id || null,
        effective_date: values.effective_date || null,
        review_due_date: values.review_due_date || null,
        description: values.description?.trim() || null,
        external_link: values.external_link?.trim() || null,
        allow_download: values.allow_download,
        watermark_on_view: values.watermark_on_view,
        requires_acknowledgement: values.requires_acknowledgement,
        ...fileFields,
      })

      setReplacementFile(null)
      cancelEditing()
    } finally {
      setIsSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / not-found
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div>
        <Alert variant="destructive">
          <AlertTitle>Document not found</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This document does not exist, has been deleted, or your role does not
              allow you to view it.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/company-documents')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Company Documents
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const hasAcknowledged = (acknowledgements ?? []).some(
    a => a.user_id === user?.id && a.version === doc.version
  )
  const reviewOverdue =
    !!doc.review_due_date && doc.review_due_date <= new Date().toISOString().slice(0, 10)
  const externalHref = safeHttpUrl(doc.external_link)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Company Documents', href: '/company-documents' },
          { label: doc.title, displayId: doc.display_id ?? undefined },
        ]}
      />

      {/* ---------------- Header ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <BookLock className="mt-1 h-7 w-7 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{doc.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                DOC-{String(doc.display_id ?? 0).padStart(4, '0')}
              </Badge>
              <Badge variant="secondary">
                {companyDocumentTypeLabel(doc.document_type)}
              </Badge>
              <Badge
                variant="outline"
                className={cn('text-xs', COMPANY_DOCUMENT_STATUS_STYLES[doc.status])}
              >
                {companyDocumentStatusLabel(doc.status)}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs capitalize',
                  COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES[doc.confidentiality]
                )}
              >
                {doc.confidentiality}
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs">
                {doc.allow_download ? (
                  <>
                    <Download className="h-3 w-3" />
                    Download allowed
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" />
                    View only
                  </>
                )}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                v{doc.version}
              </span>
            </div>
          </div>
        </div>

        {/* Edit button top-right per the One-Page View/Edit pattern */}
        <div className="flex shrink-0 items-center gap-2">
          {!isEditing ? (
            <>
              {doc.allow_download && doc.storage_path && (
                <Button
                  variant="outline"
                  onClick={() => downloadDocument.mutate(doc)}
                  disabled={downloadDocument.isPending || policy.block_document_download}
                  title={
                    policy.block_document_download
                      ? 'Downloads are disabled for your organisation'
                      : undefined
                  }
                >
                  {downloadDocument.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download
                </Button>
              )}
              <Button onClick={startEditing}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={cancelEditing} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={form.handleSubmit(onSave)} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {reviewOverdue && !isEditing && (
        <Alert>
          <CalendarClock className="h-4 w-4" />
          <AlertTitle>Review overdue</AlertTitle>
          <AlertDescription>
            This document was due for review on {formatDate(doc.review_due_date)}.
          </AlertDescription>
        </Alert>
      )}

      {doc.requires_acknowledgement && !hasAcknowledged && !isEditing && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Acknowledgement required</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Confirm that you have read version {doc.version} of this document.
            </span>
            <Button
              size="sm"
              onClick={() => acknowledgeDocument.mutate(doc)}
              disabled={acknowledgeDocument.isPending}
            >
              {acknowledgeDocument.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              I have read this
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="document" className="space-y-4">
        <TabsList>
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="versions">
            <History className="mr-1.5 h-3.5 w-3.5" />
            Versions {versions?.length ? `(${versions.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="access">
            <ScrollText className="mr-1.5 h-3.5 w-3.5" />
            Access Log
          </TabsTrigger>
          {doc.requires_acknowledgement && (
            <TabsTrigger value="acknowledgements">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Acknowledgements
            </TabsTrigger>
          )}
        </TabsList>

        {/* ---------------- Document viewer ---------------- */}
        <TabsContent value="document" className="space-y-4">
          {doc.storage_path ? (
            <SecureDocumentViewer doc={doc} />
          ) : externalHref ? (
            <Alert>
              <ExternalLink className="h-4 w-4" />
              <AlertTitle>Stored externally</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>This document lives in an external system.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={externalHref} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open external document
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle>No file attached</AlertTitle>
              <AlertDescription>
                Use Edit to upload the document file or add an external link.
              </AlertDescription>
            </Alert>
          )}

          {doc.description && !isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary &amp; Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  // Sanitized server-authored HTML from the rich text editor.
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(doc.description) }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- Details (view/edit) ---------------- */}
        <TabsContent value="details">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-5 md:grid-cols-2">
                <ViewEditField
                  type="text"
                  label="Title"
                  required
                  isEditing={isEditing}
                  value={form.watch('title')}
                  onChange={v => form.setValue('title', v, { shouldDirty: true })}
                  error={form.formState.errors.title?.message}
                />

                <ViewEditField
                  type="select"
                  label="Document Type"
                  required
                  isEditing={isEditing}
                  value={form.watch('document_type')}
                  onChange={v => form.setValue('document_type', v, { shouldDirty: true })}
                  options={COMPANY_DOCUMENT_TYPE_OPTIONS}
                  searchable
                />

                <ViewEditField
                  type="select"
                  label="Category"
                  isEditing={isEditing}
                  value={form.watch('category') ?? ''}
                  onChange={v => form.setValue('category', v, { shouldDirty: true })}
                  options={COMPANY_DOCUMENT_CATEGORY_OPTIONS}
                  searchable
                  clearable
                />

                <ViewEditField
                  type="text"
                  label="Reference Code"
                  isEditing={isEditing}
                  value={form.watch('reference_code') ?? ''}
                  onChange={v => form.setValue('reference_code', v, { shouldDirty: true })}
                  placeholder="SOP-OPS-014"
                />

                <ViewEditField
                  type="text"
                  label="Version"
                  required
                  isEditing={isEditing}
                  value={form.watch('version')}
                  onChange={v => form.setValue('version', v, { shouldDirty: true })}
                  error={form.formState.errors.version?.message}
                />

                <ViewEditField
                  type="select"
                  label="Status"
                  required
                  isEditing={isEditing}
                  value={form.watch('status')}
                  onChange={v => form.setValue('status', v, { shouldDirty: true })}
                  options={COMPANY_DOCUMENT_STATUS_OPTIONS}
                  searchable
                />

                <ViewEditField
                  type="select"
                  label="Confidentiality"
                  required
                  isEditing={isEditing}
                  value={form.watch('confidentiality')}
                  onChange={v => form.setValue('confidentiality', v, { shouldDirty: true })}
                  options={COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS}
                  searchable
                />

                <ViewEditField
                  type="select"
                  label="Document Owner"
                  isEditing={isEditing}
                  value={form.watch('owner_user_id') ?? ''}
                  onChange={v => form.setValue('owner_user_id', v, { shouldDirty: true })}
                  options={ownerOptions}
                  searchable
                  clearable
                />

                <ViewEditField
                  type="date"
                  label="Effective Date"
                  isEditing={isEditing}
                  value={form.watch('effective_date') ?? ''}
                  onChange={v => form.setValue('effective_date', v, { shouldDirty: true })}
                />

                <ViewEditField
                  type="date"
                  label="Next Review Due"
                  isEditing={isEditing}
                  value={form.watch('review_due_date') ?? ''}
                  onChange={v => form.setValue('review_due_date', v, { shouldDirty: true })}
                />

                <ViewEditField
                  type="text"
                  label="External Link"
                  isEditing={isEditing}
                  value={form.watch('external_link') ?? ''}
                  onChange={v => form.setValue('external_link', v, { shouldDirty: true })}
                  placeholder="https://..."
                />
              </div>

              {/* Rich text description */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Summary &amp; Instructions</span>
                {isEditing ? (
                  <RichTextEditor
                    content={form.watch('description') ?? ''}
                    onChange={v => form.setValue('description', v, { shouldDirty: true })}
                    placeholder="What this document covers, when to use it, who it applies to..."
                    minHeight="160px"
                  />
                ) : doc.description ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(doc.description) }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Not set</p>
                )}
              </div>

              {/* Access controls */}
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Access controls</h4>
                </div>

                <ViewEditField
                  type="switch"
                  label="Allow downloading"
                  isEditing={isEditing}
                  value={form.watch('allow_download')}
                  onChange={v => form.setValue('allow_download', v, { shouldDirty: true })}
                  description="Off means the document is read in the app only, so no copies land on personal devices."
                />

                <ViewEditField
                  type="switch"
                  label="Watermark when viewed"
                  isEditing={isEditing}
                  value={form.watch('watermark_on_view')}
                  onChange={v => form.setValue('watermark_on_view', v, { shouldDirty: true })}
                  description="Overlays the reader's email and the time, so screenshots are traceable."
                />

                <ViewEditField
                  type="switch"
                  label="Require acknowledgement"
                  isEditing={isEditing}
                  value={form.watch('requires_acknowledgement')}
                  onChange={v =>
                    form.setValue('requires_acknowledgement', v, { shouldDirty: true })
                  }
                  description="Ask readers to confirm they have read this version."
                />
              </div>

              {/* File */}
              <div className="space-y-3 rounded-lg border p-4">
                <h4 className="text-sm font-semibold">File</h4>
                {doc.file_name ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{doc.file_name}</span>
                    {doc.file_size_bytes ? (
                      <span className="text-muted-foreground">
                        {formatFileSize(doc.file_size_bytes)}
                      </span>
                    ) : null}
                    {doc.file_checksum && (
                      <span
                        className="font-mono text-xs text-muted-foreground"
                        title="SHA-256 checksum"
                      >
                        {doc.file_checksum.slice(0, 12)}…
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No file uploaded</p>
                )}

                {isEditing && (
                  <div className="space-y-2">
                    <input
                      ref={replaceInputRef}
                      type="file"
                      accept={COMPANY_DOCUMENT_ACCEPT}
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) pickReplacement(file)
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => replaceInputRef.current?.click()}
                    >
                      <UploadCloud className="mr-2 h-4 w-4" />
                      {doc.storage_path ? 'Replace file' : 'Upload file'}
                    </Button>
                    {replacementFile && (
                      <p className="text-sm">
                        Pending upload:{' '}
                        <span className="font-medium">{replacementFile.name}</span>{' '}
                        <span className="text-muted-foreground">
                          ({formatFileSize(replacementFile.size)})
                        </span>
                      </p>
                    )}
                    {doc.storage_path && (
                      <p className="text-xs text-muted-foreground">
                        Replacing the file moves the current one into the version
                        history. Bump the version number to keep the history readable.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <AuditTrail
                created_at={doc.created_at}
                updated_at={doc.updated_at}
                creator={(doc.creator ?? null) as UserProfile | null}
                updater={(doc.updater ?? null) as UserProfile | null}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Version history ---------------- */}
        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version history</CardTitle>
              <CardDescription>
                Previous files, archived automatically when the document file is
                replaced.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!versions?.length ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No previous versions. The current file is version {doc.version}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Archived</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map(version => (
                      <TableRow key={version.id}>
                        <TableCell className="font-mono text-xs">
                          v{version.version}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {version.file_name ?? '—'}
                        </TableCell>
                        <TableCell>
                          {version.file_size_bytes
                            ? formatFileSize(version.file_size_bytes)
                            : '—'}
                        </TableCell>
                        <TableCell>{formatDateTime(version.created_at)}</TableCell>
                        <TableCell>{version.creator?.full_name ?? '—'}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {version.change_summary ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Access log ---------------- */}
        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access log</CardTitle>
              <CardDescription>
                Every view, download and blocked attempt. The log is append-only and
                cannot be edited or deleted from the app. Administrators see all
                entries; other users see only their own.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!accessLog?.length ? (
                <p className="p-6 text-sm text-muted-foreground">No access recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Device</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessLog.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(entry.accessed_at)}
                        </TableCell>
                        <TableCell>{entry.user?.full_name ?? entry.user_id}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              entry.action.endsWith('_blocked') &&
                                'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            )}
                          >
                            {entry.action.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground">
                          {entry.user_agent ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Acknowledgements ---------------- */}
        {doc.requires_acknowledgement && (
          <TabsContent value="acknowledgements">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acknowledgements</CardTitle>
                <CardDescription>
                  Team members who have confirmed reading this document, by version.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!acknowledgements?.length ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    Nobody has acknowledged this document yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Who</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acknowledgements.map(ack => (
                        <TableRow key={ack.id}>
                          <TableCell>{ack.user?.full_name ?? ack.user_id}</TableCell>
                          <TableCell className="font-mono text-xs">v{ack.version}</TableCell>
                          <TableCell>{formatDateTime(ack.acknowledged_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
