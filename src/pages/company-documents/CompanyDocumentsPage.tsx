import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCompanyDocuments,
  useCompanyDocumentMutations,
} from '@/hooks/useCompanyDocuments'
import { useBulkDelete } from '@/hooks/useBulkDelete'
import { useUIStore } from '@/stores'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { GridToolbar, GridSearch, GridFilterSelect } from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
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
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Download,
  Lock,
  CalendarClock,
  FileText,
  Link2,
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
  const { data: documents, isLoading, error, refetch } = useCompanyDocuments()
  const { deleteDocument, downloadDocument } = useCompanyDocumentMutations()
  const onBulkDelete = useBulkDelete(deleteDocument.mutateAsync, {
    singular: 'document',
    plural: 'documents',
    queryKey: ['company-documents'],
  })
  const { openCreateModal, openDetailPanel } = useUIStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [confidentialityFilter, setConfidentialityFilter] = useState('')
  const [docToDelete, setDocToDelete] = useState<CompanyDocumentWithPeople | null>(null)

  const hasActiveFilters =
    !!searchQuery ||
    !!typeFilter ||
    !!statusFilter ||
    !!categoryFilter ||
    !!confidentialityFilter

  const clearFilters = () => {
    setSearchQuery('')
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

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the title identifies the
  // row, the four facts needed to triage a document are secondary, and the
  // display ID is hidden on mobile because the card title already names it.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<CompanyDocumentWithPeople>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '100px',
        accessor: row => row.display_id ?? 0,
        exportValue: row => `DOC-${String(row.display_id ?? 0).padStart(4, '0')}`,
        cell: row => (
          <Badge variant="outline" className="font-mono text-xs">
            DOC-{String(row.display_id ?? 0).padStart(4, '0')}
          </Badge>
        ),
      },
      {
        id: 'title',
        header: 'Title',
        priority: 'primary',
        hideable: false,
        minWidth: '220px',
        accessor: row => row.title,
        cell: row => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {row.storage_path ? (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <TruncatedCell value={row.title} maxLines={1} />
            </div>
            {row.reference_code && (
              <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                {row.reference_code}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'document_type',
        header: 'Type',
        priority: 'secondary',
        width: '150px',
        accessor: row => companyDocumentTypeLabel(row.document_type),
        cell: row => (
          <Badge variant="secondary">{companyDocumentTypeLabel(row.document_type)}</Badge>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '130px',
        accessor: row => companyDocumentStatusLabel(row.status),
        cell: row => (
          <Badge
            variant="outline"
            className={cn('text-xs', COMPANY_DOCUMENT_STATUS_STYLES[row.status])}
          >
            {companyDocumentStatusLabel(row.status)}
          </Badge>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        priority: 'secondary',
        width: '160px',
        accessor: row => row.owner?.full_name ?? '',
        cell: row => <TruncatedCell value={row.owner?.full_name} maxLines={1} />,
      },
      {
        id: 'review_due_date',
        header: 'Review Due',
        priority: 'secondary',
        mobileLabel: 'Review',
        width: '140px',
        accessor: row => row.review_due_date,
        cell: row =>
          row.review_due_date ? (
            <span
              className={cn(
                isReviewOverdue(row) && 'font-medium text-warning'
              )}
            >
              {formatDate(row.review_due_date)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'confidentiality',
        header: 'Sensitivity',
        width: '140px',
        accessor: row => row.confidentiality,
        cell: row => (
          <Badge
            variant="outline"
            className={cn(
              'text-xs capitalize',
              COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES[row.confidentiality]
            )}
          >
            {row.confidentiality}
          </Badge>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        width: '150px',
        accessor: row => row.category ?? '',
      },
      {
        id: 'version',
        header: 'Version',
        width: '100px',
        numeric: true,
        accessor: row => row.version,
      },
      {
        id: 'access',
        header: 'Access',
        width: '140px',
        sortable: true,
        accessor: row => (row.allow_download ? 'Download' : 'View only'),
        cell: row => (
          <div className="space-y-0.5">
            <Badge variant="outline" className="gap-1 text-xs">
              {row.allow_download ? (
                <>
                  <Download className="h-3 w-3" />
                  Download
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3" />
                  View only
                </>
              )}
            </Badge>
            {row.file_size_bytes ? (
              <span className="block text-xs text-muted-foreground">
                {formatFileSize(row.file_size_bytes)}
              </span>
            ) : null}
          </div>
        ),
      },
    ],
    []
  )

  return (
    <PageShell
      title="Company Documents"
      description="SOPs, protocols and processing guides, read in the app rather than downloaded"
      icon={BookLock}
      actions={
        <Button onClick={() => openCreateModal('company_document')} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Document
        </Button>
      }
      banner={
        overdueCount > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {overdueCount} {overdueCount === 1 ? 'document is' : 'documents are'} due
              for review.
            </span>
          </div>
        ) : null
      }
    >
      <DataGrid
        columns={columns}
        data={filtered}
        getRowId={row => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="company-documents"
        defaultSort={{ columnId: 'title', direction: 'asc' }}
        ariaLabel="Company documents"
        // Single click opens the quick-view panel, double click or a mobile tap
        // opens the record. Section 4.5.
        onRowClick={row => openDetailPanel('company_document', row.id, row)}
        onRowOpen={row => navigate(`/company-documents/${row.id}`)}
        bulkDelete={{
          entityName: 'document',
          onDelete: onBulkDelete,
          entityPath: 'company-documents',
          onNavigate: navigate,
        }}
        exportOptions={{ fileName: 'Company Documents' }}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        emptyState={{
          icon: BookLock,
          title: 'No company documents yet',
          description:
            'Upload your first SOP, protocol or processing guide to get started.',
          action: (
            <Button onClick={() => openCreateModal('company_document')}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Document
            </Button>
          ),
        }}
        toolbar={
          <GridToolbar
            activeFilterCount={
              [typeFilter, statusFilter, categoryFilter, confidentialityFilter].filter(
                Boolean
              ).length
            }
            onClearFilters={clearFilters}
            search={
              <GridSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by title, reference, owner or tag..."
              />
            }
          >
            <GridFilterSelect
              label="Type"
              options={COMPANY_DOCUMENT_TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
            />
            <GridFilterSelect
              label="Status"
              options={COMPANY_DOCUMENT_STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <GridFilterSelect
              label="Category"
              options={COMPANY_DOCUMENT_CATEGORY_OPTIONS}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
            <GridFilterSelect
              label="Sensitivity"
              options={COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS}
              value={confidentialityFilter}
              onChange={setConfidentialityFilter}
            />
          </GridToolbar>
        }
        rowActions={row => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Document actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50">
              <DropdownMenuItem onClick={() => navigate(`/company-documents/${row.id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                Open &amp; Read
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/company-documents/${row.id}?edit=true`)}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {row.allow_download && row.storage_path && (
                <DropdownMenuItem onClick={() => downloadDocument.mutate(row)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDocToDelete(row)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

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
              onClick={async () => {
                if (!docToDelete) return
                await deleteDocument.mutateAsync(docToDelete.id)
                setDocToDelete(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
