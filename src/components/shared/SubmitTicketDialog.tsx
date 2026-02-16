import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSupportTicketMutations } from '@/hooks'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, AlertCircle, Info, Lightbulb, Link as LinkIcon } from 'lucide-react'
import type { TicketType } from '@/services/api/supportTickets'

const ticketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['incident', 'information', 'improvement']),
})

type TicketFormValues = z.infer<typeof ticketSchema>

const TICKET_TYPES: { value: TicketType; label: string; icon: typeof AlertCircle; description: string }[] = [
  {
    value: 'incident',
    label: 'Incident',
    icon: AlertCircle,
    description: 'Report a bug or issue',
  },
  {
    value: 'information',
    label: 'Information',
    icon: Info,
    description: 'Ask a question or request info',
  },
  {
    value: 'improvement',
    label: 'Improvement',
    icon: Lightbulb,
    description: 'Suggest a feature or enhancement',
  },
]

interface SubmitTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SubmitTicketDialog({ open, onOpenChange }: SubmitTicketDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { createTicket } = useSupportTicketMutations()

  // Capture the current page URL when dialog opens
  const currentPageUrl = typeof window !== 'undefined' ? window.location.href : ''

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      title: '',
      description: '',
      type: 'information',
    },
  })

  const handleSubmit = async (data: TicketFormValues) => {
    setIsSubmitting(true)
    try {
      await createTicket.mutateAsync({
        title: data.title,
        description: data.description,
        type: data.type,
        page_url: currentPageUrl,
      })
      form.reset()
      onOpenChange(false)
    } catch {
      // Error is handled by the mutation's onError
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedType = TICKET_TYPES.find((t) => t.value === form.watch('type'))
  const TypeIcon = selectedType?.icon || Info

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5" />
            Submit Support Ticket
          </DialogTitle>
          <DialogDescription>
            Let us know how we can help. We'll get back to you as soon as possible.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Ticket Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select
              value={form.watch('type')}
              onValueChange={(value) => form.setValue('type', value as TicketType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select ticket type" />
              </SelectTrigger>
              <SelectContent>
                {TICKET_TYPES.map((type) => {
                  const Icon = type.icon
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{type.label}</span>
                        <span className="text-muted-foreground text-xs">
                          - {type.description}
                        </span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Brief summary of your request"
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide more details about your request..."
              rows={4}
              {...form.register('description')}
            />
          </div>

          {/* Page URL (auto-captured, read-only) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-muted-foreground">
              <LinkIcon className="h-3 w-3" />
              Page URL (auto-captured)
            </Label>
            <Input
              value={currentPageUrl}
              readOnly
              className="text-xs text-muted-foreground bg-muted"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Ticket'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
