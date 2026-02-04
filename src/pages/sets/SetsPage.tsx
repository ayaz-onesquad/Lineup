import { useState } from 'react'
import { useSets } from '@/hooks/useSets'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Layers, Grid, LayoutGrid } from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'
import type { SetWithRelations } from '@/types/database'

export function SetsPage() {
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')
  const { data: sets, isLoading } = useSets()
  const { openCreateModal, openDetailPanel } = useUIStore()

  const filteredSets = sets?.filter(
    (set) =>
      set.name.toLowerCase().includes(search.toLowerCase()) ||
      set.projects?.name.toLowerCase().includes(search.toLowerCase())
  )

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
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm truncate">{set.name}</span>
        <Badge className={getStatusColor(set.status)} variant="outline">
          {set.status}
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

      {/* Search and View Toggle */}
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
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-l-none"
            onClick={() => setViewMode('list')}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
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
        /* List View */
        <div className="space-y-3">
          {filteredSets?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sets found</p>
                <Button className="mt-4" onClick={() => openCreateModal('set')}>
                  Create your first set
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredSets?.map((set) => (
              <Card
                key={set.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetailPanel('set', set.id)}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <div
                    className={`w-1 h-12 rounded-full ${
                      set.urgency === 'high' && set.importance === 'high'
                        ? 'bg-red-500'
                        : set.importance === 'high'
                        ? 'bg-blue-500'
                        : set.urgency === 'high'
                        ? 'bg-amber-500'
                        : 'bg-gray-400'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{set.name}</span>
                      <Badge className={getStatusColor(set.status)} variant="outline">
                        {set.status}
                      </Badge>
                      <Badge variant="outline">
                        U:{set.urgency[0].toUpperCase()} I:{set.importance[0].toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {set.projects?.name}
                      {set.project_phases && ` • ${set.project_phases.name}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24">
                      <Progress value={set.completion_percentage} className="h-2" />
                    </div>
                    <span className="text-sm w-10">{set.completion_percentage}%</span>
                    {set.due_date && (
                      <span className="text-sm text-muted-foreground">
                        {formatDate(set.due_date)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
