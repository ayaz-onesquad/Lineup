import { useState, useCallback, useRef } from 'react'
import { useDocuments, useDocumentMutations, useClients, useProjects } from '@/hooks'
import { useTenantStore, useAuthStore } from '@/stores'
import { documentsApi, StoragePermissionError, StorageBucketNotFoundError } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatDateTime, formatFileSize } from '@/lib/utils'
import {
  Search,
  Upload,
  Download,
  Trash2,
  MoreVertical,
  FileIcon,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  FileVideo,
  FileAudio,
  Grid,
  List,
  Info,
  X,
  CheckCircle2,
  AlertCircle,
  Edit,
  Eye,
} from 'lucide-react'
import type { DocumentWithUploader, EntityType } from '@/types/database'

// File type icons
function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return FileImage
  if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text'))
    return FileText
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv'))
    return FileSpreadsheet
  if (fileType.includes('zip') || fileType.includes('archive') || fileType.includes('compressed'))
    return FileArchive
  if (fileType.startsWith('video/')) return FileVideo
  if (fileType.startsWith('audio/')) return FileAudio
  return FileIcon
}

// File type color
function getFileTypeColor(fileType: string): string {
  if (fileType.startsWith('image/')) return 'bg-purple-100 text-purple-700'
  if (fileType.includes('pdf')) return 'bg-red-100 text-red-700'
  if (fileType.includes('sheet') || fileType.includes('excel')) return 'bg-green-100 text-green-700'
  if (fileType.includes('document') || fileType.includes('word')) return 'bg-blue-100 text-blue-700'
  if (fileType.includes('zip') || fileType.includes('archive')) return 'bg-yellow-100 text-yellow-700'
  if (fileType.startsWith('video/')) return 'bg-pink-100 text-pink-700'
  if (fileType.startsWith('audio/')) return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-700'
}

// Entity type label
function getEntityTypeLabel(entityType: EntityType): string {
  const labels: Record<EntityType, string> = {
    client: 'Client',
    project: 'Project',
    phase: 'Phase',
    set: 'Set',
    requirement: 'Requirement',
    lead: 'Lead',
    pitch: 'Pitch',
  }
  return labels[entityType] || entityType
}

interface FileUploadState {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

const ENTITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Entities' },
  { value: 'client', label: 'Clients' },
  { value: 'project', label: 'Projects' },
  { value: 'set', label: 'Sets' },
  { value: 'requirement', label: 'Requirements' },
  { value: 'lead', label: 'Leads' },
  { value: 'pitch', label: 'Pitches' },
]

const UPLOAD_ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'project', label: 'Project' },
]

const FILE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'image', label: 'Images' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documents' },
  { value: 'spreadsheet', label: 'Spreadsheets' },
  { value: 'archive', label: 'Archives' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
]

