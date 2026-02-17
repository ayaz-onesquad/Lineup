import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discussionsApi } from '@/services/api/discussions'
import { useTenantStore, useAuthStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import {
  ArrowLeft,
  MessageSquare,
  Send,
  ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { getInitials } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

export function DiscussionDetailPage() {
  const { discussionId } = useParams<{ discussionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { user } = useAuthStore()

  const [replyContent, setReplyContent] = useState('')
  const [replyIsInternal, setReplyIsInternal] = useState(true)

  // Fetch discussion with replies
  const { data: discussion, isLoading } = useQuery({
    queryKey: ['discussion', discussionId],
    queryFn: () => discussionsApi.getById(discussionId!),
    enabled: !!discussionId,
  })

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: () => discussionsApi.reply(
      currentTenant!.id,
      user!.id,
      discussionId!,
      replyContent,
      replyIsInternal
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussion', discussionId] })
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      setReplyContent('')
      toast({ title: 'Reply posted' })
    },
    onError: (error) => {
      toast({
        title: 'Failed to post reply',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    },
  })

  const handleSubmitReply = () => {
    if (!replyContent.trim()) return
    replyMutation.mutate()
  }

  // Get topic link
  const getTopicLink = () => {
    if (!discussion?.topic_type || !discussion?.topic_id) return null

    const routes: Record<string, string> = {
      client: `/clients/${discussion.topic_id}`,
      project: `/projects/${discussion.topic_id}`,
      phase: `/phases/${discussion.topic_id}`,
      set: `/sets/${discussion.topic_id}`,
      pitch: `/pitches/${discussion.topic_id}`,
      requirement: `/requirements/${discussion.topic_id}`,
      lead: `/leads/${discussion.topic_id}`,
    }

    return routes[discussion.topic_type]
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  if (!discussion) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Discussion Not Found</h2>
            <p className="text-muted-foreground mb-4">
              This discussion may have been deleted.
            </p>
            <Button onClick={() => navigate('/discussions')}>
              View All Discussions
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const topicLink = getTopicLink()

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Discussions
        </Button>
        <Breadcrumbs items={[
          { label: 'Discussions', href: '/discussions' },
          { label: discussion.title || 'Discussion', displayId: discussion.discussion_id_display },
        ]} />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {discussion.title || 'Discussion'}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant={discussion.visibility === 'external' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {discussion.visibility === 'external' ? 'Client Visible' : 'Internal'}
            </Badge>
            {discussion.topic_type && (
              <>
                <span>in</span>
                {topicLink ? (
                  <Link to={topicLink} className="flex items-center gap-1 hover:underline text-primary">
                    <span className="capitalize">{discussion.topic_type}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="capitalize">{discussion.topic_type}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Original Post */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src={discussion.author?.avatar_url} />
              <AvatarFallback>
                {getInitials(discussion.author?.full_name || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium">{discussion.author?.full_name || 'Unknown'}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(discussion.created_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{discussion.content}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Replies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Replies ({discussion.replies?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing Replies */}
          {discussion.replies && discussion.replies.length > 0 ? (
            <div className="space-y-4 divide-y">
              {discussion.replies.map((reply) => (
                <div key={reply.id} className="flex gap-4 pt-4 first:pt-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={reply.author?.avatar_url} />
                    <AvatarFallback>
                      {getInitials(reply.author?.full_name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{reply.author?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                      </span>
                      {reply.is_internal && (
                        <Badge variant="outline" className="text-xs">Internal</Badge>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No replies yet. Be the first to respond!</p>
            </div>
          )}

          {/* Reply Form */}
          <div className="border-t pt-4 mt-4">
            <div className="space-y-3">
              <Textarea
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[100px]"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="reply-internal"
                    checked={replyIsInternal}
                    onCheckedChange={setReplyIsInternal}
                  />
                  <Label htmlFor="reply-internal" className="text-sm cursor-pointer">
                    Internal only
                  </Label>
                </div>
                <Button
                  onClick={handleSubmitReply}
                  disabled={!replyContent.trim() || replyMutation.isPending}
                  size="sm"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Post Reply
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
