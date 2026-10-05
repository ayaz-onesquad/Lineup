import { useNavigate } from 'react-router-dom'
import { useCompanyDocument, useCompanyDocumentMutations } from '@/hooks/useCompanyDocuments'
import { useSessionPolicy } from '@/hooks/useSessionPolicy'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  BookLock,
  Download,
  Lock,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
} from 'lucide-react'
import { formatDate, formatFileSize, cn } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/urlSafety'
import { richTextToPlainText } from '@/lib/sanitize'
import {
  COMPANY_DOCUMENT_STATUS_STYLES,
  COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES,
  companyDocumentTypeLabel,
  companyDocumentStatusLabel,
} from '@/lib/companyDocuments'

/**
 * Quick-view panel for a company document, opened by a single click in the
 * grid. Deliberately does NOT render the file: opening the document is an
 * audited action, so it happens on the full detail page.
 */
export function CompanyDocumentDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const { data: doc, isLoading } = useCompanyDocument(id)
  const { downloadDocument } = useCompanyDocumentMutations()
  const { policy } = useSessionPolicy()
  const { closeDetailPanel } = useUIStore()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (!doc) {
    return (
      <p className="text-sm text-muted-foreground">
        This document is no longer available, or your role does not allow you to view
        it.
      </p>
    )
  }

  const externalHref = safeHttpUrl(doc.external_link)
  const summary = richTextToPlainText(doc.description, 320)

  const openFullPage = () => {
    closeDetailPanel()
    navigate(`/company-documents/${doc.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <BookLock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{doc.title}</h3>
          {doc.reference_code && (
            <p className="font-mono text-xs text-muted-foreground">{doc.reference_code}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          DOC-{String(doc.display_id ?? 0).padStart(4, '0')}
        </Badge>
        <Badge variant="secondary">{companyDocumentTypeLabel(doc.document_type)}</Badge>
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
      </div>

      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

      <Separator />

      <dl className="space-y-2 text-sm">
        <Row label="Version" value={`v${doc.version}`} mono />
        <Row label="Category" value={doc.category} />
        <Row label="Owner" value={doc.owner?.full_name} />
        <Row
          label="Effective"
          value={doc.effective_date ? formatDate(doc.effective_date) : null}
        />
        <Row
          label="Review due"
          value={doc.review_due_date ? formatDate(doc.review_due_date) : null}
        />
        <Row
          label="File"
          value={
            doc.file_name
              ? `${doc.file_name}${
                  doc.file_size_bytes ? ` (${formatFileSize(doc.file_size_bytes)})` : ''
                }`
              : null
          }
        />
      </dl>

      <Separator />

      <div className="space-y-2">
        <Button className="w-full" onClick={openFullPage}>
          {doc.storage_path ? (
            <>
              <Eye className="mr-2 h-4 w-4" />
              Open &amp; Read
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Open details
            </>
          )}
        </Button>

        {doc.allow_download && doc.storage_path && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => downloadDocument.mutate(doc)}
            disabled={downloadDocument.isPending || policy.block_document_download}
          >
            {downloadDocument.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download
          </Button>
        )}

        {externalHref && (
          <Button variant="outline" className="w-full" asChild>
            <a href={externalHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open external link
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value?: string | null
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right', mono && 'font-mono text-xs')}>
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}
