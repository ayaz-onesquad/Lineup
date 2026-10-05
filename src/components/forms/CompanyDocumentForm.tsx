import { useCallback, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCompanyDocumentMutations } from '@/hooks/useCompanyDocuments'
import { useTenantUsers } from '@/hooks/useTenant'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Loader2,
  UploadCloud,
  FileText,
  X,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import {
  COMPANY_DOCUMENT_TYPE_OPTIONS,
  COMPANY_DOCUMENT_STATUS_OPTIONS,
  COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS,
  COMPANY_DOCUMENT_CATEGORY_OPTIONS,
  COMPANY_DOCUMENT_ACCEPT,
  MAX_COMPANY_DOCUMENT_BYTES,
  validateCompanyDocumentFile,
  CompanyDocumentValidationError,
  isInlineViewable,
} from '@/lib/companyDocuments'
import type {
  CompanyDocumentType,
  CompanyDocumentStatus,
  CompanyDocumentConfidentiality,
} from '@/types/database'

const formSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(255),
    document_type: z.string().min(1, 'Document type is required'),
    category: z.string().optional(),
    reference_code: z.string().max(100).optional(),
    version: z.string().min(1, 'Version is required').max(50),
    status: z.string().min(1),
    confidentiality: z.string().min(1),
    owner_user_id: z.string().optional(),
    effective_date: z.string().optional(),
    review_due_date: z.string().optional(),
    description: z.string().optional(),
    allow_download: z.boolean(),
    watermark_on_view: z.boolean(),
    requires_acknowledgement: z.boolean(),
    external_link: z.string().optional(),
  })
  .refine(
    data =>
      !data.external_link ||
      /^https?:\/\//i.test(data.external_link.trim()),
    { message: 'Links must start with http:// or https://', path: ['external_link'] }
  )
  .refine(
    data =>
      !data.effective_date ||
      !data.review_due_date ||
      data.review_due_date >= data.effective_date,
    { message: 'The review date cannot be before the effective date', path: ['review_due_date'] }
  )

type CompanyDocumentFormData = z.infer<typeof formSchema>

interface CompanyDocumentFormProps {
  onSuccess?: () => void
}

