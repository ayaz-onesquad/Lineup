import { useMemo, useState } from 'react'
import { useMyTickets } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  AlertCircle,
  Info,
  Lightbulb,
  ExternalLink,
  Calendar,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/urlSafety'
import { SubmitTicketDialog } from '@/components/shared'
import type { SupportTicket, TicketType, TicketStatus } from '@/services/api/supportTickets'

const TYPE_CONFIG: Record<TicketType, { icon: typeof AlertCircle; color: string; label: string }> = {
  incident: { icon: AlertCircle, color: 'text-red-600 bg-red-100', label: 'Incident' },
  information: { icon: Info, color: 'text-blue-600 bg-blue-100', label: 'Information' },
  improvement: { icon: Lightbulb, color: 'text-amber-600 bg-amber-100', label: 'Improvement' },
}

const STATUS_CONFIG: Record<TicketStatus, { color: string; label: string }> = {
  open: { color: 'bg-yellow-100 text-yellow-800', label: 'Open' },
  in_progress: { color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
  resolved: { color: 'bg-green-100 text-green-800', label: 'Resolved' },
  closed: { color: 'bg-gray-100 text-gray-800', label: 'Closed' },
}

export function MyTicketsPage() {
  const [search, setSearch] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const { data: tickets, isLoading } = useMyTickets()

  const filteredTickets = tickets?.filter(
    (ticket) =>
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.ticket_id_display.toLowerCase().includes(search.toLowerCase())
  )

  const columns = useMemo<DataGridColumn<SupportTicket>[]>(
    () => [
      {
        id: 'ticket_id',
        header: 'Ticket ID',
        accessor: (t) => t.ticket_id_display,
        cell: (t) => <span className="font-mono text-sm">{t.ticket_id_display}</span>,
        priority: 'secondary',
        mobileLabel: 'ID',
        width: '130px',
      },
      {
        id: 'type',
        header: 'Type',
        accessor: (t) => TYPE_CONFIG[t.type].label,
        cell: (t) => {
          const typeConfig = TYPE_CONFIG[t.type]
          const TypeIcon = typeConfig.icon
          return (
            <Badge className={typeConfig.color} variant="outline">
              <TypeIcon className="h-3 w-3 mr-1" />
              {typeConfig.label}
            </Badge>
          )
        },
        priority: 'secondary',
        width: '150px',
      },
      {
        id: 'title',
        header: 'Title',
        accessor: (t) => t.title,
        cell: (t) => <span className="font-medium">{t.title}</span>,
        priority: 'primary',
        minWidth: '240px',
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (t) => STATUS_CONFIG[t.status].label,
        cell: (t) => (
          <Badge className={STATUS_CONFIG[t.status].color} variant="outline">
            {STATUS_CONFIG[t.status].label}
          </Badge>
        ),
        priority: 'secondary',
        width: '130px',
      },
      {
        id: 'created',
        header: 'Created',
        accessor: (t) => (t.created_at ? new Date(t.created_at) : null),
        exportValue: (t) => formatDate(t.created_at),
        cell: (t) => (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(t.created_at)}
          </div>
        ),
        priority: 'secondary',
        width: '140px',
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Support Tickets</h1>
          <p className="text-muted-foreground">
            View and track your support requests
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {/* Tickets */}
      <DataGrid
        columns={columns}
        data={filteredTickets}
        getRowId={(ticket) => ticket.id}
        isLoading={isLoading}
        onRowClick={setSelectedTicket}
        onRowOpen={setSelectedTicket}
        defaultSort={{ columnId: 'created', direction: 'desc' }}
        rowActions={(ticket) => (
          <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(ticket)}>
            View
          </Button>
        )}
        toolbar={
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        }
        emptyState={{
          icon: Info,
          title: 'No tickets found',
          description: 'Create a new ticket to get started',
        }}
        hasActiveFilters={search.length > 0}
        onClearFilters={() => setSearch('')}
        exportOptions={{ fileName: 'My Support Tickets' }}
        ariaLabel="My support tickets"
      />

      {/* Create Ticket Dialog */}
      <SubmitTicketDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {selectedTicket.ticket_id_display}
                  </span>
                  <span>{selectedTicket.title}</span>
                </DialogTitle>
                <DialogDescription>
                  Submitted on {formatDate(selectedTicket.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Type & Status */}
                <div className="flex items-center gap-4">
                  <Badge className={TYPE_CONFIG[selectedTicket.type].color} variant="outline">
                    {(() => {
                      const Icon = TYPE_CONFIG[selectedTicket.type].icon
                      return <Icon className="h-3 w-3 mr-1" />
                    })()}
                    {TYPE_CONFIG[selectedTicket.type].label}
                  </Badge>
                  <Badge className={STATUS_CONFIG[selectedTicket.status].color} variant="outline">
                    {STATUS_CONFIG[selectedTicket.status].label}
                  </Badge>
                </div>

                {/* Description */}
                {selectedTicket.description && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {selectedTicket.description}
                    </p>
                  </div>
                )}

                {/* Page URL */}
                {selectedTicket.page_url && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Page URL</h4>
                    <a
                      href={safeHttpUrl(selectedTicket.page_url) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 min-w-0 break-all"
                    >
                      {selectedTicket.page_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {/* Resolution */}
                {selectedTicket.resolution && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <h4 className="text-sm font-medium text-green-800 mb-2">Resolution</h4>
                    <p className="text-sm text-green-700 whitespace-pre-wrap break-words">
                      {selectedTicket.resolution}
                    </p>
                    {selectedTicket.resolved_at && (
                      <p className="text-xs text-green-600 mt-2">
                        Resolved on {formatDate(selectedTicket.resolved_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
