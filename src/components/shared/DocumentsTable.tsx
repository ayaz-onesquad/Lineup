import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  FileText,
  Link as LinkIcon,
  ExternalLink,
  Eye,
  Download,
  ArrowRight,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/urlSafety'
import { documentsApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import type { Document, DocumentWithUploader } from '@/types/database'

type AnyDocument = Document | DocumentWithUploader

/** "signed_contract" -> "Signed Contract" */
function formatDocumentType(type: string | null | undefined): string {
  if (!type) return ''
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface DocumentsTableProps {
  documents: AnyDocument[]
  onEdit?: (doc: AnyDocument) => void
  onDelete?: (doc: AnyDocument) => void
  isLoading?: boolean
}

/**
 * Shared documents grid, used by the Documents tab on seven detail pages.
 *
 * Migrated to `DataGrid`, so all seven inherit sortable columns and the mobile
 * card view from one place. Previously this was a raw `<Table>` whose five
 * columns were unsortable and squeezed to illegibility on a phone.
 *
 * Row actions live in `DocumentRowActions` rather than in a column renderer,
 * because each row's view/download buttons own their loading state and the
 * delete dialog.
 */
export function DocumentsTable({
  documents,
  onEdit,
  onDelete,
  isLoading,
}: DocumentsTableProps) {
  const navigate = useNavigate()

  const columns = useMemo<DataGridColumn<AnyDocument>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        priority: 'primary',
        hideable: false,
        minWidth: '220px',
        accessor: row => row.name,
        cell: row => (
          <div className="flex min-w-0 items-center gap-2">
            {row.file_url ? (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-medium">{row.name}</span>
          </div>
        ),
      },
      {
        id: 'document_type',
        header: 'Type',
        priority: 'secondary',
        width: '160px',
        accessor: row => formatDocumentType(row.document_type) || '',
        cell: row =>
          row.document_type ? (
            <Badge variant="outline">{formatDocumentType(row.document_type)}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'created_at',
        header: 'Added',
        priority: 'secondary',
        width: '130px',
        accessor: row => row.created_at,
        cell: row => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.created_at)}
          </span>
        ),
      },
      {
        id: 'description',
        header: 'Description',
        minWidth: '200px',
        accessor: row => row.description ?? '',
        cell: row => <TruncatedCell value={row.description} maxLines={1} />,
      },
    ],
    []
  )

  return (
    <DataGrid
      columns={columns}
      data={documents}
      getRowId={row => row.id}
      isLoading={isLoading}
      storageKey="documents-tab"
      defaultSort={{ columnId: 'created_at', direction: 'desc' }}
      ariaLabel="Documents"
      onRowOpen={row => navigate(`/documents/${row.id}`)}
      emptyState={{
        icon: FileText,
        title: 'No documents yet',
        description: 'Add a file or link to get started',
      }}
      rowActions={row => (
        <DocumentRowActions document={row} onEdit={onEdit} onDelete={onDelete} />
      )}
    />
  )
}

/**
 * Per-row actions. A separate component so each row keeps its own loading and
 * dialog state without re-rendering the whole grid.
 */
function DocumentRowActions({
  document: doc,
  onEdit,
  onDelete,
}: {
  document: AnyDocument
  onEdit?: (doc: AnyDocument) => void
  onDelete?: (doc: AnyDocument) => void
}) {
  const navigate = useNavigate()
  const [viewLoading, setViewLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const hasFile = !!doc.file_url
  const externalHref = safeHttpUrl(doc.external_link)

  const handleView = async () => {
    if (!doc.file_url) return
    setViewLoading(true)
    try {
      const url = await documentsApi.getSignedUrl(doc.file_url)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Failed to get view URL:', error)
      toast({
        title: 'View failed',
        description: 'Could not open file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setViewLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!doc.file_url) return
    setDownloadLoading(true)
    try {
      const signedUrl = await documentsApi.getSignedUrl(doc.file_url)
      await documentsApi.downloadFile(signedUrl, doc.name)
    } catch (error) {
      console.error('Failed to download file:', error)
      toast({
        title: 'Download failed',
        description: 'Could not download file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDownloadLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        {externalHref && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open external link"
                onClick={() => window.open(externalHref, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open external link</TooltipContent>
          </Tooltip>
        )}

        {hasFile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="View file"
                onClick={handleView}
                disabled={viewLoading}
              >
                {viewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>View file</TooltipContent>
          </Tooltip>
        )}

        {hasFile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Download file"
                onClick={handleDownload}
                disabled={downloadLoading}
              >
                {downloadLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download file</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View document details"
              onClick={() => navigate(`/documents/${doc.id}`)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View document details</TooltipContent>
        </Tooltip>

        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More document actions">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(doc)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{doc.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteDialogOpen(false)
                onDelete?.(doc)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
