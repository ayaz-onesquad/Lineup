import { formatDateTime } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import type { UserProfile } from '@/types/database'
import { getInitials } from '@/lib/utils'

interface AuditTrailProps {
  created_at: string
  created_by?: string
  updated_at: string
  updated_by?: string
  creator?: UserProfile | null
  updater?: UserProfile | null
  className?: string
}

export function AuditTrail({
  created_at,
  updated_at,
  creator,
  updater,
  className = '',
}: AuditTrailProps) {
  const showUpdated = updated_at && updated_at !== created_at

  return (
    <div className={`border-t pt-4 mt-6 ${className}`}>
      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
        {/* Created */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Created:</span>
          <span>{formatDateTime(created_at)}</span>
          {creator && (
            <div className="flex items-center gap-1.5 ml-1">
              <span>by</span>
              <Avatar className="h-5 w-5">
                <AvatarImage src={creator.avatar_url} alt={creator.full_name} />
                <AvatarFallback className="text-[10px]">
                  {getInitials(creator.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-foreground">{creator.full_name}</span>
            </div>
          )}
        </div>

        {/* Updated */}
        {showUpdated && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Last Updated:</span>
              <span>{formatDateTime(updated_at)}</span>
              {updater && (
                <div className="flex items-center gap-1.5 ml-1">
                  <span>by</span>
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={updater.avatar_url} alt={updater.full_name} />
                    <AvatarFallback className="text-[10px]">
                      {getInitials(updater.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-foreground">{updater.full_name}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Compact version for list items
interface AuditTrailCompactProps {
  created_at: string
  updated_at: string
  creator?: UserProfile | null
}

export function AuditTrailCompact({ created_at, updated_at, creator }: AuditTrailCompactProps) {
  const isUpdated = updated_at && updated_at !== created_at

  return (
    <div className="text-xs text-muted-foreground">
      {isUpdated ? (
        <span>Updated {formatDateTime(updated_at)}</span>
      ) : (
        <span>
          Created {formatDateTime(created_at)}
          {creator && ` by ${creator.full_name}`}
        </span>
      )}
    </div>
  )
}
