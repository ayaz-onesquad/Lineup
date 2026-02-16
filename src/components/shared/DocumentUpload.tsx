import { useState, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentsApi, StoragePermissionError, StorageBucketNotFoundError } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FileIcon,
  Upload,
  Download,
  Trash2,
  MoreHorizontal,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { formatDateTime, formatFileSize } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { EntityType, DocumentWithUploader } from '@/types/database'

// File type icons
function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return FileImage
  if (fileType.includes('pdf') || fileType.includes('document')) return FileText
  if (fileType.includes('sheet') || fileType.includes('excel')) return FileSpreadsheet
  if (fileType.includes('zip') || fileType.includes('archive')) return FileArchive
  return FileIcon
}

interface FileUploadState {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface DocumentUploadProps {
  entityType: EntityType
  entityId: string
  title?: string
  description?: string
  maxHeight?: string
  allowMultiple?: boolean
  showInClientPortal?: boolean
  className?: string
}

export function DocumentUpload({
  entityType,
  entityId,
  title = 'Documents',
  description = 'Upload and manage files',
  maxHeight = '400px',
  allowMultiple = true,
  showInClientPortal = false,
  className,
}: DocumentUploadProps) {
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadQueue, setUploadQueue] = useState<FileUploadState[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Fetch existing documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => documentsApi.getByEntity(entityType, entityId),
    enabled: !!entityType && !!entityId,
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return documentsApi.upload(
        currentTenant!.id,
        user!.id,
        entityType,
        entityId,
        file,
        showInClientPortal
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] })
      toast({ title: 'Document deleted' })
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' })
    },
  })

  // Handle file selection
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return

      const fileArray = Array.from(files)
      const newUploads: FileUploadState[] = fileArray.map((file) => ({
        file,
        progress: 0,
        status: 'pending' as const,
      }))

      setUploadQueue((prev) => [...prev, ...newUploads])

      // Process uploads sequentially
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const queueIndex = uploadQueue.length + i

        // Update status to uploading
        setUploadQueue((prev) =>
          prev.map((item, idx) =>
            idx === queueIndex ? { ...item, status: 'uploading' as const, progress: 50 } : item
          )
        )

        try {
          await uploadMutation.mutateAsync(file)

          // Update status to success
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === queueIndex ? { ...item, status: 'success' as const, progress: 100 } : item
            )
          )

          toast({
            title: 'Upload complete',
            description: `${file.name} uploaded successfully`,
          })
        } catch (error) {
          // Update status to error
          const errorMessage = error instanceof Error ? error.message : 'Upload failed'
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === queueIndex
                ? {
                    ...item,
                    status: 'error' as const,
                    error: errorMessage,
                  }
                : item
            )
          )

          // Show specific toasts for different error types
          if (error instanceof StorageBucketNotFoundError) {
            toast({
              title: 'Storage Bucket Not Found',
              description:
                'The "documents" bucket must be created in Supabase Dashboard: Storage > Create Bucket > name: "documents", public: OFF',
              variant: 'destructive',
              duration: 12000, // Show longer for setup instructions
            })
          } else if (error instanceof StoragePermissionError) {
            toast({
              title: 'Storage Access Denied',
              description:
                'Your session may need to be refreshed. Please log out and log back in to sync your tenant access.',
              variant: 'destructive',
              duration: 8000, // Show longer for important action
            })
          } else {
            toast({
              title: 'Upload failed',
              description: `Failed to upload ${file.name}`,
              variant: 'destructive',
            })
          }
        }
      }

      // Clear completed uploads after a delay
      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((item) => item.status !== 'success'))
      }, 3000)
    },
    [uploadMutation, uploadQueue.length]
  )

  // Drag and drop handlers
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
    handleFiles(e.dataTransfer.files)
  }

  const handleDownload = (doc: DocumentWithUploader) => {
    documentsApi.download(doc.file_url)
  }

  const handleDelete = (doc: DocumentWithUploader) => {
    if (confirm('Are you sure you want to delete this document?')) {
      deleteMutation.mutate(doc.id)
    }
  }

  const removeFromQueue = (index: number) => {
    setUploadQueue((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileIcon className="h-4 w-4" />
            {title}
          </CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3" />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple={allowMultiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </CardHeader>

      <CardContent className="pt-0">
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 mb-4 transition-colors text-center',
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            'hover:border-primary/50 cursor-pointer'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag files here or <span className="text-primary">browse</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Max 50MB per file</p>
        </div>

        {/* Upload Queue */}
        {uploadQueue.length > 0 && (
          <div className="space-y-2 mb-4">
            {uploadQueue.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm"
              >
                {item.status === 'uploading' && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
                {item.status === 'success' && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {item.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                {item.status === 'pending' && <FileIcon className="h-4 w-4 text-muted-foreground" />}

                <div className="flex-1 min-w-0">
                  <p className="truncate">{item.file.name}</p>
                  {item.status === 'uploading' && (
                    <Progress value={item.progress} className="h-1 mt-1" />
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-500">{item.error}</p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFromQueue(index)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Document List */}
        <ScrollArea style={{ maxHeight }}>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !documents?.length ? (
            <div className="text-center text-muted-foreground py-8">
              <FileIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents</p>
              <p className="text-xs mt-1">Upload files to attach them to this record</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const Icon = getFileIcon(doc.file_type)

                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                  >
                    <div className="p-2 rounded bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size_bytes)} •{' '}
                        {formatDateTime(doc.created_at)}
                      </p>
                    </div>

                    {doc.show_in_client_portal && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Portal
                      </Badge>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload(doc)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(doc)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
