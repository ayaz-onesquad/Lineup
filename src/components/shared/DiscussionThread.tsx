import { useState } from 'react'
import { useDiscussionMutations } from '@/hooks'
import { useAuth } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Reply, Pencil, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { DiscussionWithAuthor } from '@/types/database'

interface DiscussionThreadProps {
  discussion: DiscussionWithAuthor
  className?: string
}

export function DiscussionThread({ discussion, className }: DiscussionThreadProps) {
  const { user } = useAuth()
  const { createReply, updateDiscussion, deleteDiscussion } = useDiscussionMutations()

  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState(discussion.content)

  const isAuthor = user?.id === discussion.author_id
  const hasReplies = discussion.replies && discussion.replies.length > 0

  const handleReply = () => {
    if (!replyContent.trim()) return

    createReply.mutate(
      {
        parentId: discussion.id,
        content: replyContent,
        isInternal: discussion.is_internal,
      },
      {
        onSuccess: () => {
          setReplyContent('')
          setShowReplyForm(false)
        },
      }
    )
  }

  const handleUpdate = () => {
    if (!editContent.trim()) return

    updateDiscussion.mutate(
      {
        id: discussion.id,
        content: editContent,
      },
      {
        onSuccess: () => {
          setEditMode(false)
        },
      }
    )
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this comment?')) {
      deleteDiscussion.mutate(discussion.id)
    }
  }

  return (
    <div className={cn('border rounded-lg p-4 space-y-3', className)}>
      {/* Main comment */}
      <div className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={discussion.author?.avatar_url || undefined} />
          <AvatarFallback>
            {discussion.author?.full_name?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {discussion.author?.full_name || 'Unknown User'}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(discussion.created_at), {
                  addSuffix: true,
                })}
              </span>
              {discussion.is_internal && (
                <Badge variant="outline" className="text-xs">
                  Internal
                </Badge>
              )}
            </div>
            {isAuthor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditMode(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {editMode ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpdate} disabled={updateDiscussion.isPending}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditMode(false)
                    setEditContent(discussion.content)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{discussion.content}</p>
          )}

          {!editMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="h-8 px-2 text-xs"
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
          )}
        </div>
      </div>

      {/* Reply form */}
      {showReplyForm && (
        <div className="ml-11 space-y-2">
          <Textarea
            placeholder="Write a reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleReply} disabled={createReply.isPending}>
              Post Reply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowReplyForm(false)
                setReplyContent('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Replies */}
      {hasReplies && (
        <div className="ml-11 space-y-3 border-l-2 border-muted pl-4">
          {discussion.replies!.map((reply) => (
            <DiscussionReply key={reply.id} reply={reply} />
          ))}
        </div>
      )}
    </div>
  )
}

interface DiscussionReplyProps {
  reply: DiscussionWithAuthor
}

function DiscussionReply({ reply }: DiscussionReplyProps) {
  const { user } = useAuth()
  const { updateDiscussion, deleteDiscussion } = useDiscussionMutations()

  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState(reply.content)

  const isAuthor = user?.id === reply.author_id

  const handleUpdate = () => {
    if (!editContent.trim()) return

    updateDiscussion.mutate(
      {
        id: reply.id,
        content: editContent,
      },
      {
        onSuccess: () => {
          setEditMode(false)
        },
      }
    )
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this reply?')) {
      deleteDiscussion.mutate(reply.id)
    }
  }

  return (
    <div className="flex gap-3">
      <Avatar className="h-6 w-6">
        <AvatarImage src={reply.author?.avatar_url || undefined} />
        <AvatarFallback className="text-xs">
          {reply.author?.full_name?.[0] || 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs">
              {reply.author?.full_name || 'Unknown User'}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(reply.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>
          {isAuthor && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditMode(true)}>
                  <Pencil className="h-3 w-3 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {editMode ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate} disabled={updateDiscussion.isPending}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditMode(false)
                  setEditContent(reply.content)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs whitespace-pre-wrap">{reply.content}</p>
        )}
      </div>
    </div>
  )
}
