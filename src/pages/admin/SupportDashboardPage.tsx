import { useState } from 'react'
import { useAllTickets, useTicketStats, useSupportTicketMutations } from '@/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  AlertCircle,
  Info,
  Lightbulb,
  ExternalLink,
  Calendar,
  CheckCircle,
  Clock,
  Ticket,
  TrendingUp,
  Building2,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { SupportTicketWithSubmitter, TicketType, TicketStatus } from '@/services/api/supportTickets'

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

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  description,
  isLoading,
}: {
  title: string
  value: number
  icon: typeof Ticket
  color: string
  description?: string
  isLoading?: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SupportDashboardPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketWithSubmitter | null>(null)
  const [resolution, setResolution] = useState('')
  const [isResolving, setIsResolving] = useState(false)

  const { data: tickets, isLoading: ticketsLoading } = useAllTickets()
  const { data: stats, isLoading: statsLoading } = useTicketStats()
  const { updateTicket, resolveTicket } = useSupportTicketMutations()

  const filteredTickets = tickets?.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.ticket_id_display.toLowerCase().includes(search.toLowerCase()) ||
      ticket.tenant_name?.toLowerCase().includes(search.toLowerCase()) ||
      ticket.submitter_name?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter
    const matchesType = typeFilter === 'all' || ticket.type === typeFilter

    return matchesSearch && matchesStatus && matchesType
  })

  const handleStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    await updateTicket.mutateAsync({
      id: ticketId,
      data: { status: newStatus },
    })
  }

  const handleResolve = async () => {
    if (!selectedTicket || !resolution.trim()) return
    setIsResolving(true)
    try {
      await resolveTicket.mutateAsync({
        id: selectedTicket.id,
        resolution: resolution.trim(),
      })
      setSelectedTicket(null)
      setResolution('')
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support Dashboard</h1>
        <p className="text-muted-foreground">
          Manage support tickets across all tenants
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Tickets"
          value={stats?.total || 0}
          icon={Ticket}
          color="text-gray-600"
          isLoading={statsLoading}
        />
        <StatCard
          title="Open"
          value={stats?.open || 0}
          icon={Clock}
          color="text-yellow-600"
          description="Awaiting action"
          isLoading={statsLoading}
        />
        <StatCard
          title="In Progress"
          value={stats?.inProgress || 0}
          icon={TrendingUp}
          color="text-blue-600"
          description="Being worked on"
          isLoading={statsLoading}
        />
        <StatCard
          title="Resolved"
          value={stats?.resolved || 0}
          icon={CheckCircle}
          color="text-green-600"
          description="Completed"
          isLoading={statsLoading}
        />
      </div>

      {/* Type Breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Incidents"
          value={stats?.byType.incident || 0}
          icon={AlertCircle}
          color="text-red-600"
          isLoading={statsLoading}
        />
        <StatCard
          title="Information"
          value={stats?.byType.information || 0}
          icon={Info}
          color="text-blue-600"
          isLoading={statsLoading}
        />
        <StatCard
          title="Improvements"
          value={stats?.byType.improvement || 0}
          icon={Lightbulb}
          color="text-amber-600"
          isLoading={statsLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tickets, tenants, users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="incident">Incident</SelectItem>
            <SelectItem value="information">Information</SelectItem>
            <SelectItem value="improvement">Improvement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tickets</CardTitle>
          <CardDescription>
            {filteredTickets?.length || 0} ticket(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ticketsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTickets?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No tickets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Submitted By</TableHead>
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
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {ticket.title}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {ticket.tenant_name || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {ticket.submitter_name || ticket.submitter_email || '-'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={ticket.status}
                            onValueChange={(value) =>
                              handleStatusChange(ticket.id, value as TicketStatus)
                            }
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <Badge className={statusConfig.color} variant="outline">
                                {statusConfig.label}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail/Resolve Dialog */}
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
                  <span className="flex items-center gap-2">
                    <Building2 className="h-3 w-3" />
                    {selectedTicket.tenant_name} • {selectedTicket.submitter_name || selectedTicket.submitter_email}
                    <span className="text-muted-foreground">•</span>
                    {formatDate(selectedTicket.created_at)}
                  </span>
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
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded">
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

                {/* Existing Resolution */}
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

                {/* Resolution Input (for open/in_progress tickets) */}
                {(selectedTicket.status === 'open' || selectedTicket.status === 'in_progress') && (
                  <div className="space-y-2 pt-4 border-t">
                    <Label htmlFor="resolution">Resolution</Label>
                    <Textarea
                      id="resolution"
                      placeholder="Enter resolution details..."
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                  Close
                </Button>
                {(selectedTicket.status === 'open' || selectedTicket.status === 'in_progress') && (
                  <Button
                    onClick={handleResolve}
                    disabled={!resolution.trim() || isResolving}
                  >
                    {isResolving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resolving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark as Resolved
                      </>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
