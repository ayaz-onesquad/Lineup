import { useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useUIStore } from '@/stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { SearchableSelect } from '@/components/ui/searchable-select'

// Import form components
import { ClientForm } from '@/components/forms/ClientForm'
import { ProjectForm } from '@/components/forms/ProjectForm'
import { PhaseForm } from '@/components/forms/PhaseForm'
import { SetForm } from '@/components/forms/SetForm'
import { PitchForm } from '@/components/forms/PitchForm'
import { RequirementForm } from '@/components/forms/RequirementForm'
import { ContactForm } from '@/components/forms/ContactForm'
import { LeadForm } from '@/components/forms/LeadForm'
import { PasswordForm } from '@/components/forms/PasswordForm'
import { FinancialEntryForm } from '@/components/forms/FinancialEntryForm'
import { CompetitorForm } from '@/components/forms/CompetitorForm'

// Entity type options for the dropdown selector
const ENTITY_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'client', label: 'Client' },
  { value: 'contact', label: 'Contact' },
  { value: 'project', label: 'Project' },
  { value: 'phase', label: 'Phase' },
  { value: 'set', label: 'Set' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'requirement', label: 'Task' },
  { value: 'password', label: 'Password' },
  { value: 'financial_entry', label: 'Financial Entry' },
  { value: 'competitor', label: 'Competitor' },
]

export function CreateModal() {
  const { createModalOpen, createModalType, createModalContext, closeCreateModal } =
    useUIStore()
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [createAnother, setCreateAnother] = useState(false)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedType, setSelectedType] = useState<string>(createModalType || '')

  // Sync selectedType when modal opens with a pre-selected type
  useEffect(() => {
    if (createModalOpen) {
      setSelectedType(createModalType || '')
    }
  }, [createModalOpen, createModalType])

  // Get the label for the selected type
  const selectedLabel = ENTITY_OPTIONS.find(opt => opt.value === selectedType)?.label

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
          <DialogTitle>
            {selectedLabel ? `Create ${selectedLabel}` : 'Create New'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entity type selector */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Create a new...
            </p>
            <SearchableSelect
              options={ENTITY_OPTIONS}
              value={selectedType}
              onValueChange={(val) => setSelectedType(val || '')}
              placeholder="Select what to create..."
              searchPlaceholder="Search types..."
              emptyMessage="No matching type"
              clearable={false}
              className="max-h-[280px]"
            />
          </div>

          {/* Render the selected form */}
          {selectedType === 'lead' && (
            <LeadForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Lead')}
            />
          )}
          {selectedType === 'client' && (
            <ClientForm onSuccess={() => handleSuccess('Client')} />
          )}
          {selectedType === 'contact' && (
            <ContactForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Contact')}
            />
          )}
          {selectedType === 'project' && (
            <ProjectForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Project')}
            />
          )}
          {selectedType === 'phase' && (
            <PhaseForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Phase')}
            />
          )}
          {selectedType === 'set' && (
            <SetForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Set')}
            />
          )}
          {selectedType === 'pitch' && (
            <PitchForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Pitch')}
            />
          )}
          {selectedType === 'requirement' && (
            <RequirementForm
              defaultValues={createModalContext}
              onSuccess={() => handleSuccess('Task')}
            />
          )}
          {selectedType === 'password' && (
            <PasswordForm
              onSuccess={() => handleSuccess('Password')}
            />
          )}
          {selectedType === 'financial_entry' && (
            <FinancialEntryForm
              onSuccess={() => handleSuccess('Financial Entry')}
            />
          )}
          {selectedType === 'competitor' && (
            <CompetitorForm
              onSuccess={() => handleSuccess('Competitor')}
            />
          )}
          {!selectedType && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Select a type above to get started.
            </p>
          )}
        </div>

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