export function CompanyDocumentForm({ onSuccess }: CompanyDocumentFormProps) {
  const { createDocument, uploadFile } = useCompanyDocumentMutations()
  const { data: tenantUsers } = useTenantUsers()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CompanyDocumentFormData>({
    resolver: zodResolver(formSchema),
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
      // View-only by default: staff read protocols in the app rather than
      // keeping copies on their own devices.
      allow_download: false,
      watermark_on_view: true,
      requires_acknowledgement: false,
      external_link: '',
    },
  })

  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const ownerOptions = (tenantUsers ?? []).map(tu => ({
    value: tu.user_id,
    label: tu.user_profiles?.full_name || 'Unnamed user',
    description: tu.role,
  }))

  const acceptFile = useCallback(
    (file: File) => {
      try {
        validateCompanyDocumentFile(file)
        setSelectedFile(file)
        setFileError(null)
        // Pre-fill the title from the file name on first pick, as a convenience.
        if (!form.getValues('title')) {
          form.setValue('title', file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
        }
      } catch (err) {
        setSelectedFile(null)
        setFileError(
          err instanceof CompanyDocumentValidationError
            ? err.message
            : 'That file could not be accepted.'
        )
      }
    },
    [form]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (file) acceptFile(file)
    },
    [acceptFile]
  )

  const clearFile = () => {
    setSelectedFile(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onSubmit = async (data: CompanyDocumentFormData) => {
    const link = data.external_link?.trim() || null

    // The database CHECK requires a file or a link; fail here with a clear
    // message rather than surfacing a constraint violation.
    if (!selectedFile && !link) {
      setFileError('Upload a file, or provide an external link instead.')
      return
    }

    setIsSubmitting(true)
    setUploadProgress(0)

    try {
      let fileFields: {
        storage_path?: string | null
        file_name?: string | null
        file_type?: string | null
        file_size_bytes?: number | null
        file_checksum?: string | null
      } = {}

      if (selectedFile) {
        const uploaded = await uploadFile.mutateAsync({
          file: selectedFile,
          onProgress: setUploadProgress,
        })
        fileFields = uploaded
      }

      await createDocument.mutateAsync({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        document_type: data.document_type as CompanyDocumentType,
        category: data.category || null,
        reference_code: data.reference_code?.trim() || null,
        status: data.status as CompanyDocumentStatus,
        version: data.version.trim(),
        effective_date: data.effective_date || null,
        review_due_date: data.review_due_date || null,
        owner_user_id: data.owner_user_id || null,
        confidentiality: data.confidentiality as CompanyDocumentConfidentiality,
        allow_download: data.allow_download,
        watermark_on_view: data.watermark_on_view,
        requires_acknowledgement: data.requires_acknowledgement,
        external_link: link,
        ...fileFields,
      })

      form.reset()
      clearFile()
      onSuccess?.()
    } catch {
      // Both mutations already surface a toast; nothing to add here.
    } finally {
      setIsSubmitting(false)
      setUploadProgress(0)
    }
  }

  const viewableInApp = selectedFile
    ? isInlineViewable(selectedFile.name, selectedFile.type)
    : false

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-5">
        {/* ---------------- File upload ---------------- */}
        <div className="space-y-2">
          <FormLabel>Document File</FormLabel>
          {selectedFile ? (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
                {viewableInApp ? (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <ShieldCheck className="h-3 w-3" />
                    Can be read in the app without downloading
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Cannot be previewed in the browser. Convert to PDF for view-only access.
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={clearFile}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={e => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              )}
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drop a file here, or click to choose one
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, Word, Excel, PowerPoint, images, text or CSV. Up to{' '}
                {Math.round(MAX_COMPANY_DOCUMENT_BYTES / (1024 * 1024))} MB. PDF is
                recommended so the document can be read in the app.
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={COMPANY_DOCUMENT_ACCEPT}
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) acceptFile(file)
            }}
          />

          {fileError && <p className="text-sm font-medium text-destructive">{fileError}</p>}

          {isSubmitting && selectedFile && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-1.5" />
              <p className="text-xs text-muted-foreground">Uploading…</p>
            </div>
          )}
        </div>

        {/* ---------------- Core fields ---------------- */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Title</FormLabel>
              <FormControl>
                <Input placeholder="Client Onboarding SOP" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="document_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Document Type</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={[...COMPANY_DOCUMENT_TYPE_OPTIONS]}
                    value={field.value}
                    onValueChange={value => field.onChange(value || '')}
                    placeholder="Select type..."
                    searchPlaceholder="Search types..."
                  />
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
                    options={[...COMPANY_DOCUMENT_CATEGORY_OPTIONS]}
                    value={field.value}
                    onValueChange={value => field.onChange(value || '')}
                    placeholder="Select category..."
                    searchPlaceholder="Search or type custom..."
                    clearable
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="reference_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference Code</FormLabel>
                <FormControl>
                  <Input placeholder="SOP-OPS-014" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="version"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Version</FormLabel>
                <FormControl>
                  <Input placeholder="1.0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Status</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={[...COMPANY_DOCUMENT_STATUS_OPTIONS]}
                    value={field.value}
                    onValueChange={value => field.onChange(value || 'draft')}
                    placeholder="Select status..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="owner_user_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Document Owner</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={ownerOptions}
                    value={field.value}
                    onValueChange={value => field.onChange(value || '')}
                    placeholder="Defaults to you"
                    searchPlaceholder="Search team..."
                    emptyMessage="No team members found."
                    clearable
                  />
                </FormControl>
                <FormDescription>
                  The owner is responsible for keeping this document current.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confidentiality"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Confidentiality</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={[...COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS]}
                    value={field.value}
                    onValueChange={value => field.onChange(value || 'internal')}
                    placeholder="Select level..."
                  />
                </FormControl>
                <FormDescription>
                  Restricted and Confidential are visible only to administrators and
                  the owner.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="effective_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="review_due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Next Review Due</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Summary / Instructions</FormLabel>
              <FormControl>
                <RichTextEditor
                  content={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="What this document covers, when to use it, who it applies to..."
                  minHeight="140px"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="external_link"
          render={({ field }) => (
            <FormItem>
              <FormLabel>External Link</FormLabel>
              <FormControl>
                <Input placeholder="https://..." {...field} />
              </FormControl>
              <FormDescription>
                Use instead of a file when the document lives in an external system.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ---------------- Handling controls ---------------- */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Access controls</h4>
          </div>

          <FormField
            control={form.control}
            name="allow_download"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <FormLabel className="font-normal">Allow downloading</FormLabel>
                  <FormDescription>
                    Off means the document is read in the app only, so no copies
                    land on personal devices.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="watermark_on_view"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <FormLabel className="font-normal">Watermark when viewed</FormLabel>
                  <FormDescription>
                    Overlays the reader's email and the time, so screenshots are
                    traceable.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="requires_acknowledgement"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <FormLabel className="font-normal">Require acknowledgement</FormLabel>
                  <FormDescription>
                    Ask readers to confirm they have read this version.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Document
        </Button>
      </form>
    </Form>
  )
}
