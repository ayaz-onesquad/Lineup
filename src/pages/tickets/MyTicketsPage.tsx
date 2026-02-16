import { useState } from 'react'
import { useMyTickets } from '@/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Support Tickets</h1>
          <p className="text-muted-foreground">
            View and track your support requests
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>
            {filteredTickets?.length || 0} ticket(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTickets?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No tickets found</p>
              <p className="text-sm mt-1">Create a new ticket to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets?.map((ticket) => {
                  const typeConfig = TYPE_CONFIG[ticket.type]
                  const statusConfig = STATUS_CONFIG[ticket.status]
                  const TypeIcon = typeConfig.icon

                  return (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-mono text-sm">
                        {ticket.ticket_id_display}
                      </TableCell>
                      <TableCell>
                        <Badge className={typeConfig.color} variant="outline">
                          <TypeIcon className="h-3 w-3 mr-1" />
                          {typeConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {ticket.title}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.color} variant="outline">
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(ticket.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTicket(ticket)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedTicket.description}
                    </p>
                  </div>
                )}

                {/* Page URL */}
                {selectedTicket.page_url && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Page URL</h4>
                    <a
                      href={selectedTicket.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
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
                    <p className="text-sm text-green-700 whitespace-pre-wrap">
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
