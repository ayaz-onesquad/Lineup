import { Building2, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type TaskParentType = 'client' | 'lead'

const OPTIONS: { value: TaskParentType; label: string; icon: typeof Building2 }[] = [
  { value: 'client', label: 'Client', icon: Building2 },
  { value: 'lead', label: 'Lead', icon: Target },
]

/**
 * "Belongs to: Client | Lead" for a task (requirement). A two-way choice, so a
 * segmented control rather than a dropdown. Client tasks use the full
 * Client > Project > Phase > Set > Pitch chain; lead tasks only need the lead.
 */
export function ParentTypeToggle({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TaskParentType
  onChange: (value: TaskParentType) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Belongs to"
      className={cn('inline-flex gap-2', className)}
    >
      {OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <Button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          variant={value === option ? 'default' : 'outline'}
          size="sm"
          className="coarse:min-h-touch"
          disabled={disabled}
          onClick={() => onChange(option)}
        >
          <Icon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  )
}
