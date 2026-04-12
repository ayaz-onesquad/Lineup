import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSets, useSetMutations } from '@/hooks/useSets'
import { useTenantUsers } from '@/hooks/useTenant'
import { useUIStore, useTenantStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Plus, Search, Layers, Grid, LayoutGrid, ExternalLink, Pencil, X, Loader2, Upload } from 'lucide-react'
import { BulkUploadModal } from '@/components/shared/BulkUpload'
import { getPriorityColor, calculateEisenhowerPriority } from '@/lib/utils'
import { computeDisplayStatus, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { toast } from '@/hooks/use-toast'
import type { SetWithRelations, UpdateSetInput } from '@/types/database'
import { cn } from '@/lib/utils'

// Urgency and Importance options for grid edit
const URGENCY_OPTIONS: SearchableSelectOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const IMPORTANCE_OPTIONS: SearchableSelectOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export function SetsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('list')
  const [isGridEditMode, setIsGridEditMode] = useState(false)
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<SetWithRelations>>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const { data: sets, isLoading } = useSets()
  const { updateSet } = useSetMutations()
  const { currentTenant } = useTenantStore()
  const { data: tenantUsers } = useTenantUsers(currentTenant?.id)
  const { openCreateModal, openDetailPanel } = useUIStore()

  // Build user options for lead dropdown
  const userOptions: SearchableSelectOption[] = useMemo(() => {
    if (!tenantUsers) return []
    return tenantUsers.map((user) => ({
      value: user.user_profiles?.id || user.id,
      label: user.user_profiles?.full_name || 'Unknown User',
    }))
  }, [tenantUsers])

  const filteredSets = sets?.filter(
    (set) =>
      set.name.toLowerCase().includes(search.toLowerCase()) ||
      set.projects?.name.toLowerCase().includes(search.toLowerCase())
  )

  const dirtyCount = dirtyRows.size

  // Handle cell value changes
  const handleCellChange = useCallback((rowId: string, key: string, value: unknown) => {
    setDirtyRows((prev) => {
      const next = new Map(prev)
      const existing = next.get(rowId) || {}
      next.set(rowId, { ...existing, [key]: value } as Partial<SetWithRelations>)
      return next
    })
  }, [])

  // Get the current value for a cell (edited value or original)
  const getCellValue = useCallback(
    (row: SetWithRelations, key: string): unknown => {
      const edited = dirtyRows.get(row.id)
      if (edited && key in edited) {
        return edited[key as keyof Partial<SetWithRelations>]
      }
      return row[key as keyof SetWithRelations]
    },
    [dirtyRows]
  )

  // Check if row has unsaved changes
  const isDirty = useCallback(
    (rowId: string) => dirtyRows.has(rowId),
    [dirtyRows]
  )

  // Discard all changes
  const handleDiscard = useCallback(() => {
    setDirtyRows(new Map())
  }, [])

  // Save all changes
  const handleSaveAll = useCallback(async () => {
    if (dirtyRows.size === 0) return
    setIsSaving(true)

    try {
      const promises = Array.from(dirtyRows.entries()).map(([id, changes]) => {
        // Map the changes to UpdateSetInput format
        const updateData: UpdateSetInput = {}

        if ('name' in changes) updateData.name = changes.name as string
        if ('description' in changes) updateData.description = changes.description as string
        if ('urgency' in changes) updateData.urgency = changes.urgency as 'low' | 'medium' | 'high'
        if ('importance' in changes) updateData.importance = changes.importance as 'low' | 'medium' | 'high'
        if ('lead_id' in changes) updateData.lead_id = changes.lead_id as string | null

        return updateSet.mutateAsync({ id, ...updateData })
      })

      await Promise.all(promises)
      setDirtyRows(new Map())
      toast({
        title: 'Changes saved',
        description: `${promises.length} ${promises.length === 1 ? 'set' : 'sets'} updated successfully.`,
      })
    } catch (error) {
      console.error('Failed to save changes:', error)
      toast({
        title: 'Failed to save changes',
        description: 'Some updates may have failed. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }, [dirtyRows, updateSet])

  // Toggle grid edit mode with confirmation if dirty
  const handleToggleGridEdit = useCallback(() => {
    if (isGridEditMode && dirtyRows.size > 0) {
      setShowExitConfirm(true)
    } else {
      setIsGridEditMode(!isGridEditMode)
    }
  }, [isGridEditMode, dirtyRows.size])

  // Confirm exit without saving
  const confirmExit = useCallback(() => {
    setDirtyRows(new Map())
    setIsGridEditMode(false)
    setShowExitConfirm(false)
  }, [])

  const getMatrixSets = (urgency: string, importance: string) => {
    return filteredSets?.filter(
      (set) =>
        set.urgency === urgency &&
        set.importance === importance &&
        set.status !== 'completed' &&
        set.status !== 'cancelled'
    )
  }

  const renderSetCard = (set: SetWithRelations) => (
    <div
      key={set.id}
      className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => openDetailPanel('set', set.id)}
      onDoubleClick={() => navigate(`/sets/${set.id}`)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm truncate">{set.name}</span>
        <Badge className={getStatusColor(computeDisplayStatus(set))} variant="outline">
          {getStatusLabel(computeDisplayStatus(set))}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground truncate mb-2">
        {set.projects?.name}
      </p>
      <div className="flex items-center gap-2">
        <Progress value={set.completion_percentage} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground">{set.completion_percentage}%</span>
      </div>
    </div>
  )

  // Render editable or read-only cell
  const renderEditableCell = (
    set: SetWithRelations,
    key: string,
    type: 'text' | 'select',
    options?: SearchableSelectOption[],
    fallbackRender?: () => React.ReactNode
  ) => {
    const value = getCellValue(set, key)

    if (!isGridEditMode) {
      return fallbackRender ? fallbackRender() : (value as React.ReactNode) || '—'
    }

    if (type === 'select' && options) {
      return (
        <SearchableSelect
          options={options}
          value={value as string}
          onValueChange={(newValue) => handleCellChange(set.id, key, newValue)}
          placeholder="Select..."
          clearable
          triggerClassName="h-8 text-sm"
        />
      )
    }

    return (
      <Input
        type="text"
        value={(value as string) || ''}
        onChange={(e) => handleCellChange(set.id, key, e.target.value)}
        className="h-8 text-sm"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  // Render read-only cell with styling for grid edit mode
  const renderReadOnlyCell = (content: React.ReactNode) => {
    if (!isGridEditMode) return content
    return (
      <span className="bg-muted/50 px-2 py-1.5 rounded cursor-not-allowed text-muted-foreground block text-sm">
        {content}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Sets</h1>
          <p className="text-muted-foreground">Organize work with the Eisenhower Matrix</p>
        </div>
        <Button onClick={() => openCreateModal('set')}>
          <Plus className="mr-2 h-4 w-4" />
          New Set
        </Button>
      </div>

      {/* Search, View Toggle, and Grid Edit Toggle */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === 'matrix' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-r-none"
            onClick={() => setViewMode('matrix')}
            disabled={isGridEditMode}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-l-none"
            onClick={() => setViewMode('list')}
            disabled={isGridEditMode}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
        {viewMode === 'list' && (
          <>
            <Button
              variant="outline"
              onClick={() => setShowBulkUpload(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button
              variant={isGridEditMode ? 'default' : 'outline'}
              onClick={handleToggleGridEdit}
              className="gap-2"
            >
              {isGridEditMode ? (
                <>
                  <X className="h-4 w-4" />
                  Exit Grid Edit
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Grid Edit
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : viewMode === 'matrix' ? (
        /* Eisenhower Matrix View */
        <div className="grid grid-cols-2 gap-4">
          {/* Do First - High Urgency, High Importance */}
          <Card className="border-2 border-red-300 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                Do First (Critical)
              </CardTitle>
              <p className="text-xs text-red-600">High Urgency, High Importance</p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
              {getMatrixSets('high', 'high')?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No critical sets</p>
              ) : (
                getMatrixSets('high', 'high')?.map(renderSetCard)
              )}
            </CardContent>
          </Card>

          {/* Schedule - Low Urgency, High Importance */}
          <Card className="border-2 border-blue-300 bg-blue-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                Schedule (Plan)
              </CardTitle>
              <p className="text-xs text-blue-600">Low Urgency, High Importance</p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
              {getMatrixSets('low', 'high')?.length === 0 &&
              getMatrixSets('medium', 'high')?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sets to schedule</p>
              ) : (
                <>
                  {getMatrixSets('low', 'high')?.map(renderSetCard)}
                  {getMatrixSets('medium', 'high')?.map(renderSetCard)}
                </>
              )}
            </CardContent>
          </Card>

          {/* Delegate - High Urgency, Low Importance */}
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-800 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                Delegate (Quick)
              </CardTitle>
              <p className="text-xs text-amber-600">High Urgency, Low Importance</p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
              {getMatrixSets('high', 'low')?.length === 0 &&
              getMatrixSets('high', 'medium')?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sets to delegate</p>
              ) : (
                <>
                  {getMatrixSets('high', 'low')?.map(renderSetCard)}
                  {getMatrixSets('high', 'medium')?.map(renderSetCard)}
                </>
              )}
            </CardContent>
          </Card>

          {/* Eliminate - Low Urgency, Low Importance */}
          <Card className="border-2 border-gray-300 bg-gray-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-800 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500" />
                Consider (Drop)
              </CardTitle>
              <p className="text-xs text-gray-600">Low Urgency, Low Importance</p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
              {getMatrixSets('low', 'low')?.length === 0 &&
              getMatrixSets('medium', 'low')?.length === 0 &&
              getMatrixSets('low', 'medium')?.length === 0 &&
              getMatrixSets('medium', 'medium')?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No low priority sets</p>
              ) : (
                <>
                  {getMatrixSets('medium', 'medium')?.map(renderSetCard)}
                  {getMatrixSets('low', 'medium')?.map(renderSetCard)}
                  {getMatrixSets('medium', 'low')?.map(renderSetCard)}
                  {getMatrixSets('low', 'low')?.map(renderSetCard)}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* List View - Table Format */
        <Card className="card-carbon">
          <CardContent className="p-0">
            {filteredSets?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sets found</p>
                <Button className="mt-4" onClick={() => openCreateModal('set')}>
                  Create your first set
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Set Name</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Importance</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSets?.map((set) => (
                    <TableRow
                      key={set.id}
                      className={cn(
                        'cursor-pointer hover:bg-muted/50 min-h-[44px]',
                        isDirty(set.id) && 'border-l-2 border-l-primary bg-primary/5'
                      )}
                      onClick={() => !isGridEditMode && openDetailPanel('set', set.id)}
                      onDoubleClick={() => !isGridEditMode && navigate(`/sets/${set.id}`)}
                    >
                      <TableCell>
                        {/* Client - Read-only (nested relation) */}
                        {renderReadOnlyCell(set.clients?.name || set.projects?.clients?.name || '—')}
                      </TableCell>
                      <TableCell>
                        {/* Project - Read-only (nested relation) */}
                        {renderReadOnlyCell(set.projects?.name || '—')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {/* Set Name - Editable */}
                        <div className="flex items-center gap-2">
                          {renderEditableCell(set, 'name', 'text', undefined, () => (
                            <span className="flex items-center gap-2">
                              {set.name}
                              {set.display_id && (
                                <Badge variant="outline" className="font-mono text-xs">
                                  #{set.display_id}
                                </Badge>
                              )}
                            </span>
                          ))}
                          {isGridEditMode && set.display_id && (
                            <Badge variant="outline" className="font-mono text-xs shrink-0">
                              #{set.display_id}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Urgency - Editable */}
                        {renderEditableCell(set, 'urgency', 'select', URGENCY_OPTIONS, () => (
                          <Badge variant="outline" className="capitalize">
                            {set.urgency}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell>
                        {/* Importance - Editable */}
                        {renderEditableCell(set, 'importance', 'select', IMPORTANCE_OPTIONS, () => (
                          <Badge variant="outline" className="capitalize">
                            {set.importance}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell>
                        {/* Priority - Read-only (calculated) */}
                        {(() => {
                          const priority = (set.priority || calculateEisenhowerPriority(set.importance, set.urgency)) as 1 | 2 | 3 | 4 | 5 | 6
                          return renderReadOnlyCell(
                            <Badge className={getPriorityColor(priority)} variant="outline">
                              P{priority}
                            </Badge>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        {/* Status - Read-only (derived) */}
                        {renderReadOnlyCell(
                          <Badge className={getStatusColor(computeDisplayStatus(set))} variant="outline">
                            {getStatusLabel(computeDisplayStatus(set))}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Lead - Editable */}
                        {renderEditableCell(set, 'lead_id', 'select', userOptions, () => (
                          <span>{set.lead?.full_name || set.owner?.full_name || '—'}</span>
                        ))}
                      </TableCell>
                      <TableCell>
                        {/* Mobile-only Open button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 md:hidden"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/sets/${set.id}`)
                          }}
                          title="Open"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Floating Save Bar */}
      {isGridEditMode && dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 flex justify-between items-center z-50">
          <span className="text-sm font-medium">
            {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDiscard} disabled={isSaving}>
              Discard
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save All'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}.
              Are you sure you want to exit Grid Edit mode? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        defaultEntity="sets"
      />
    </div>
  )
}
