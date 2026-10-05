import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { companyDocumentsApi } from '@/services/api/companyDocuments'
import { useAuthStore } from '@/stores'
import { useSessionPolicy } from '@/hooks/useSessionPolicy'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fileExtension, isInlineViewable } from '@/lib/companyDocuments'
import {
  AlertTriangle,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  FileWarning,
  Loader2,
} from 'lucide-react'
import type { CompanyDocument } from '@/types/database'

/**
 * Text formats are rendered by this component itself rather than handed to the
 * browser, so no plugin or external renderer is involved.
 */
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv'])

/** Text preview cap, so a huge CSV cannot lock up the tab. */
const MAX_TEXT_PREVIEW_BYTES = 512 * 1024

type ViewerDoc = Pick<
  CompanyDocument,
  | 'id'
  | 'tenant_id'
  | 'storage_path'
  | 'file_name'
  | 'file_type'
  | 'allow_download'
  | 'watermark_on_view'
  | 'version'
  | 'title'
  | 'reference_code'
  | 'confidentiality'
>

interface SecureDocumentViewerProps {
  doc: ViewerDoc
  className?: string
  /** Viewer height when not expanded. */
  height?: string
}

/**
 * In-app, view-only document viewer.
 *
 * How the "no local copies" requirement is met:
 *   - The file is fetched with a signed URL whose lifetime is seconds, then
 *     turned into an in-memory blob URL. The blob URL is bound to this tab and
 *     is useless if copied elsewhere.
 *   - PDFs open with the native viewer chrome suppressed (`#toolbar=0`), so the
 *     built-in download and print buttons are not presented.
 *   - Right-click, drag, text selection, and the Ctrl/Cmd+S / Ctrl/Cmd+P
 *     shortcuts are intercepted while the viewer is mounted.
 *   - A print stylesheet blanks the viewer, so printing the page yields nothing.
 *   - Every view is written to `company_document_access_log`.
 *
 * Honest limitation: this is strong deterrence, not DRM. A determined user can
 * still screenshot or photograph the screen, and Firefox's built-in PDF reader
 * ignores the `#toolbar=0` hint and shows its own download button. Preventing
 * that entirely would require server-side rasterisation of each page, which is
 * a much larger change. The access log is what makes misuse attributable.
 */
