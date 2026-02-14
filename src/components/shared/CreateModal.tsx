import { useState, useCallback, useRef } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useUIStore } from '@/stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Import form components
import { ClientForm } from '@/components/forms/ClientForm'
import { ProjectForm } from '@/components/forms/ProjectForm'
import { PhaseForm } from '@/components/forms/PhaseForm'
import { SetForm } from '@/components/forms/SetForm'
import { PitchForm } from '@/components/forms/PitchForm'
import { RequirementForm } from '@/components/forms/RequirementForm'
import { ContactForm } from '@/components/forms/ContactForm'
import { LeadForm } from '@/components/forms/LeadForm'

export function CreateModal() {
  const { createModalOpen, createModalType, createModalContext, closeCreateModal } =
    useUIStore()
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [createAnother, setCreateAnother] = useState(false)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSuccess = useCallback((entityName?: string) => {
    // Clear any existing timeout
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }

    const message = entityName ? `${entityName} created successfully!` : 'Created successfully!'
    setSuccessMessage(message)
    setShowSuccess(true)

    // If createAnother is checked, just show success briefly then reset
    if (createAnother) {
      successTimeoutRef.current = setTimeout(() => {
        setShowSuccess(false)
      }, 1500)
    } else {
      // Otherwise close modal after showing success
      successTimeoutRef.current = setTimeout(() => {
        setShowSuccess(false)
        closeCreateModal()
      }, 1200)
    }
  }, [createAnother, closeCreateModal])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Clean up on close
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
      setShowSuccess(false)
      setCreateAnother(false)
      closeCreateModal()
    }
  }

  return (
    <Dialog open={createModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-[95vw] md:max-w-2xl">
        {/* Success overlay */}
        <div
          className={cn(
            'absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 rounded-lg transition-opacity duration-300',
            showSuccess ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <CheckCircle2 className="h-16 w-16 text-green-500 mb-4 animate-in zoom-in-50 duration-300" />
          <p className="text-lg font-medium text-foreground">{successMessage}</p>
          {createAnother && (
            <p className="text-sm text-muted-foreground mt-2">Ready for next item...</p>
          )}
        </div>

        <DialogHeader>
          <DialogTitle>Create New</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={createModalType || 'requirement'} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 overflow-x-auto">
            <TabsTrigger value="lead">Lead</TabsTrigger>
            <TabsTrigger value="client">Client</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="phase">Phase</TabsTrigger>
            <TabsTrigger value="set">Set</TabsTrigger>
            <TabsTrigger value="pitch">Pitch</TabsTrigger>
            <TabsTrigger value="requirement">Task</TabsTrigger>
          </TabsList>

          <TabsContent value="lead" className="mt-4">
            <LeadForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Lead')}
            />
          </TabsContent>

          <TabsContent value="client" className="mt-4">
            <ClientForm onSuccess={() => handleSuccess('Client')} />
          </TabsContent>

          <TabsContent value="contact" className="mt-4">
            <ContactForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Contact')}
            />
          </TabsContent>

          <TabsContent value="project" className="mt-4">
            <ProjectForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Project')}
            />
          </TabsContent>

          <TabsContent value="phase" className="mt-4">
            <PhaseForm onSuccess={() => handleSuccess('Phase')} />
          </TabsContent>

          <TabsContent value="set" className="mt-4">
            <SetForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Set')}
            />
          </TabsContent>

          <TabsContent value="pitch" className="mt-4">
            <PitchForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Pitch')}
            />
          </TabsContent>

          <TabsContent value="requirement" className="mt-4">
            <RequirementForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Task')}
            />
          </TabsContent>
        </Tabs>

        {/* Create another checkbox */}
        <div className="flex items-center space-x-2 pt-4 border-t">
          <Checkbox
            id="create-another"
            checked={createAnother}
            onCheckedChange={(checked) => setCreateAnother(checked === true)}
          />
          <Label
            htmlFor="create-another"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Create another after saving
          </Label>
        </div>
      </DialogContent>
    </Dialog>
  )
}
