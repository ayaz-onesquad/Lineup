import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useDocumentsByEntity, useDocumentMutations } from '@/hooks/useDocuments'
import { useQueryClient } from '@tanstack/react-query'
import { DocumentDialog } from './DocumentDialog'
import { DocumentsTable } from './DocumentsTable'
import { Plus } from 'lucide-react'
import type { EntityType, Document, DocumentWithUploader } from '@/types/database'

interface ParentContext {
  clientName?: string
  projectName?: string
  phaseName?: string
  setName?: string
  pitchName?: string
  requirementName?: string
  leadName?: string
}

export interface DocumentsTabProps {
  // Primary entity
  entityType: EntityType | string
  entityId: string

  // Full parent chain for new documents
  clientId?: string | null
  leadId?: string | null
  projectId?: string | null
  phaseId?: string | null
  setId?: string | null
  pitchId?: string | null
  requirementId?: string | null

  // Parent names for breadcrumb display in dialog
  parentContext?: ParentContext

  // Display options
  title?: string
}

export function DocumentsTab({
  entityType,
  entityId,
  clientId,
  leadId,
  projectId,
  phaseId,
  setId,
  pitchId,
  requirementId,
  parentContext,
  title = 'Documents',
}: DocumentsTabProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)

  const { data: documents, isLoading } = useDocumentsByEntity(entityType, entityId)
  const { deleteDocument } = useDocumentMutations()

  const handleEdit = (doc: Document | DocumentWithUploader) => {
    setEditingDocument(doc as Document)
    setDialogOpen(true)
  }

  const handleDelete = (docId: string) => {
    deleteDocument.mutate(docId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] })
      },
    })
  }

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditingDocument(null)
    }
  }

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] })
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      {/* Document list */}
      <DocumentsTable
        documents={documents ?? []}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={(doc) => handleDelete(doc.id)}
      />

      {/* Document Dialog */}
      <DocumentDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        entityType={entityType}
        entityId={entityId}
        clientId={clientId}
        leadId={leadId}
        projectId={projectId}
        phaseId={phaseId}
        setId={setId}
        pitchId={pitchId}
        requirementId={requirementId}
        parentContext={parentContext}
        document={editingDocument}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
