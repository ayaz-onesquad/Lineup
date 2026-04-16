import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useClients, useClientMutations, useDataGridFilters, type FilterConfig } from '@/hooks'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, MoreVertical, Building2, ExternalLink, Trash2, Edit, Info, Upload, Filter } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { formatDate, cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { MobileActionBar, BulkActionBar, storeListContext, FilterBar } from '@/components/shared'
import { toast } from '@/hooks/use-toast'

export function ClientsPage() {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: clients, isLoading } = useClients()
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
    setParent,
    setDateFrom,
    setDateTo,
    clearAll,
    hasActiveFilters,
    activeFilterCount,
    applyFilters,
  } = useDataGridFilters(filterConfig)

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
    return filteredClients.filter((client) => rowSelection[client.id])
  }, [filteredClients, rowSelection])

  // Selection helpers
  const isAllSelected = filteredClients.length > 0 && selectedRows.length === filteredClients.length
  const isSomeSelected = selectedRows.length > 0 && selectedRows.length < filteredClients.length

  const handleSelectAll = useCallback((checked: boolean) => {
    const newSelection: Record<string, boolean> = {}
    if (checked) {
      filteredClients.forEach((client) => {
        newSelection[client.id] = true
      })
    }
    setRowSelection(newSelection)
  }, [filteredClients])

  const handleSelectRow = useCallback((rowId: string, checked: boolean) => {
    const newSelection = { ...rowSelection }
    if (checked) {
      newSelection[rowId] = true
    } else {
      delete newSelection[rowId]
    }
    setRowSelection(newSelection)
  }, [rowSelection])

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

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">Manage your client relationships</p>
        </div>
        <Button onClick={() => openCreateModal('client')}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add Client
        </Button>
      </div>

      {/* Toolbar Row */}
      <div className="flex items-center gap-2 mb-3">
        {/* Result count - only when filters active */}
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground">
            {filteredClients.length} of {clients?.length ?? 0}
          </span>
        )}

        {/* Push buttons to the right */}
        <div className="ml-auto flex items-center gap-2">
          {/* Filter toggle button */}
          <Button
            variant={filtersOpen || hasActiveFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen(v => !v)}
            className="gap-1.5"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="h-4 px-1 text-xs ml-0.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          {/* Import button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkUpload(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
        </div>
      </div>

      {/* Collapsible FilterBar */}
      <FilterBar
        config={filterConfig}
        filters={filters}
        onSearch={setSearch}
        onStatuses={setStatuses}
        onParent={setParent}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        onClearAll={clearAll}
        hasActiveFilters={hasActiveFilters}
        resultCount={filteredClients.length}
        totalCount={clients?.length ?? 0}
        collapsed={!filtersOpen}
      />

      {/* Client List */}
      <Card className="card-carbon">
        <CardContent className="p-0">
          {/* Table interaction hint */}
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>Click a row to preview, double-click to open full details</span>
          </div>
          {/* Scrollable table container for mobile */}
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = isSomeSelected
                      }
                    }}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    aria-label="Select all"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableHead>
                <TableHead className="w-[80px]"></TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredClients?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No clients found</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCreateModal('client')}
                      >
                        Add your first client
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients?.map((client) => (
                  <TableRow
                    key={client.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 min-h-[44px]',
                      selectedRowId === client.id && 'bg-muted',
                      rowSelection[client.id] && 'bg-muted/50'
                    )}
                    onClick={() => {
                      // Mobile: select row to show action bar
                      // Desktop: open detail panel
                      if (window.innerWidth < 768) {
                        setSelectedRowId(selectedRowId === client.id ? null : client.id)
                      } else {
                        openDetailPanel('client', client.id)
                      }
                    }}
                    onDoubleClick={() => navigateToClient(client.id)}
                  >
                    {/* Checkbox column */}
                    <TableCell>
                      <Checkbox
                        checked={!!rowSelection[client.id]}
                        onCheckedChange={(checked) => handleSelectRow(client.id, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select row"
                      />
                    </TableCell>
                    {/* Actions column */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${client.name}`}>
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="z-50">
                            <DropdownMenuItem onClick={() => navigateToClient(client.id)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigateToClient(client.id, true)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteClient.mutate(client.id)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        {client.primary_contact && (
                          <p className="text-sm text-muted-foreground">
                            {client.primary_contact.first_name} {client.primary_contact.last_name}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{client.industry?.replace('_', ' ') || '-'}</TableCell>
                    <TableCell>{client.location || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={client.status === 'active' ? 'success' : 'secondary'}
                      >
                        {client.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.portal_enabled ? 'info' : 'outline'}>
                        {client.portal_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(client.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

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
        onClearSelection={() => setRowSelection({})}
        onDelete={handleBulkDelete}
        onNavigate={navigate}
      />
    </div>
  )
}
