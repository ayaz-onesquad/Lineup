import { useState } from 'react'
import { useClients, useClientMutations } from '@/hooks/useClients'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { Plus, Search, MoreVertical, Building2, ExternalLink, Trash2, Edit, Info } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'
import { Link, useNavigate } from 'react-router-dom'
import { MobileActionBar } from '@/components/shared'

export function ClientsPage() {
  const [search, setSearch] = useState('')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const navigate = useNavigate()
  const { data: clients, isLoading } = useClients()
  const { deleteClient } = useClientMutations()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const selectedClient = clients?.find((c) => c.id === selectedRowId) ?? null

  const filteredClients = clients?.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (client.industry && client.industry.toLowerCase().includes(search.toLowerCase())) ||
      (client.location && client.location.toLowerCase().includes(search.toLowerCase()))
  )

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

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

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
                  <TableCell colSpan={7} className="text-center py-8">
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
                      selectedRowId === client.id && 'bg-muted'
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
                    onDoubleClick={() => navigate(`/clients/${client.id}`)}
                  >
                    {/* Actions - FIRST column */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${client.name}`}>
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="z-50">
                            <DropdownMenuItem asChild>
                              <Link to={`/clients/${client.id}`}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/clients/${client.id}?edit=true`}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Details
                              </Link>
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
            navigate(`/clients/${selectedClient.id}`)
            setSelectedRowId(null)
          }}
          onEdit={() => {
            navigate(`/clients/${selectedClient.id}?edit=true`)
            setSelectedRowId(null)
          }}
          onDelete={() => {
            deleteClient.mutate(selectedClient.id)
            setSelectedRowId(null)
          }}
        />
      )}
    </div>
  )
}
