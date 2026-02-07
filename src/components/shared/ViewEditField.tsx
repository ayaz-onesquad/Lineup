import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface BaseFieldProps {
  label: string
  required?: boolean
  isEditing: boolean
  className?: string
  error?: string
}

interface TextFieldProps extends BaseFieldProps {
  type: 'text' | 'email' | 'tel' | 'date'
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

interface TextareaFieldProps extends BaseFieldProps {
  type: 'textarea'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

interface SelectFieldProps extends BaseFieldProps {
  type: 'select'
  value: string
  onChange: (value: string) => void
  options: readonly { readonly value: string; readonly label: string }[] | Array<{ value: string; label: string }>
  placeholder?: string
}

interface SwitchFieldProps extends BaseFieldProps {
  type: 'switch'
  value: boolean
  onChange: (value: boolean) => void
  description?: string
}

interface BadgeFieldProps extends BaseFieldProps {
  type: 'badge'
  value: string
  onChange: (value: string) => void
  options: readonly { readonly value: string; readonly label: string; readonly variant?: 'default' | 'secondary' | 'outline' }[] | Array<{ value: string; label: string; variant?: 'default' | 'secondary' | 'outline' }>
}

interface CustomFieldProps extends BaseFieldProps {
  type: 'custom'
  viewContent: ReactNode
  editContent: ReactNode
}

type ViewEditFieldProps =
  | TextFieldProps
  | TextareaFieldProps
  | SelectFieldProps
  | SwitchFieldProps
  | BadgeFieldProps
  | CustomFieldProps

/**
 * ViewEditField - Mendix-style field that transitions between view and edit modes
 * without layout shift. In view mode, shows text. In edit mode, shows input.
 */
export function ViewEditField(props: ViewEditFieldProps) {
  const { label, required, isEditing, className, error } = props

  // Only show required asterisk (*) in Edit Mode, not View Mode (Mendix pattern)
  const renderLabel = () => (
    <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
      {label}
      {required && isEditing && <span className="text-destructive">*</span>}
    </div>
  )

  const renderError = () =>
    error && <p className="text-xs text-destructive mt-1">{error}</p>

  // Handle different field types
  switch (props.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'date': {
      const { value, onChange, placeholder, type } = props
      return (
        <div className={cn('min-h-[52px]', className)}>
          {renderLabel()}
          {isEditing ? (
            <Input
              type={type}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className={cn('h-9', error && 'border-destructive')}
            />
          ) : (
            <p className="h-9 flex items-center">{value || '—'}</p>
          )}
          {renderError()}
        </div>
      )
    }

    case 'textarea': {
      const { value, onChange, placeholder, rows = 3 } = props
      return (
        <div className={cn('min-h-[84px]', className)}>
          {renderLabel()}
          {isEditing ? (
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={rows}
              className={cn(error && 'border-destructive')}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{value || '—'}</p>
          )}
          {renderError()}
        </div>
      )
    }

    case 'select': {
      const { value, onChange, options, placeholder } = props
      const selectedOption = options.find((o) => o.value === value)
      return (
        <div className={cn('min-h-[52px]', className)}>
          {renderLabel()}
          {isEditing ? (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger className={cn('h-9', error && 'border-destructive')}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="h-9 flex items-center">{selectedOption?.label || '—'}</p>
          )}
          {renderError()}
        </div>
      )
    }

    case 'switch': {
      const { value, onChange, description } = props
      return (
        <div className={cn('min-h-[52px] flex items-center gap-3', className)}>
          {isEditing ? (
            <>
              <Switch checked={value} onCheckedChange={onChange} />
              <div>
                <div className="text-sm font-medium flex items-center gap-1">
                  {label}
                  {required && isEditing && <span className="text-destructive">*</span>}
                </div>
                {description && (
                  <p className="text-xs text-muted-foreground">{description}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                {renderLabel()}
                <p className="text-sm">{value ? 'Enabled' : 'Disabled'}</p>
              </div>
            </>
          )}
        </div>
      )
    }

    case 'badge': {
      const { value, onChange, options } = props
      const selectedOption = options.find((o) => o.value === value)
      return (
        <div className={cn('min-h-[52px]', className)}>
          {renderLabel()}
          {isEditing ? (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger className={cn('h-9', error && 'border-destructive')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="h-9 flex items-center">
              {selectedOption ? (
                <Badge variant={selectedOption.variant || 'default'}>
                  {selectedOption.label}
                </Badge>
              ) : (
                '—'
              )}
            </div>
          )}
          {renderError()}
        </div>
      )
    }

    case 'custom': {
      const { viewContent, editContent } = props
      return (
        <div className={cn('min-h-[52px]', className)}>
          {renderLabel()}
          {isEditing ? editContent : viewContent}
          {renderError()}
        </div>
      )
    }
  }
}

