import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { useDiscussion, useDiscussionMutations } from '@/hooks/useDiscussions'
import { useTenantUsers } from '@/hooks/useTenant'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  MessageSquare,
  Send,
  Unlock,
  Loader2,
  CheckCircle2,
  UserPlus,
  UserMinus,
  X,
  ExternalLink,
} from 'lucide-react'
import { format } from 'date-fns'
import { getInitials, cn } from '@/lib/utils'
import type { DiscussionWithAuthor } from '@/types/database'

// Parent record info for navigation
interface ParentRecord {
  entityType: string
  entityId: string
  entityName: string
  entityPath: string
}

interface DiscussionViewProps {
  discussionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel?: string // e.g., "Project: Website Redesign"
  parentRecord?: ParentRecord // Optional parent record for navigation link
}

export function DiscussionView({
  discussionId,
  open,
  onOpenChange,
  entityLabel,
  parentRecord,
}: DiscussionViewProps) {
  const navigate = useNavigate()
  // Use selector to get stable reference, avoiding infinite re-renders
  const user = useAuthStore(s => s.user)
  const { data: discussion, isLoading, error } = useDiscussion(discussionId ?? undefined)
  const { data: tenantUsers } = useTenantUsers()
  const {
    createReply,
    concludeDiscussion,
    reopenDiscussion,
    addParticipant,
    removeParticipant,
  } = useDiscussionMutations()

  const [replyContent, setReplyContent] = useState('')
  const [showParticipantManager, setShowParticipantManager] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [discussion?.replies])

  const isClosed = discussion?.status === 'closed'
  const isAuthor = user?.id === discussion?.author_id
  const canClose = isAuthor // Only author can close for now

  // Build all messages (top-level + replies) in chronological order
  const allMessages = useMemo(() => {
    if (!discussion) return []
    const messages: DiscussionWithAuthor[] = [discussion]
    if (discussion.replies) {
      messages.push(...discussion.replies)
    }
    return messages.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [discussion])

  // Get participant profiles for display
  const participantProfiles = useMemo(() => {
    if (!discussion?.participants || !tenantUsers) return []
    return discussion.participants
      .map(id => {
        const tu = tenantUsers.find(t => t.user_id === id)
        return tu
          ? {
              user_id: id,
              full_name: tu.user_profiles?.full_name || 'Unknown',
              avatar_url: tu.user_profiles?.avatar_url,
            }
          : { user_id: id, full_name: 'Unknown', avatar_url: undefined }
      })
  }, [discussion?.participants, tenantUsers])

  // Build options for adding new participants
  const availableUserOptions = useMemo(() => {
    if (!tenantUsers || !discussion?.participants) return []
    const currentIds = new Set(discussion.participants)
    return tenantUsers
      .filter(tu => !currentIds.has(tu.user_id))
      .map(tu => ({
        value: tu.user_id,
        label: tu.user_profiles?.full_name || 'Unknown',
      }))
  }, [tenantUsers, discussion?.participants])

  const handleSendReply = async () => {
    if (!replyContent.trim() || !discussionId) return

    await createReply.mutateAsync({
      parentId: discussionId,
      content: replyContent,
      isInternal: discussion?.is_internal ?? true,
    })

    setReplyContent('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendReply()
    }
  }

  const handleClose = async () => {
    if (!discussionId) return
    await concludeDiscussion.mutateAsync({ id: discussionId })
  }

  const handleReopen = async () => {
    if (!discussionId) return
    await reopenDiscussion.mutateAsync({ id: discussionId })
  }

  const handleAddParticipant = async (userId: string) => {
    if (!discussionId || !userId) return
    await addParticipant.mutateAsync({ discussionId, userId })
  }

  const handleRemoveParticipant = async (userId: string) => {
    if (!discussionId || !userId) return
    // Cannot remove the author
    if (userId === discussion?.author_id) return
    await removeParticipant.mutateAsync({ discussionId, userId })
  }

  const getConcludedByName = () => {
    if (!discussion?.concluded_by || !tenantUsers) return 'Unknown'
    const tu = tenantUsers.find(t => t.user_id === discussion.concluded_by)
    return tu?.user_profiles?.full_name || 'Unknown'
  }

  const handleNavigateToParent = () => {
    if (!parentRecord) return
    navigate(`${parentRecord.entityPath}?tab=discussions`)
    onOpenChange(false)
  }

  // Don't render if not open
  if (!open) return null

  const panelContent = (
    <>
      {/* Subtle backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => onOpenChange(false)}
      />

      {/* Side panel */}
      <div
        className="fixed right-0 top-0 h-full w-[480px] sm:w-[540px] z-50 bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        style={{ maxWidth: '90vw' }}
      >
        {/* Close button */}
        <button
          className="absolute right-4 top-4 z-10 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b pr-12 flex flex-col space-y-2 text-left">
          {/* Row 1: Subject title only */}
          <h2 className="text-lg font-semibold text-foreground truncate">
            {discussion?.subject || discussion?.title || 'Discussion'}
          </h2>

          {/* Row 2: Parent record link */}
          {parentRecord && (
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground group w-fit"
              onClick={handleNavigateToParent}
            >
              <Badge variant="outline" className="capitalize text-xs">
                {parentRecord.entityType}
              </Badge>
              <span className="group-hover:underline truncate max-w-[220px]">
                {parentRecord.entityName}
              </span>
              <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
            </button>
          )}

          {/* Entity label fallback */}
          {!parentRecord && entityLabel && (
            <p className="text-sm text-muted-foreground">{entityLabel}</p>
          )}

          {/* Row 3: Status + Internal badges side by side - NOT next to × */}
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={isClosed ? 'secondary' : 'default'}
              className="text-xs"
            >
              {isClosed ? 'Resolved' : 'Open'}
            </Badge>
            {discussion?.is_internal && (
              <Badge variant="secondary" className="text-xs">
                Internal
              </Badge>
            )}
          </div>

          {/* Row 4: Participants */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex -space-x-1">
              {participantProfiles.slice(0, 5).map(profile => (
                <Avatar key={profile.user_id} className="h-6 w-6 border-2 border-background">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {participantProfiles.length > 5 && (
                <span className="text-xs text-muted-foreground ml-2">
                  +{participantProfiles.length - 5} more
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowParticipantManager(true)}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Manage
            </Button>
          </div>
        </div>

        {/* Messages + Reply Area with relative positioning for overlay */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Messages Area */}
          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            <div className="py-4 space-y-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">Loading discussion...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8 text-destructive">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Error loading discussion</p>
                  <p className="text-xs mt-1 text-muted-foreground">{String(error)}</p>
                </div>
              ) : !discussion ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Discussion not found</p>
                </div>
              ) : allMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                <MessageList messages={allMessages} currentUserId={user?.id} />
              )}
            </div>
          </ScrollArea>

          {/* Closed Banner */}
          {isClosed && discussion && (
            <div className="px-4 py-3 bg-muted/50 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Closed by {getConcludedByName()}{' '}
                  {discussion.concluded_at &&
                    format(new Date(discussion.concluded_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>
            </div>
          )}

          {/* Reply Input / Close Button */}
          <div className="border-t p-4 space-y-3">
          {!isClosed ? (
            <>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type a message..."
                  value={replyContent}
                  onChange={e => setReplyContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-[60px] max-h-[120px] resize-none text-sm"
                  disabled={createReply.isPending}
                />
                <Button
                  size="icon"
                  onClick={handleSendReply}
                  disabled={!replyContent.trim() || createReply.isPending}
                  className="flex-shrink-0 h-9"
                >
                  {createReply.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {canClose && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Resolved
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Close Discussion</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark the discussion as concluded. No new replies
                        can be added until it's reopened.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClose}>
                        {concludeDiscussion.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Close Discussion
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          ) : (
            canClose && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleReopen}
                disabled={reopenDiscussion.isPending}
              >
                {reopenDiscussion.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Unlock className="h-4 w-4 mr-2" />
                )}
                Reopen Discussion
              </Button>
            )
          )}
          </div>

          {/* Frosted glass overlay for Manage People */}
          {showParticipantManager && (
            <div
              className="absolute inset-0 z-10 flex flex-col"
              style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
                <h3 className="text-sm font-semibold">Participants</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowParticipantManager(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {/* Current participants list */}
                {participantProfiles.map(profile => {
                  const isCreator = profile.user_id === discussion?.author_id
                  return (
                    <div
                      key={profile.user_id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/60 hover:bg-white/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{profile.full_name}</p>
                          {isCreator && (
                            <p className="text-xs text-muted-foreground">Creator</p>
                          )}
                        </div>
                      </div>
                      {!isCreator && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveParticipant(profile.user_id)}
                          disabled={removeParticipant.isPending}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add participant search */}
              <div className="px-4 py-3 border-t border-black/10">
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Add People</p>
                <SearchableSelect
                  options={availableUserOptions}
                  value=""
                  onValueChange={(userId) => {
                    if (userId) handleAddParticipant(userId)
                  }}
                  placeholder="Search people to add..."
                  searchPlaceholder="Search users..."
                  emptyMessage="No users available"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  return createPortal(panelContent, document.body)
}

// Message List Component
interface MessageListProps {
  messages: DiscussionWithAuthor[]
  currentUserId: string | undefined
}

function MessageList({ messages, currentUserId }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map(msg => {
        const isCurrentUser = msg.author_id === currentUserId
        return (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2 max-w-[85%]',
              isCurrentUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
            )}
          >
            {/* Avatar - only show for other users */}
            {!isCurrentUser && (
              <Avatar className="h-7 w-7 flex-shrink-0 mt-1">
                <AvatarImage src={msg.author?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {getInitials(msg.author?.full_name || '')}
                </AvatarFallback>
              </Avatar>
            )}

            <div className={cn('flex flex-col gap-1', isCurrentUser ? 'items-end' : 'items-start')}>
              {/* Author name - only show for others */}
              {!isCurrentUser && (
                <span className="text-xs text-muted-foreground font-medium">
                  {msg.author?.full_name || 'Unknown'}
                </span>
              )}

              {/* Message bubble */}
              <div
                className={cn(
                  'px-3 py-2 rounded-2xl text-sm max-w-full break-words whitespace-pre-wrap',
                  isCurrentUser
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm'
                )}
              >
                {msg.content}
              </div>

              {/* Full date and time - REQUIRED: show complete date + time, not relative */}
              <span className="text-xs text-muted-foreground">
                {format(new Date(msg.created_at), "EEE MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
