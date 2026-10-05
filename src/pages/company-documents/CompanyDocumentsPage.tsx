import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCompanyDocuments,
  useCompanyDocumentMutations,
} from '@/hooks/useCompanyDocuments'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
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
  BookLock,
  Plus,
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Download,
  Lock,
  CalendarClock,
  FileText,
  Link2,
  X,
} from 'lucide-react'
import { formatDate, formatFileSize, cn } from '@/lib/utils'
import {
  COMPANY_DOCUMENT_TYPE_OPTIONS,
  COMPANY_DOCUMENT_STATUS_OPTIONS,
  COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS,
  COMPANY_DOCUMENT_CATEGORY_OPTIONS,
  COMPANY_DOCUMENT_STATUS_STYLES,
  COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES,
  companyDocumentTypeLabel,
  companyDocumentStatusLabel,
} from '@/lib/companyDocuments'
import type { CompanyDocumentWithPeople } from '@/types/database'

/** A document is flagged as due when its review date is today or in the past. */
function isReviewOverdue(doc: CompanyDocumentWithPeople): boolean {
  if (!doc.review_due_date) return false
  return doc.review_due_date <= new Date().toISOString().slice(0, 10)
}

export function CompanyDocumentsPage() {
  const navigate = useNavigate()
  const { data: documents, isLoading } = useCompanyDocuments()
  const { deleteDocument, downloadDocument } = useCompanyDocumentMutations()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [confidentialityFilter, setConfidentialityFilter] = useState<string>('')
  const [docToDelete, setDocToDelete] = useState<CompanyDocumentWithPeople | null>(null)

  const hasActiveFilters =
    !!typeFilter || !!statusFilter || !!categoryFilter || !!confidentialityFilter

  const clearFilters = () => {
    setTypeFilter('')
    setStatusFilter('')
    setCategoryFilter('')
    setConfidentialityFilter('')
  }

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return (documents ?? []).filter(doc => {
      if (typeFilter && doc.document_type !== typeFilter) return false
      if (statusFilter && doc.status !== statusFilter) return false
      if (categoryFilter && doc.category !== categoryFilter) return false
      if (confidentialityFilter && doc.confidentiality !== confidentialityFilter) return false

      if (!query) return true
      return (
        doc.title.toLowerCase().includes(query) ||
        doc.reference_code?.toLowerCase().includes(query) ||
        doc.category?.toLowerCase().includes(query) ||
        doc.file_name?.toLowerCase().includes(query) ||
        doc.owner?.full_name?.toLowerCase().includes(query) ||
        doc.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    })
  }, [documents, searchQuery, typeFilter, statusFilter, categoryFilter, confidentialityFilter])

  const overdueCount = useMemo(
    () => (documents ?? []).filter(isReviewOverdue).length,
    [documents]
  )

  const confirmDelete = async () => {
    if (!docToDelete) return
    await deleteDocument.mutateAsync(docToDelete.id)
    setDocToDelete(null)
  }

  return (
    <div className="page-carbon space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookLock className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Company Documents</h1>
            <p className="text-muted-foreground">
              SOPs, protocols and processing guides, read in the app rather than
              downloaded
            </p>
          </div>
        </div>
        <Button onClick={() => openCreateModal('company_document')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Document
        </Button>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            {overdueCount} {overdueCount === 1 ? 'document is' : 'documents are'} due
            for review.
          </span>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title, reference, owner or tag..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-[170px]">
          <SearchableSelect
            options={[...COMPANY_DOCUMENT_TYPE_OPTIONS]}
            value={typeFilter}
            onValueChange={v => setTypeFilter(v ?? '')}
            placeholder="All types"
            clearable
          />
        </div>
        <div className="w-[170px]">
          <SearchableSelect
            options={[...COMPANY_DOCUMENT_STATUS_OPTIONS]}
            value={statusFilter}
            onValueChange={v => setStatusFilter(v ?? '')}
            placeholder="All statuses"
            clearable
          />
        </div>
        <div className="w-[180px]">
          <SearchableSelect
            options={[...COMPANY_DOCUMENT_CATEGORY_OPTIONS]}
            value={categoryFilter}
            onValueChange={v => setCategoryFilter(v ?? '')}
            placeholder="All categories"
            clearable
          />
        </div>
        <div className="w-[180px]">
          <SearchableSelect
            options={[...COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS]}
            value={confidentialityFilter}
            onValueChange={v => setConfidentialityFilter(v ?? '')}
            placeholder="All sensitivities"
            clearable
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardHeader className="py-12 text-center">
            <BookLock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <CardTitle>
              {documents?.length ? 'No documents match your filters' : 'No company documents yet'}
            </CardTitle>
            <CardDescription>
              {documents?.length
                ? 'Adjust the search or clear the filters to see more.'
                : 'Upload your first SOP, protocol or processing guide to get started.'}
            </CardDescription>
            {!documents?.length && (
              <Button className="mt-4" onClick={() => openCreateModal('company_document')}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Document
              </Button>
            )}
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Review Due</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(doc => (
                  <TableRow
                    key={doc.id}
                    className="min-h-[44px] cursor-pointer hover:bg-muted/50"
                    // Single click opens the quick-view panel, double click
                    // navigates to the full detail page (CLAUDE.md interaction rule).
                    onClick={() => openDetailPanel('company_document', doc.id, doc)}
                    onDoubleClick={() => navigate(`/company-documents/${doc.id}`)}
                  >
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        DOC-{String(doc.display_id ?? 0).padStart(4, '0')}
                      </Badge>
                    </TableCell>

                    <TableCell className="max-w-[260px] font-medium">
                      <div className="flex items-center gap-2">
                        {doc.storage_path ? (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{doc.title}</span>
                      </div>
                      {doc.reference_code && (
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {doc.reference_code}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary">
                        {companyDocumentTypeLabel(doc.document_type)}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-sm">
                      {doc.category || <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="font-mono text-xs">{doc.version}</TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', COMPANY_DOCUMENT_STATUS_STYLES[doc.status])}
                      >
                        {companyDocumentStatusLabel(doc.status)}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs capitalize',
                          COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES[doc.confidentiality]
                        )}
                      >
                        {doc.confidentiality}
                      </Badge>
                    </TableCell>

                    <TableCell className="max-w-[140px] truncate text-sm">
                      {doc.owner?.full_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="text-sm">
                      {doc.review_due_date ? (
                        <span
                          className={cn(
                            isReviewOverdue(doc) &&
                              'font-medium text-amber-700 dark:text-amber-300'
                          )}
                        >
                          {formatDate(doc.review_due_date)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {doc.allow_download ? (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Download className="h-3 w-3" />
                          Download
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Lock className="h-3 w-3" />
                          View only
                        </Badge>
                      )}
                      {doc.file_size_bytes ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size_bytes)}
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-50">
                          <DropdownMenuItem
                            onClick={() => navigate(`/company-documents/${doc.id}`)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Open &amp; Read
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate(`/company-documents/${doc.id}?edit=true`)
                            }
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {doc.allow_download && doc.storage_path && (
                            <DropdownMenuItem
                              onClick={() => downloadDocument.mutate(doc)}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDocToDelete(doc)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!docToDelete}
        onOpenChange={open => !open && setDocToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {docToDelete?.title} will be removed from the library. The access log and
              version history are kept for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