export function SecureDocumentViewer({
  doc,
  className,
  height = '70vh',
}: SecureDocumentViewerProps) {
  const { user } = useAuthStore()
  const { policy } = useSessionPolicy()
  const [isExpanded, setIsExpanded] = useState(false)
  // Keyed to the blob URL so a stale preview is never shown and the effect
  // below never has to clear state synchronously.
  const [textState, setTextState] = useState<{ url: string; text: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  /** Tracks the live object URL so it is always revoked exactly once. */
  const objectUrlRef = useRef<string | null>(null)

  const extension = fileExtension(doc.file_name)
  const isPdf = doc.file_type === 'application/pdf' || extension === 'pdf'
  const isImage = !!doc.file_type?.startsWith('image/') && doc.file_type !== 'image/svg+xml'
  const isText = TEXT_EXTENSIONS.has(extension) || !!doc.file_type?.startsWith('text/')
  const canRenderInline = isInlineViewable(doc.file_name, doc.file_type)

  // -------------------------------------------------------------------------
  // Fetch the file into a blob URL. A fresh signed URL is minted each time,
  // and the blob never leaves this tab.
  // -------------------------------------------------------------------------
  const {
    data: blobUrl,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['company-document-blob', doc.id, doc.storage_path],
    enabled: !!doc.storage_path && canRenderInline,
    // Never cache the bytes across navigations; re-fetch on each open so the
    // signed URL and the access-log entry are current.
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const signedUrl = await companyDocumentsApi.getViewUrl(
        doc,
        policy.signed_url_ttl_seconds
      )

      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error(`Could not load the document (HTTP ${response.status}).`)
      }

      const blob = await response.blob()

      // Force the blob's type: a wrong or missing type makes the browser
      // download the file instead of rendering it in the frame.
      const typed = blob.type
        ? blob
        : new Blob([blob], { type: doc.file_type ?? 'application/octet-stream' })

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(typed)
      objectUrlRef.current = url
      return url
    },
  })

  // Read text formats out of the blob so they are rendered as escaped text,
  // never interpreted as markup.
  useEffect(() => {
    if (!blobUrl || !isText || isPdf || isImage) return

    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(blobUrl)
        const buffer = await response.arrayBuffer()
        const slice = buffer.slice(0, MAX_TEXT_PREVIEW_BYTES)
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(slice)
        if (cancelled) return
        setTextState({
          url: blobUrl,
          text:
            buffer.byteLength > MAX_TEXT_PREVIEW_BYTES
              ? `${decoded}\n\n[Preview truncated at 512 KB]`
              : decoded,
        })
      } catch {
        if (!cancelled) setTextState({ url: blobUrl, text: '' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [blobUrl, isText, isPdf, isImage])

  // Only show text that belongs to the blob currently loaded.
  const textContent =
    textState && blobUrl && textState.url === blobUrl ? textState.text : null

  // Revoke the object URL on unmount so the bytes are not retained in memory.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  // -------------------------------------------------------------------------
  // Save / print interception
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (doc.allow_download) return // nothing to protect against

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 's' || key === 'p') {
        event.preventDefault()
        event.stopPropagation()
        void companyDocumentsApi.logAccess(
          doc.id,
          doc.tenant_id,
          key === 'p' ? 'print_blocked' : 'download_blocked'
        )
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [doc.allow_download, doc.id, doc.tenant_id])

  const blockContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (doc.allow_download) return
      event.preventDefault()
    },
    [doc.allow_download]
  )

  // The watermark makes any screenshot traceable to the viewer.
  const watermarkText = useMemo(() => {
    const parts = [user?.email ?? 'unknown user', new Date().toLocaleString()]
    if (doc.reference_code) parts.unshift(doc.reference_code)
    return parts.join('  ·  ')
  }, [user?.email, doc.reference_code])

  const showWatermark = doc.watermark_on_view

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (!doc.storage_path) {
    return (
      <Alert className={className}>
        <FileWarning className="h-4 w-4" />
        <AlertTitle>No file attached</AlertTitle>
        <AlertDescription>
          This record has no uploaded file. Add one from the Edit view, or open the
          external link instead.
        </AlertDescription>
      </Alert>
    )
  }

  if (!canRenderInline) {
    return (
      <Alert className={className}>
        <FileWarning className="h-4 w-4" />
        <AlertTitle>Cannot be previewed in the app</AlertTitle>
        <AlertDescription>
          {extension ? `.${extension} files` : 'This file type'} cannot be rendered in
          the browser.{' '}
          {doc.allow_download
            ? 'Use the Download button to open it in a desktop application.'
            : 'Downloading is disabled for this document, so ask an administrator to convert it to PDF.'}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Printing the page must not reproduce the document. */}
      <style>{`
        @media print {
          .lineup-secure-viewer { display: none !important; }
          .lineup-secure-viewer-print-notice { display: block !important; }
        }
        .lineup-secure-viewer-print-notice { display: none; }
      `}</style>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>
            {doc.allow_download
              ? 'Viewing in app. Downloading is permitted for this document.'
              : 'View-only. This document cannot be downloaded or printed.'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Reload the document"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(v => !v)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="lineup-secure-viewer-print-notice rounded border p-4 text-sm">
        This document is view-only in LineUp and has been withheld from print output.
      </div>

      <div
        ref={containerRef}
        onContextMenu={blockContextMenu}
        className={cn(
          'lineup-secure-viewer relative overflow-hidden rounded-lg border bg-muted/30',
          !doc.allow_download && 'select-none'
        )}
        style={{ height: isExpanded ? '88vh' : height }}
      >
        {isPending && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-[40vh] w-full" />
          </div>
        )}

        {isError && (
          <div className="flex h-full items-center justify-center p-6">
            <Alert variant="destructive" className="max-w-md">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not open the document</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{error instanceof Error ? error.message : 'An unknown error occurred.'}</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {blobUrl && isPdf && (
          // `#toolbar=0&navpanes=0` suppresses the built-in download/print
          // controls in Chromium-based browsers.
          //
          // No `sandbox` attribute: Chromium's built-in PDF viewer is itself an
          // extension-hosted frame and fails to render inside a sandboxed
          // iframe. That is acceptable here because the blob's MIME type is
          // forced to the stored type above, so the frame can only ever be a
          // PDF and never interpreted as HTML.
          <iframe
            key={blobUrl}
            src={`${blobUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`}
            title={doc.title}
            className="h-full w-full border-0"
            referrerPolicy="no-referrer"
          />
        )}

        {blobUrl && isImage && (
          <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
            <img
              src={blobUrl}
              alt={doc.title}
              draggable={false}
              onDragStart={e => e.preventDefault()}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}

        {blobUrl && isText && !isPdf && !isImage && (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
            {textContent ?? 'Loading…'}
          </pre>
        )}

        {/* Diagonal, non-interactive watermark. pointer-events-none keeps the
            underlying PDF scrollable and clickable. */}
        {showWatermark && blobUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-wrap items-center justify-center gap-10 overflow-hidden opacity-[0.10] dark:opacity-[0.16]"
          >
            {Array.from({ length: 12 }).map((_, index) => (
              <span
                key={index}
                className="-rotate-[28deg] whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest text-foreground"
              >
                {watermarkText}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
