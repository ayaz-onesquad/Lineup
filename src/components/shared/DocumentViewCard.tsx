import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { formatDate, formatFileSize } from '@/lib/utils'
import { documentsApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  FileIcon,
  Link as LinkIcon,
  ExternalLink,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react'
import type { Document, DocumentWithUploader } from '@/types/database'

// Helper to get file icon based on file type
function getFileIcon(fileType: string | null | undefined) {
  if (!fileType) return FileIcon
  if (fileType.startsWith('image/')) return FileImage
  if (fileType.includes('pdf') || fileType.includes('document')) return FileText
  if (fileType.includes('sheet') || fileType.includes('excel')) return FileSpreadsheet
  if (fileType.includes('zip') || fileType.includes('archive')) return FileArchive
  return FileIcon
}

// Helper to get visibility badge variant
function getVisibilityBadge(visibility?: string) {
  switch (visibility) {
    case 'client':
      return { label: 'Client-Visible', variant: 'secondary' as const }
    case 'public':
      return { label: 'Public', variant: 'outline' as const }
    default:
      return { label: 'Internal', variant: 'secondary' as const }
  }
}

// Helper to format document type label
function formatDocumentType(type: string | null | undefined): string {
  if (!type) return ''
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface DocumentViewCardProps {
  document: Document | DocumentWithUploader
  onEdit?: () => void
  onDelete?: () => void
}

export function DocumentViewCard({ document, onEdit, onDelete }: DocumentViewCardProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const hasFile = !!document.file_url
  const hasLink = !!document.external_link
  const FileTypeIcon = getFileIcon(document.file_type)
  const visibilityBadge = getVisibilityBadge(document.visibility)

  const handleDownload = async () => {
    if (!document.file_url) return

    setIsDownloading(true)
    try {
      const signedUrl = await documentsApi.getSignedUrl(document.file_url)
      window.open(signedUrl, '_blank')
    } catch (error) {
      console.error('Failed to get download URL:', error)
      toast({
        title: 'Download failed',
        description: 'Could not generate download link. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleOpenLink = () => {
    if (document.external_link) {
      window.open(document.external_link, '_blank')
    }
  }

  const handleDeleteConfirm = () => {
    setDeleteDialogOpen(false)
    onDelete?.()
  }

  // Get uploader/updater names if available
  const uploaderName = (document as DocumentWithUploader).uploader?.full_name
  const updaterName = (document as DocumentWithUploader).updater?.full_name

  return (
    <>
      <Card className="hover:bg-muted/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="p-2 rounded-lg bg-muted shrink-0">
              {hasLink && !hasFile ? (
                <LinkIcon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <FileTypeIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-medium truncate">{document.name}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {document.document_type && (
                      <Badge variant="outline" className="text-xs">
                        {formatDocumentType(document.document_type)}
                      </Badge>
                    )}
                    <Badge variant={visibilityBadge.variant} className="text-xs">
                      {visibilityBadge.label}
                    </Badge>
                    {document.show_in_client_portal && (
                      <Badge variant="secondary" className="text-xs">
                        Portal
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={onEdit}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {hasLink && (
                      <DropdownMenuItem onClick={handleOpenLink}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Link
                      </DropdownMenuItem>
                    )}
                    {hasFile && (
                      <DropdownMenuItem onClick={handleDownload} disabled={isDownloading}>
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Download
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteDialogOpen(true)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Description */}
              {document.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{document.description}</p>
              )}

              {/* Attachments section */}
              <div className="space-y-1.5 pt-1">
                {hasLink && (
                  <div className="flex items-center gap-2 text-sm">
                    <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground truncate flex-1">
                      {document.external_link}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handleOpenLink}
                    >
                      Open
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                )}

                {hasFile && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileTypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground truncate">
                      {document.file_type?.split('/').pop() || 'File'}
                    </span>
                    {document.file_size_bytes !== undefined && document.file_size_bytes > 0 && (
                      <span className="text-muted-foreground">
                        ({formatFileSize(document.file_size_bytes)})
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs ml-auto"
                      onClick={handleDownload}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          Download
                          <Download className="h-3 w-3 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Audit info */}
              <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
                <p>
                  Created {uploaderName ? `by ${uploaderName} ` : ''}on{' '}
                  {formatDate(document.created_at)}
                </p>
                {document.updated_at !== document.created_at && (
                  <p>
                    Updated {updaterName ? `by ${updaterName} ` : ''}on{' '}
                    {formatDate(document.updated_at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{document.name}"? This action cannot be undone.
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
