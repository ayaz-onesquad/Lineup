import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { useProjectMutations } from '@/hooks'
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
import { Label } from '@/components/ui/label'

interface SaveAsTemplateDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SaveAsTemplateDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: SaveAsTemplateDialogProps) {
  const [templateName, setTemplateName] = useState(`${projectName} Template`)
  const { saveAsTemplate } = useProjectMutations()

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast({
        title: 'Error',
        description: 'Template name is required',
        variant: 'destructive',
      })
      return
    }

    try {
      await saveAsTemplate.mutateAsync({
        projectId,
        templateName: templateName.trim(),
        options: {
          include_children: true,
          clear_dates: true,
          clear_assignments: true,
        },
      })

      toast({
        title: 'Template created successfully!',
        description: 'View it in the Templates page',
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Failed to create template:', error)
      toast({
        title: 'Failed to create template',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Create a reusable template from "{projectName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="templateName">Template Name *</Label>
            <Input
              id="templateName"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter template name"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            The template will include all phases, sets, pitches, and requirements.
            Dates and team assignments will be cleared automatically.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveAsTemplate.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!templateName.trim() || saveAsTemplate.isPending}
          >
            {saveAsTemplate.isPending ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
