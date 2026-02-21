import { useState, useCallback, useRef, useMemo } from 'react'
import {
  useDocuments,
  useDocumentMutations,
  useClients,
  useProjectsByClient,
  usePhasesByProject,
  useSetsByPhase,
  useSetsByProject,
  usePitchesBySet,
  useRequirementsBySet,
  useRequirementsByPitch,
} from '@/hooks'
import { useLeads } from '@/hooks/useLeads'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
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
  Link as LinkIcon,
  ExternalLink,
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

// Document Type Catalog for categorization
const DOCUMENT_TYPE_CATALOG: { value: string; label: string; description?: string }[] = [
  { value: 'contract', label: 'Contract', description: 'Legal agreements and contracts' },
  { value: 'proposal', label: 'Proposal', description: 'Project proposals and bids' },
  { value: 'invoice', label: 'Invoice', description: 'Billing and invoices' },
  { value: 'brief', label: 'Brief', description: 'Creative and project briefs' },
  { value: 'report', label: 'Report', description: 'Status and progress reports' },
  { value: 'presentation', label: 'Presentation', description: 'Slide decks and presentations' },
  { value: 'design', label: 'Design Asset', description: 'Design files and mockups' },
  { value: 'brand', label: 'Brand Asset', description: 'Logos, guidelines, brand materials' },
  { value: 'photo', label: 'Photo/Image', description: 'Photography and imagery' },
  { value: 'video', label: 'Video', description: 'Video content and footage' },
  { value: 'audio', label: 'Audio', description: 'Audio files and recordings' },
  { value: 'spec', label: 'Specification', description: 'Technical specifications' },
  { value: 'reference', label: 'Reference Material', description: 'Reference documents and research' },
  { value: 'meeting_notes', label: 'Meeting Notes', description: 'Meeting minutes and notes' },
  { value: 'approval', label: 'Approval Document', description: 'Sign-off and approval documents' },
  { value: 'other', label: 'Other', description: 'Miscellaneous documents' },
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
  const [documentCategory, setDocumentCategory] = useState('')
  const [showInPortal, setShowInPortal] = useState(false)
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file')
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkDescription, setLinkDescription] = useState('')

  // Cascading parent selection state
  const [rootEntityType, setRootEntityType] = useState<'lead' | 'client'>('client')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedPhaseId, setSelectedPhaseId] = useState('')
  const [selectedSetId, setSelectedSetId] = useState('')
  const [selectedPitchId, setSelectedPitchId] = useState('')
  const [selectedRequirementId, setSelectedRequirementId] = useState('')

  // Edit state
  const [editingDoc, setEditingDoc] = useState<DocumentWithUploader | null>(null)
  const [editName, setEditName] = useState('')

  // Fetch data
  const { data: documents, isLoading } = useDocuments()
  const { data: clients } = useClients()
  const { data: leads } = useLeads()
  const { deleteDocument, updateDocument } = useDocumentMutations()

  // Cascading data hooks - fetch based on parent selection
  const { data: projectsForClient } = useProjectsByClient(selectedClientId)
  const { data: phasesForProject } = usePhasesByProject(selectedProjectId)
  const { data: setsForPhase } = useSetsByPhase(selectedPhaseId)
  const { data: setsForProject } = useSetsByProject(selectedProjectId)
  const { data: pitchesForSet } = usePitchesBySet(selectedSetId)
  const { data: requirementsForSet } = useRequirementsBySet(selectedSetId)
  const { data: requirementsForPitch } = useRequirementsByPitch(selectedPitchId)

  // Determine available sets - either from phase or directly from project
  const availableSets = useMemo(() => {
    if (selectedPhaseId && setsForPhase) return setsForPhase
    if (selectedProjectId && setsForProject && !selectedPhaseId) return setsForProject
    return []
  }, [selectedPhaseId, selectedProjectId, setsForPhase, setsForProject])

  // Compute final entity type and ID for upload
  const uploadEntityType: EntityType = useMemo(() => {
    if (selectedRequirementId) return 'requirement'
    if (selectedPitchId) return 'pitch'
    if (selectedSetId) return 'set'
    if (selectedPhaseId) return 'phase'
    if (selectedProjectId) return 'project'
    if (rootEntityType === 'lead' && selectedLeadId) return 'lead'
    if (rootEntityType === 'client' && selectedClientId) return 'client'
    return 'client'
  }, [rootEntityType, selectedLeadId, selectedClientId, selectedProjectId, selectedPhaseId, selectedSetId, selectedPitchId, selectedRequirementId])

  const uploadEntityId = useMemo(() => {
    if (selectedRequirementId) return selectedRequirementId
    if (selectedPitchId) return selectedPitchId
    if (selectedSetId) return selectedSetId
    if (selectedPhaseId) return selectedPhaseId
    if (selectedProjectId) return selectedProjectId
    if (rootEntityType === 'lead') return selectedLeadId
    return selectedClientId
  }, [rootEntityType, selectedLeadId, selectedClientId, selectedProjectId, selectedPhaseId, selectedSetId, selectedPitchId, selectedRequirementId])

  // Helper to reset cascading selections from a given level down
  const resetFromLevel = useCallback((level: 'root' | 'project' | 'phase' | 'set' | 'pitch') => {
    switch (level) {
      case 'root':
        setSelectedLeadId('')
        setSelectedClientId('')
        setSelectedProjectId('')
        setSelectedPhaseId('')
        setSelectedSetId('')
        setSelectedPitchId('')
        setSelectedRequirementId('')
        break
      case 'project':
        setSelectedProjectId('')
        setSelectedPhaseId('')
        setSelectedSetId('')
        setSelectedPitchId('')
        setSelectedRequirementId('')
        break
      case 'phase':
        setSelectedPhaseId('')
        setSelectedSetId('')
        setSelectedPitchId('')
        setSelectedRequirementId('')
        break
      case 'set':
        setSelectedSetId('')
        setSelectedPitchId('')
        setSelectedRequirementId('')
        break
      case 'pitch':
        setSelectedPitchId('')
        setSelectedRequirementId('')
        break
    }
  }, [])

  // Get combined requirements (from set or pitch)
  const requirementOptions = useMemo(() => {
    if (selectedPitchId && requirementsForPitch) {
      return requirementsForPitch.map(r => ({ value: r.id, label: r.title || `Requirement #${r.display_id}` }))
    }
    if (selectedSetId && requirementsForSet) {
      return requirementsForSet.map(r => ({ value: r.id, label: r.title || `Requirement #${r.display_id}` }))
    }
    return []
  }, [selectedSetId, selectedPitchId, requirementsForSet, requirementsForPitch])

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

  // Process link creation
  const handleConfirmLink = useCallback(async () => {
    if (!currentTenant || !user || !uploadEntityId || !linkName.trim() || !linkUrl.trim()) return

    try {
      await documentsApi.createLink(
        currentTenant.id,
        user.id,
        uploadEntityType,
        uploadEntityId,
        linkName.trim(),
        linkUrl.trim(),
        linkDescription.trim() || undefined,
        showInPortal
      )

      toast({
        title: 'Link added',
        description: `${linkName} added successfully`,
      })

      setShowUploadDialog(false)
      setLinkName('')
      setLinkUrl('')
      setLinkDescription('')
    } catch (error) {
      toast({
        title: 'Failed to add link',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [currentTenant, user, uploadEntityType, uploadEntityId, linkName, linkUrl, linkDescription, showInPortal])

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
        <div className="flex items-center gap-2">
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Upload Files
          </Button>
          <Button variant="outline" onClick={() => {
            setUploadMode('link')
            setShowUploadDialog(true)
          }}>
            <LinkIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Link
          </Button>
        </div>
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
                    const isLink = (doc as { document_type?: string }).document_type === 'link'
                    const docUrl = isLink ? (doc as { url?: string }).url : doc.file_url
                    const Icon = isLink ? LinkIcon : getFileIcon(doc.file_type)
                    return (
                      <TableRow
                        key={doc.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => isLink ? window.open(docUrl, '_blank') : handleDownload(doc)}
                      >
                        <TableCell>
                          <div
                            className={cn(
                              'p-2 rounded w-fit',
                              isLink ? 'bg-blue-100 text-blue-700' : getFileTypeColor(doc.file_type)
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="truncate max-w-[300px]">{doc.name}</span>
                              {isLink && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                            </div>
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
                          {isLink ? <span className="text-xs">External Link</span> : formatFileSize(doc.file_size_bytes)}
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

      {/* Upload Dialog - File or Link */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => {
        setShowUploadDialog(open)
        if (!open) {
          setPendingFiles([])
          setLinkName('')
          setLinkUrl('')
          setLinkDescription('')
          setDocumentCategory('')
          // Reset cascading selections
          setRootEntityType('client')
          resetFromLevel('root')
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>
              Upload a file or add an external link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* File / Link Toggle */}
            <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'file' | 'link')}>
              <TabsList className="w-full">
                <TabsTrigger value="file" className="flex-1 gap-2">
                  <Upload className="h-4 w-4" />
                  Upload File
                </TabsTrigger>
                <TabsTrigger value="link" className="flex-1 gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Add External Link
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* File Upload Content */}
            {uploadMode === 'file' && pendingFiles.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1 border rounded-lg p-2 bg-muted/30">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                  </div>
                ))}
              </div>
            )}

            {uploadMode === 'file' && pendingFiles.length === 0 && (
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select files</p>
              </div>
            )}

            {/* Link Input Fields */}
            {uploadMode === 'link' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Link Name *</Label>
                  <Input
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="e.g., Design Mockups - Figma"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL *</Label>
                  <Input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* Document Type Catalog */}
            <div className="space-y-2">
              <Label>Document Type</Label>
              <SearchableSelect
                options={DOCUMENT_TYPE_CATALOG.map(opt => ({
                  value: opt.value,
                  label: opt.label,
                  description: opt.description,
                }))}
                value={documentCategory}
                onValueChange={(value) => setDocumentCategory(value || '')}
                placeholder="Select document type..."
                searchPlaceholder="Search types..."
                emptyMessage="No document types found."
                clearable
              />
            </div>

            {/* Cascading Parent Selection */}
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <Label className="text-sm font-medium">Attach to Parent <span className="text-destructive">*</span></Label>

              {/* Root Type Toggle (Lead or Client) */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20 shrink-0">Type:</Label>
                <Tabs
                  value={rootEntityType}
                  onValueChange={(v) => {
                    setRootEntityType(v as 'lead' | 'client')
                    resetFromLevel('root')
                  }}
                  className="flex-1"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="client" className="flex-1">Client</TabsTrigger>
                    <TabsTrigger value="lead" className="flex-1">Lead</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Lead Selection (if root is lead) */}
              {rootEntityType === 'lead' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-20 shrink-0">Lead: <span className="text-destructive">*</span></Label>
                  <div className="flex-1">
                    <SearchableSelect
                      options={leads?.map(l => ({ value: l.id, label: l.lead_name })) || []}
                      value={selectedLeadId}
                      onValueChange={(v) => setSelectedLeadId(v || '')}
                      placeholder="Select lead..."
                      searchPlaceholder="Search leads..."
                      emptyMessage="No leads found."
                      clearable
                    />
                  </div>
                </div>
              )}

              {/* Client Selection (if root is client) */}
              {rootEntityType === 'client' && (
                <>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">Client: <span className="text-destructive">*</span></Label>
                    <div className="flex-1">
                      <SearchableSelect
                        options={clients?.map(c => ({ value: c.id, label: c.name })) || []}
                        value={selectedClientId}
                        onValueChange={(v) => {
                          setSelectedClientId(v || '')
                          resetFromLevel('project')
                        }}
                        placeholder="Select client..."
                        searchPlaceholder="Search clients..."
                        emptyMessage="No clients found."
                        clearable
                      />
                    </div>
                  </div>

                  {/* Project Selection */}
                  {selectedClientId && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-20 shrink-0">Project:</Label>
                      <div className="flex-1">
                        <SearchableSelect
                          options={projectsForClient?.map(p => ({ value: p.id, label: p.name })) || []}
                          value={selectedProjectId}
                          onValueChange={(v) => {
                            setSelectedProjectId(v || '')
                            resetFromLevel('phase')
                          }}
                          placeholder="Select project (optional)..."
                          searchPlaceholder="Search projects..."
                          emptyMessage="No projects found."
                          clearable
                        />
                      </div>
                    </div>
                  )}

                  {/* Phase Selection */}
                  {selectedProjectId && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-20 shrink-0">Phase:</Label>
                      <div className="flex-1">
                        <SearchableSelect
                          options={phasesForProject?.map(p => ({ value: p.id, label: p.name })) || []}
                          value={selectedPhaseId}
                          onValueChange={(v) => {
                            setSelectedPhaseId(v || '')
                            resetFromLevel('set')
                          }}
                          placeholder="Select phase (optional)..."
                          searchPlaceholder="Search phases..."
                          emptyMessage="No phases found."
                          clearable
                        />
                      </div>
                    </div>
                  )}

                  {/* Set Selection - Available after Project (with or without Phase) */}
                  {selectedProjectId && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-20 shrink-0">Set:</Label>
                      <div className="flex-1">
                        <SearchableSelect
                          options={availableSets?.map(s => ({ value: s.id, label: s.name })) || []}
                          value={selectedSetId}
                          onValueChange={(v) => {
                            setSelectedSetId(v || '')
                            resetFromLevel('pitch')
                          }}
                          placeholder="Select set (optional)..."
                          searchPlaceholder="Search sets..."
                          emptyMessage={selectedPhaseId ? "No sets in this phase." : "No sets in this project."}
                          clearable
                        />
                      </div>
                    </div>
                  )}

                  {/* Pitch Selection */}
                  {selectedSetId && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-20 shrink-0">Pitch:</Label>
                      <div className="flex-1">
                        <SearchableSelect
                          options={pitchesForSet?.map(p => ({ value: p.id, label: p.name })) || []}
                          value={selectedPitchId}
                          onValueChange={(v) => {
                            setSelectedPitchId(v || '')
                            setSelectedRequirementId('')
                          }}
                          placeholder="Select pitch (optional)..."
                          searchPlaceholder="Search pitches..."
                          emptyMessage="No pitches found."
                          clearable
                        />
                      </div>
                    </div>
                  )}

                  {/* Requirement Selection (from Set or Pitch) */}
                  {(selectedSetId || selectedPitchId) && requirementOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-20 shrink-0">Requirement:</Label>
                      <div className="flex-1">
                        <SearchableSelect
                          options={requirementOptions}
                          value={selectedRequirementId}
                          onValueChange={(v) => setSelectedRequirementId(v || '')}
                          placeholder="Select requirement (optional)..."
                          searchPlaceholder="Search requirements..."
                          emptyMessage="No requirements found."
                          clearable
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Show current attachment target */}
              {uploadEntityId && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Attaching to: <Badge variant="secondary" className="ml-1">{getEntityTypeLabel(uploadEntityType)}</Badge>
                </div>
              )}
            </div>

            {/* Portal visibility toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="portal-toggle">Show in Client Portal</Label>
                <p className="text-xs text-muted-foreground">
                  Make visible to clients
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
                setLinkName('')
                setLinkUrl('')
                setLinkDescription('')
                setDocumentCategory('')
                // Reset cascading selections
                setRootEntityType('client')
                resetFromLevel('root')
              }}
            >
              Cancel
            </Button>
            {uploadMode === 'file' ? (
              <Button onClick={handleConfirmUpload} disabled={!uploadEntityId || pendingFiles.length === 0}>
                <Upload className="mr-2 h-4 w-4" />
                Upload {pendingFiles.length} File{pendingFiles.length !== 1 ? 's' : ''}
              </Button>
            ) : (
              <Button onClick={handleConfirmLink} disabled={!uploadEntityId || !linkName.trim() || !linkUrl.trim()}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Add Link
              </Button>
            )}
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
