import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetitors, useCompetitorMutations } from '@/hooks/useCompetitors'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Swords,
  Plus,
  Search,
  MoreVertical,
  ExternalLink,
  Trash2,
  Edit,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

// Threat level badge colors
const threatLevelColors: Record<string, string> = {
  critical: 'bg-red-500 text-white hover:bg-red-600',
  high: 'bg-orange-500 text-white hover:bg-orange-600',
  medium: 'bg-yellow-500 text-black hover:bg-yellow-600',
  low: 'bg-gray-400 text-white hover:bg-gray-500',
}

// Status badge variants
const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  acquired: 'outline',
  defunct: 'destructive',
}

export function CompetitorsPage() {
  const navigate = useNavigate()
  const { data: competitors, isLoading } = useCompetitors()
  const { deleteCompetitor } = useCompetitorMutations()
  const { openCreateModal } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [competitorToDelete, setCompetitorToDelete] = useState<string | null>(null)

  // Filter competitors by search query
  const filteredCompetitors = competitors?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.target_market?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const handleDelete = async () => {
    if (competitorToDelete) {
      await deleteCompetitor.mutateAsync(competitorToDelete)
      setDeleteDialogOpen(false)
      setCompetitorToDelete(null)
    }
  }

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCompetitorToDelete(id)
    setDeleteDialogOpen(true)
  }

  const truncateUrl = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url.slice(0, 30)
    }
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Competitor Tracker</h1>
            <p className="text-muted-foreground">
              Monitor and analyze your competitive landscape
            </p>
          </div>
        </div>
        <Button onClick={() => openCreateModal('competitor')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Competitor
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search competitors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Competitors Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Threat Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Reviewed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filteredCompetitors.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <Swords className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <CardTitle>No competitors yet</CardTitle>
            <CardDescription>
              {searchQuery
                ? 'No competitors match your search.'
                : 'Start by adding your first competitor.'}
            </CardDescription>
            {!searchQuery && (
              <Button className="mt-4" onClick={() => openCreateModal('competitor')}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Competitor
              </Button>
            )}
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Threat Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Reviewed</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompetitors.map((competitor) => (
                  <TableRow
                    key={competitor.id}
                    className="cursor-pointer hover:bg-muted/50 min-h-[44px]"
                    onDoubleClick={() => navigate(`/competitors/${competitor.id}`)}
                  >
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        COMP-{String(competitor.display_id).padStart(4, '0')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {competitor.name}
                    </TableCell>
                    <TableCell>
                      {competitor.industry || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {competitor.website ? (
                        <a
                          href={competitor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 truncate max-w-[150px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">{truncateUrl(competitor.website)}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {competitor.threat_level ? (
                        <Badge className={threatLevelColors[competitor.threat_level]}>
                          {competitor.threat_level.charAt(0).toUpperCase() + competitor.threat_level.slice(1)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[competitor.status]}>
                        {competitor.status.charAt(0).toUpperCase() + competitor.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {competitor.last_reviewed_at
                        ? formatDate(competitor.last_reviewed_at)
                        : <span className="text-muted-foreground">Never</span>}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-50">
                          <DropdownMenuItem onClick={() => navigate(`/competitors/${competitor.id}?edit=true`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/competitors/${competitor.id}`)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => confirmDelete(competitor.id, e as unknown as React.MouseEvent)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Mobile-only Open button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 md:hidden"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/competitors/${competitor.id}`)
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
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Competitor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this competitor record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
