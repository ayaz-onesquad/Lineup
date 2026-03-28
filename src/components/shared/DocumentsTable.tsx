import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { documentsApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import type { Document, DocumentWithUploader } from '@/types/database'

// Helper to format document type label
function formatDocumentType(type: string | null | undefined): string {
  if (!type) return ''
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface DocumentsTableProps {
  documents: (Document | DocumentWithUploader)[]
  onEdit?: (doc: Document | DocumentWithUploader) => void
  onDelete?: (doc: Document | DocumentWithUploader) => void
  isLoading?: boolean
}

export function DocumentsTable({
  documents,
  onEdit,
  onDelete,
  isLoading,
}: DocumentsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No documents yet</p>
        <p className="text-sm mt-1">Add a file or link to get started</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <DocumentTableRow
              key={doc.id}
              document={doc}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}

interface DocumentTableRowProps {
  document: Document | DocumentWithUploader
  onEdit?: (doc: Document | DocumentWithUploader) => void
  onDelete?: (doc: Document | DocumentWithUploader) => void
}

function DocumentTableRow({
  document: doc,
  onEdit,
  onDelete,
}: DocumentTableRowProps) {
  const navigate = useNavigate()
  const [viewLoading, setViewLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const hasFile = !!doc.file_url
  const hasLink = !!doc.external_link

  const handleView = async () => {
    if (!doc.file_url) return
    setViewLoading(true)
    try {
      const url = await documentsApi.getSignedUrl(doc.file_url)
      window.open(url, '_blank')
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
      const url = await documentsApi.getSignedUrl(doc.file_url)
      const a = window.document.createElement('a')
      a.href = url
      a.download = doc.name
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to get download URL:', error)
      toast({
        title: 'Download failed',
        description: 'Could not download file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleDeleteConfirm = () => {
    setDeleteDialogOpen(false)
    onDelete?.(doc)
  }

  // Document detail route is now available
  const hasDetailRoute = true

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onDoubleClick={() => navigate(`/documents/${doc.id}`)}
      >
        {/* Actions - FIRST column */}
        <TableCell>
          <div className="flex items-center gap-1">
            {/* Open external link */}
            {hasLink && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => window.open(doc.external_link!, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open external link</TooltipContent>
              </Tooltip>
            )}

            {/* View file in browser */}
            {hasFile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
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

            {/* Download file */}
            {hasFile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
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

            {/* View details page */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => hasDetailRoute && navigate(`/documents/${doc.id}`)}
                  disabled={!hasDetailRoute}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hasDetailRoute ? 'View document details' : 'Coming soon'}
              </TooltipContent>
            </Tooltip>

            {/* Edit / Delete via dropdown */}
            {(onEdit || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(doc)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>

        {/* Name + icon */}
        <TableCell>
          <div className="flex items-center gap-2">
            {hasFile ? (
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium">{doc.name}</span>
          </div>
        </TableCell>

        {/* Type */}
        <TableCell>
          {doc.document_type ? (
            <Badge variant="outline">{formatDocumentType(doc.document_type)}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Description */}
        <TableCell>
          {doc.description ? (
            <span
              className="text-sm text-muted-foreground truncate max-w-[200px] block"
              title={doc.description}
            >
              {doc.description.length > 60
                ? `${doc.description.substring(0, 60)}...`
                : doc.description}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Added date */}
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(doc.created_at)}
        </TableCell>
      </TableRow>

      {/* Delete confirmation dialog */}
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
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
