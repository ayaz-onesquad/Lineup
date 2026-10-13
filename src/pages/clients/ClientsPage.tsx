import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useClients, useClientMutations, useDataGridFilters, type FilterConfig } from '@/hooks'
import { useUIStore } from '@/stores'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import {
  GridToolbar,
  GridSearch,
  GridFilterMultiSelect,
} from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Building2, ExternalLink, Trash2, Edit, Info, Upload } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { MobileActionBar, BulkActionBar, storeListContext } from '@/components/shared'
import { toast } from '@/hooks/use-toast'
import type { ClientWithRelations } from '@/types/database'

/** Human label for an industry enum value, e.g. `real_estate` -> `real estate`. */
function industryLabel(industry: string | null | undefined): string {
  return industry ? industry.replace(/_/g, ' ') : ''
}

export function ClientsPage() {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  // DataGrid takes a Set; the page previously used a Record<string, boolean>.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: clients, isLoading, error, refetch } = useClients()
  const { deleteClient } = useClientMutations()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const selectedClient = clients?.find((c) => c.id === selectedRowId) ?? null

  // Filter configuration - clients have no parent filters, just status and search
  const filterConfig: FilterConfig = useMemo(() => ({
    search: true,
    status: ['active', 'inactive'],
    parentFilters: [],
  }), [])

  const {
    filters,
    setSearch,
    setStatuses,
    clearAll,
    hasActiveFilters,
    applyFilters,
  } = useDataGridFilters(filterConfig)

  const statusOptions = useMemo(
    () =>
      (filterConfig.status ?? []).map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
    [filterConfig.status]
  )

  // Apply filters to clients data
  const filteredClients = useMemo(() => {
    if (!clients) return []
    return applyFilters(
      clients,
      ['name', 'company_name', 'industry', 'location', 'display_id'],
      (row) => row.status
    )
  }, [clients, applyFilters])

  // Navigate to client detail and store list context for Save & Next
  const navigateToClient = useCallback((id: string, editMode = false) => {
    const ids = filteredClients.map((c) => c.id)
    storeListContext(ids, 'clients')
    navigate(`/clients/${id}${editMode ? '?edit=true' : ''}`)
  }, [filteredClients, navigate])

  // Get selected rows for bulk actions
  const selectedRows = useMemo(() => {
    return filteredClients.filter((client) => selectedIds.has(client.id))
  }, [filteredClients, selectedIds])

  // Handle bulk delete
  const handleBulkDelete = useCallback(async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteClient.mutateAsync(id))
    )
    const failures = results.filter((r) => r.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['clients'] })
    if (failures.length > 0) {
      toast({
        title: 'Some deletions failed',
        description: `${ids.length - failures.length} of ${ids.length} clients deleted.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Clients deleted',
        description: `${ids.length} client${ids.length !== 1 ? 's' : ''} deleted successfully.`,
      })
    }
  }, [deleteClient, queryClient])

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the client name identifies
  // the row, the four facts needed to triage a relationship are secondary, and
  // the internal display id is desktop-only noise.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<ClientWithRelations>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '100px',
        accessor: (row) => row.display_id ?? 0,
        cell: (row) => (
          <Badge variant="outline" className="font-mono text-xs">
            CL-{String(row.display_id ?? 0).padStart(4, '0')}
          </Badge>
        ),
      },
      {
        id: 'name',
        header: 'Client',
        priority: 'primary',
        hideable: false,
        minWidth: '220px',
        accessor: (row) => row.name,
        cell: (row) => (
          <div className="min-w-0">
            <p className="font-medium">
              <TruncatedCell value={row.name} maxLines={1} />
            </p>
            {row.primary_contact && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {row.primary_contact.first_name} {row.primary_contact.last_name}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'industry',
        header: 'Industry',
        priority: 'secondary',
        width: '150px',
        className: 'capitalize',
        accessor: (row) => industryLabel(row.industry),
      },
      {
        id: 'location',
        header: 'Location',
        priority: 'secondary',
        width: '160px',
        accessor: (row) => row.location ?? '',
        cell: (row) => <TruncatedCell value={row.location} maxLines={1} />,
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'secondary',
        width: '120px',
        accessor: (row) => row.status,
        cell: (row) => (
          <Badge variant={row.status === 'active' ? 'success' : 'secondary'}>
            {row.status}
          </Badge>
        ),
      },
      {
        id: 'portal',
        header: 'Portal',
        priority: 'secondary',
        width: '120px',
        accessor: (row) => (row.portal_enabled ? 'Enabled' : 'Disabled'),
        cell: (row) => (
          <Badge variant={row.portal_enabled ? 'info' : 'outline'}>
            {row.portal_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        ),
      },
      {
        id: 'created_at',
        header: 'Added',
        width: '130px',
        accessor: (row) => row.created_at,
        cell: (row) => formatDate(row.created_at),
      },
    ],
    []
  )

  return (
    <PageShell
      title="Clients"
      description="Manage your client relationships"
      icon={Building2}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => setShowBulkUpload(true)}
            className="w-full sm:w-auto"
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Import
          </Button>
          <Button onClick={() => openCreateModal('client')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Client
          </Button>
        </>
      }
      banner={
        <div className="hidden items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground md:flex">
          <Info className="h-3 w-3" aria-hidden="true" />
          <span>Click a row to preview, double-click to open full details</span>
        </div>
      }
    >
      <DataGrid
        columns={columns}
        data={filteredClients}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="clients"
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        ariaLabel="Clients"
        // Desktop: single click previews, double click opens the record.
        // Mobile: a tap selects the row so MobileActionBar can offer the
        // open/edit/delete actions, matching the previous behaviour.
        onRowClick={(row) => openDetailPanel('client', row.id)}
        onRowOpen={(row) => {
          if (window.innerWidth < 768) {
            setSelectedRowId((current) => (current === row.id ? null : row.id))
          } else {
            navigateToClient(row.id)
          }
        }}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAll}
        emptyState={{
          icon: Building2,
          title: 'No clients found',
          description: 'Add your first client to start tracking the relationship.',
          action: (
            <Button variant="outline" onClick={() => openCreateModal('client')}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add your first client
            </Button>
          ),
        }}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <GridToolbar
              className="min-w-0 flex-1"
              activeFilterCount={filters.statuses.length}
              onClearFilters={clearAll}
              search={
                <GridSearch
                  value={filters.search}
                  onChange={setSearch}
                  placeholder="Search by name, company, industry or location..."
                />
              }
            >
              {/* Multi-select: the underlying filter accepts an array, so a
                  single-value control would silently narrow it. */}
              <GridFilterMultiSelect
                label="Status"
                options={statusOptions}
                values={filters.statuses}
                onChange={setStatuses}
              />
            </GridToolbar>
            {hasActiveFilters && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {filteredClients.length} of {clients?.length ?? 0}
              </span>
            )}
          </div>
        }
        rowActions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50">
              <DropdownMenuItem onClick={() => navigateToClient(row.id)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateToClient(row.id, true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => deleteClient.mutate(row.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Mobile Action Bar */}
      {selectedClient && (
        <MobileActionBar
          selectedName={selectedClient.name}
          onDeselect={() => setSelectedRowId(null)}
          onOpen={() => {
            navigateToClient(selectedClient.id)
            setSelectedRowId(null)
          }}
          onEdit={() => {
            navigateToClient(selectedClient.id, true)
            setSelectedRowId(null)
          }}
          onDelete={() => {
            deleteClient.mutate(selectedClient.id)
            setSelectedRowId(null)
          }}
        />
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="clients"
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedRows={selectedRows}
        entityName="client"
        entityPath="clients"
        onClearSelection={() => setSelectedIds(new Set())}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </PageShell>
  )
}
