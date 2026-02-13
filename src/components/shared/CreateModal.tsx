import { useUIStore } from '@/stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Import form components
import { ClientForm } from '@/components/forms/ClientForm'
import { ProjectForm } from '@/components/forms/ProjectForm'
import { PhaseForm } from '@/components/forms/PhaseForm'
import { SetForm } from '@/components/forms/SetForm'
import { RequirementForm } from '@/components/forms/RequirementForm'
import { ContactForm } from '@/components/forms/ContactForm'

export function CreateModal() {
  const { createModalOpen, createModalType, createModalContext, closeCreateModal } =
    useUIStore()

  const handleSuccess = () => {
    closeCreateModal()
  }

  return (
    <Dialog open={createModalOpen} onOpenChange={closeCreateModal}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={createModalType || 'requirement'} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="client">Client</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="phase">Phase</TabsTrigger>
            <TabsTrigger value="set">Set</TabsTrigger>
            <TabsTrigger value="requirement">Task</TabsTrigger>
          </TabsList>

          <TabsContent value="client" className="mt-4">
            <ClientForm onSuccess={handleSuccess} />
          </TabsContent>

          <TabsContent value="contact" className="mt-4">
            <ContactForm
              defaultValues={createModalContext}
              onSuccess={handleSuccess}
            />
          </TabsContent>

          <TabsContent value="project" className="mt-4">
            <ProjectForm
              defaultValues={createModalContext}
              onSuccess={handleSuccess}
            />
          </TabsContent>

          <TabsContent value="phase" className="mt-4">
            <PhaseForm onSuccess={handleSuccess} />
          </TabsContent>

          <TabsContent value="set" className="mt-4">
            <SetForm
              defaultValues={createModalContext}
              onSuccess={handleSuccess}
            />
          </TabsContent>

          <TabsContent value="requirement" className="mt-4">
            <RequirementForm
              defaultValues={createModalContext}
              onSuccess={handleSuccess}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
