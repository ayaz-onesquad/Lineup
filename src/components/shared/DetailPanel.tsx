import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Import detail components (will be created later)
import { ClientDetail } from '@/components/details/ClientDetail'
import { ProjectDetail } from '@/components/details/ProjectDetail'
import { PhaseDetail } from '@/components/details/PhaseDetail'
import { SetDetail } from '@/components/details/SetDetail'
import { RequirementDetail } from '@/components/details/RequirementDetail'

export function DetailPanel() {
  const { detailPanel, closeDetailPanel } = useUIStore()
  const { isOpen, entityType, entityId } = detailPanel

  if (!isOpen || !entityType || !entityId) return null

  const renderDetail = () => {
    switch (entityType) {
      case 'client':
        return <ClientDetail id={entityId} />
      case 'project':
        return <ProjectDetail id={entityId} />
      case 'phase':
        return <PhaseDetail id={entityId} />
      case 'set':
        return <SetDetail id={entityId} />
      case 'requirement':
        return <RequirementDetail id={entityId} />
      default:
        return null
    }
  }

  return (
    <aside
      className={cn(
        'fixed right-0 top-16 z-40 h-[calc(100vh-4rem)] w-96 border-l bg-background shadow-lg',
        'animate-slide-in-right'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold capitalize">{entityType} Details</h2>
          <Button variant="ghost" size="icon" onClick={closeDetailPanel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4">{renderDetail()}</div>
        </ScrollArea>
      </div>
    </aside>
  )
}