export function DocumentsPage() {
  const { currentTenant } = useTenantStore()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filters and view
  const [search, setSearch] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('all')
  const [fileTypeFilter, setFileTypeFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [isDragging, setIsDragging] = useState(false)

  // Upload state
  const [uploadQueue, setUploadQueue] = useState<FileUploadState[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadEntityType, setUploadEntityType] = useState<EntityType>('client')
  const [uploadEntityId, setUploadEntityId] = useState('')
  const [showInPortal, setShowInPortal] = useState(false)

  // Edit state
  const [editingDoc, setEditingDoc] = useState<DocumentWithUploader | null>(null)
  const [editName, setEditName] = useState('')

  // Fetch data
  const { data: documents, isLoading } = useDocuments()
  const { data: clients } = useClients()
  const { data: projects } = useProjects()
  const { deleteDocument, updateDocument } = useDocumentMutations()

  // Get entity options based on selected type
  const getEntityOptions = () => {
    if (uploadEntityType === 'client') {
      return clients?.map((c) => ({ value: c.id, label: c.name })) || []
    }
    if (uploadEntityType === 'project') {
      return projects?.map((p) => ({ value: p.id, label: p.name })) || []
    }
    return []
  }

  // Filter documents
  const filteredDocuments = documents?.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase())
    const matchesEntityType =
      entityTypeFilter === 'all' || doc.entity_type === entityTypeFilter
    const matchesFileType =
      fileTypeFilter === 'all' ||
      (fileTypeFilter === 'image' && doc.file_type.startsWith('image/')) ||
      (fileTypeFilter === 'pdf' && doc.file_type.includes('pdf')) ||
      (fileTypeFilter === 'document' &&
        (doc.file_type.includes('document') || doc.file_type.includes('word'))) ||
      (fileTypeFilter === 'spreadsheet' &&
        (doc.file_type.includes('sheet') || doc.file_type.includes('excel'))) ||
      (fileTypeFilter === 'archive' &&
        (doc.file_type.includes('zip') || doc.file_type.includes('archive'))) ||
      (fileTypeFilter === 'video' && doc.file_type.startsWith('video/')) ||
      (fileTypeFilter === 'audio' && doc.file_type.startsWith('audio/'))
    return matchesSearch && matchesEntityType && matchesFileType
  })

  // Handle file selection - show dialog to select entity
  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files?.length) return
    setPendingFiles(Array.from(files))
    setShowUploadDialog(true)
  }, [])

  // Process uploads after entity selection
  const handleConfirmUpload = useCallback(async () => {
    if (!pendingFiles.length || !currentTenant || !user || !uploadEntityId) return

    setShowUploadDialog(false)
    const fileArray = pendingFiles
    setPendingFiles([])

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

      setUploadQueue((prev) =>
        prev.map((item, idx) =>
          idx === queueIndex ? { ...item, status: 'uploading' as const, progress: 50 } : item
        )
      )

      try {
        await documentsApi.upload(
          currentTenant.id,
          user.id,
          uploadEntityType,
          uploadEntityId,
          file,
          showInPortal
        )

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
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        setUploadQueue((prev) =>
          prev.map((item, idx) =>
            idx === queueIndex
              ? { ...item, status: 'error' as const, error: errorMessage }
              : item
          )
        )

        if (error instanceof StorageBucketNotFoundError) {
          toast({
            title: 'Storage Bucket Not Found',
            description:
              'The "documents" bucket must be created in Supabase Dashboard: Storage > Create Bucket > name: "documents", public: OFF',
            variant: 'destructive',
            duration: 12000,
          })
        } else if (error instanceof StoragePermissionError) {
          toast({
            title: 'Storage Access Denied',
            description:
              'Your session may need to be refreshed. Please log out and log back in.',
            variant: 'destructive',
            duration: 8000,
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

    // Clear completed uploads after delay
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((item) => item.status !== 'success'))
    }, 3000)
  }, [currentTenant, user, pendingFiles, uploadEntityType, uploadEntityId, showInPortal, uploadQueue.length])

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
    handleFilesSelected(e.dataTransfer.files)
  }

  const handleDownload = (doc: DocumentWithUploader) => {
    documentsApi.download(doc.file_url)
  }

  const handleDelete = (doc: DocumentWithUploader) => {
    if (confirm('Are you sure you want to delete this document?')) {
      deleteDocument.mutate(doc.id)
    }
  }

  const handleEdit = (doc: DocumentWithUploader) => {
    setEditingDoc(doc)
    setEditName(doc.name)
  }

  const handleSaveEdit = () => {
    if (editingDoc && editName.trim()) {
      updateDocument.mutate({
        id: editingDoc.id,
        updates: { name: editName.trim() },
      })
      setEditingDoc(null)
    }
  }

  const removeFromQueue = (index: number) => {
    setUploadQueue((prev) => prev.filter((_, i) => i !== index))
  }

  const entityOptions = getEntityOptions()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Manage all files across your workspace
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          Upload Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 transition-colors text-center',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          'hover:border-primary/50 cursor-pointer'
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-base font-medium">
          Drag and drop files here, or{' '}
          <span className="text-primary underline">browse</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Supports all file types up to 50MB
        </p>
      </div>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3">Uploading Files</h3>
            <div className="space-y-2">
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
                  {item.status === 'pending' && (
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="truncate">{item.file.name}</p>
                    {item.status === 'uploading' && (
                      <Progress value={item.progress} className="h-1 mt-1" />
                    )}
                    {item.status === 'error' && (
                      <p className="text-xs text-red-500">{item.error}</p>
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(item.file.size)}
                  </span>

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
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Entity Type" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="File Type" />
          </SelectTrigger>
          <SelectContent>
            {FILE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-md" role="group" aria-label="View mode">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-r-none"
            onClick={() => setViewMode('list')}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-l-none"
            onClick={() => setViewMode('grid')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <Grid className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Documents */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !filteredDocuments?.length ? (
        <Card className="card-carbon">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No documents found</p>
            <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload your first document
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <Card className="card-carbon">
          <CardContent className="p-0">
            {/* Table interaction hint */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
              <Info className="h-3 w-3" aria-hidden="true" />
              <span>
                {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Portal</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => {
                    const Icon = getFileIcon(doc.file_type)
                    return (
                      <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div
                            className={cn(
                              'p-2 rounded w-fit',
                              getFileTypeColor(doc.file_type)
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span className="truncate max-w-[300px]">{doc.name}</span>
                            {doc.description && (
                              <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                                {doc.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getEntityTypeLabel(doc.entity_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFileSize(doc.file_size_bytes)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(doc.created_at)}
                        </TableCell>
                        <TableCell>
                          {doc.show_in_client_portal && (
                            <Badge variant="secondary" className="text-xs">
                              Visible
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Actions for ${doc.name}`}
                              >
                                <MoreVertical className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleDownload(doc)}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(doc.file_url, '_blank')}>
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(doc)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(doc)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredDocuments.map((doc) => {
            const Icon = getFileIcon(doc.file_type)
            return (
              <Card
                key={doc.id}
                className="group cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleDownload(doc)}
              >
                <CardContent className="p-4">
                  <div
                    className={cn(
                      'w-full aspect-square rounded-lg flex items-center justify-center mb-3',
                      getFileTypeColor(doc.file_type)
                    )}
                  >
                    <Icon className="h-12 w-12" />
                  </div>
                  <p className="text-sm font-medium truncate" title={doc.name}>
                    {doc.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(doc.file_size_bytes)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload(doc)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(doc)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(doc)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Upload Dialog - Entity Selection */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription>
              Select where to attach these {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Pending files preview */}
            <div className="max-h-32 overflow-y-auto space-y-1 border rounded-lg p-2 bg-muted/30">
              {pendingFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>

            {/* Entity Type Selection */}
            <div className="space-y-2">
              <Label>Attach to</Label>
              <Select
                value={uploadEntityType}
                onValueChange={(v) => {
                  setUploadEntityType(v as EntityType)
                  setUploadEntityId('')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_ENTITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity Selection */}
            <div className="space-y-2">
              <Label>Select {uploadEntityType === 'client' ? 'Client' : 'Project'}</Label>
              <Select value={uploadEntityId} onValueChange={setUploadEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${uploadEntityType}...`} />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Portal visibility toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="portal-toggle">Show in Client Portal</Label>
                <p className="text-xs text-muted-foreground">
                  Make these files visible to clients
                </p>
              </div>
              <Switch
                id="portal-toggle"
                checked={showInPortal}
                onCheckedChange={setShowInPortal}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false)
                setPendingFiles([])
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmUpload} disabled={!uploadEntityId}>
              <Upload className="mr-2 h-4 w-4" />
              Upload {pendingFiles.length} File{pendingFiles.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingDoc} onOpenChange={() => setEditingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Document</DialogTitle>
            <DialogDescription>Enter a new name for this document.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="docName">Document Name</Label>
            <Input
              id="docName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-2"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
