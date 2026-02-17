import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { discussionsApi } from '@/services/api/discussions'
import { useTenantStore } from '@/stores'
import { useClients } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  MessageSquare,
  Plus,
  Search,
  MessageCircle,
  Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getInitials } from '@/lib/utils'

export function DiscussionsPage() {
  const navigate = useNavigate()
  const { currentTenant } = useTenantStore()
  const { data: clients } = useClients()

  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<string>('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newIsInternal, setNewIsInternal] = useState(true)

  // Fetch all discussions
  const { data: discussions, isLoading } = useQuery({
    queryKey: ['discussions', 'all', currentTenant?.id, clientFilter],
    queryFn: () => discussionsApi.getAll(currentTenant!.id, {
      clientId: clientFilter || undefined,
    }),
    enabled: !!currentTenant?.id,
  })

  // Client options for filter
  const clientOptions = useMemo(() =>
    [
      { value: '', label: 'All Clients' },
      ...(clients?.map(c => ({ value: c.id, label: c.name })) || [])
    ],
    [clients]
  )

  // Filter discussions by search
  const filteredDiscussions = useMemo(() => {
    if (!discussions) return []
    if (!search) return discussions

    const searchLower = search.toLowerCase()
    return discussions.filter(d =>
      d.title?.toLowerCase().includes(searchLower) ||
      d.content.toLowerCase().includes(searchLower) ||
      d.author?.full_name?.toLowerCase().includes(searchLower)
    )
  }, [discussions, search])

  const handleCreateDiscussion = async () => {
    if (!currentTenant || !newTitle.trim() || !newContent.trim()) return

    // TODO: Implement create discussion with new fields
    setShowCreateDialog(false)
    setNewTitle('')
    setNewContent('')
    setNewIsInternal(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Discussions</h1>
          <p className="text-sm text-muted-foreground">
            View and participate in all conversations
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Discussion
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search discussions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-[200px]">
          <SearchableSelect
            options={clientOptions}
            value={clientFilter}
            onValueChange={(v) => setClientFilter(v || '')}
            placeholder="Filter by client..."
            searchPlaceholder="Search clients..."
            emptyMessage="No clients found."
            clearable
          />
        </div>
      </div>

      {/* Discussions List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !filteredDiscussions?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No discussions found</p>
            <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Start a discussion
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Discussion</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDiscussions.map((discussion) => (
                  <TableRow
                    key={discussion.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/discussions/${discussion.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={discussion.author?.avatar_url} />
                          <AvatarFallback>
                            {getInitials(discussion.author?.full_name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {discussion.title || discussion.content.slice(0, 50)}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {discussion.author?.full_name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {discussion.topic_type && (
                        <Badge variant="outline" className="capitalize">
                          {discussion.topic_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={discussion.visibility === 'external' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {discussion.visibility === 'external' ? 'Client Visible' : 'Internal'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MessageCircle className="h-4 w-4" />
                        <span>{discussion.reply_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground text-sm">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDistanceToNow(new Date(discussion.updated_at || discussion.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Discussion Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Start New Discussion</DialogTitle>
            <DialogDescription>
              Create a new discussion thread.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Discussion title..."
              />
            </div>
            <div className="space-y-2">
              <Label>Message *</Label>
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Start the conversation..."
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Internal Only</Label>
                <p className="text-xs text-muted-foreground">
                  Not visible to clients
                </p>
              </div>
              <Switch
                checked={newIsInternal}
                onCheckedChange={setNewIsInternal}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDiscussion}
              disabled={!newTitle.trim() || !newContent.trim()}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Start Discussion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
