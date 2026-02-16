import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useDocumentCatalog,
  useDocumentCatalogMutations,
  useDocumentCatalogUsage,
} from '@/hooks/useDocumentCatalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Search,
  MoreVertical,
  FileText,
  Edit,
  Power,
  PowerOff,
  Package,
  Loader2,
  FileCheck,
  FileLock,
  FileBox,
  FileStack,
  type LucideIcon,
} from 'lucide-react'
import type { DocumentCatalog, DocumentCatalogCategory } from '@/types/database'

// Form schema
const catalogFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.enum(['deliverable', 'legal', 'internal', 'reference']),
  is_client_deliverable: z.boolean(),
  file_type_hint: z.string().optional(),
  is_active: z.boolean(),
})

type CatalogFormValues = z.infer<typeof catalogFormSchema>

const CATEGORY_OPTIONS: { value: DocumentCatalogCategory; label: string; icon: LucideIcon }[] = [
  { value: 'deliverable', label: 'Deliverable', icon: FileCheck },
  { value: 'legal', label: 'Legal', icon: FileLock },
  { value: 'internal', label: 'Internal', icon: FileBox },
  { value: 'reference', label: 'Reference', icon: FileStack },
]

const getCategoryIcon = (category: DocumentCatalogCategory) => {
  const option = CATEGORY_OPTIONS.find((o) => o.value === category)
  return option?.icon || FileText
}

const getCategoryColor = (category: DocumentCatalogCategory) => {
  switch (category) {
    case 'deliverable':
      return 'bg-green-100 text-green-800'
    case 'legal':
      return 'bg-red-100 text-red-800'
    case 'internal':
      return 'bg-blue-100 text-blue-800'
    case 'reference':
      return 'bg-gray-100 text-gray-800'
    default:
      return ''
  }
}

export function DocumentCatalogPage() {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DocumentCatalog | null>(null)
  const [usageDialogOpen, setUsageDialogOpen] = useState(false)
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)

  const { data: catalogItems, isLoading } = useDocumentCatalog(showInactive)
  const { data: usageData, isLoading: usageLoading } = useDocumentCatalogUsage(
    selectedCatalogId || ''
  )
  const {
    createCatalogEntry,
    updateCatalogEntry,
    deactivateCatalogEntry,
    activateCatalogEntry,
    seedDefaults,
  } = useDocumentCatalogMutations()

  const form = useForm<CatalogFormValues>({
    resolver: zodResolver(catalogFormSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'internal',
      is_client_deliverable: false,
      file_type_hint: '',
      is_active: true,
    },
  })

  // Filter and group items
  const filteredItems = useMemo(() => {
    if (!catalogItems) return []
    return catalogItems.filter(
      (item) =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
    )
  }, [catalogItems, search])

  const itemsByCategory = useMemo(() => {
    const grouped: Record<DocumentCatalogCategory, DocumentCatalog[]> = {
      deliverable: [],
      legal: [],
      internal: [],
      reference: [],
    }
    for (const item of filteredItems) {
      if (grouped[item.category]) {
        grouped[item.category].push(item)
      }
    }
    return grouped
  }, [filteredItems])

  const openCreateDialog = () => {
    setEditingItem(null)
    form.reset({
      name: '',
      description: '',
      category: 'internal',
      is_client_deliverable: false,
      file_type_hint: '',
      is_active: true,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (item: DocumentCatalog) => {
    setEditingItem(item)
    form.reset({
      name: item.name,
      description: item.description || '',
      category: item.category,
      is_client_deliverable: item.is_client_deliverable,
      file_type_hint: item.file_type_hint || '',
      is_active: item.is_active,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (data: CatalogFormValues) => {
    if (editingItem) {
      await updateCatalogEntry.mutateAsync({
        id: editingItem.id,
        ...data,
      })
    } else {
      await createCatalogEntry.mutateAsync(data)
    }
    setDialogOpen(false)
    setEditingItem(null)
  }

  const handleViewUsage = (catalogId: string) => {
    setSelectedCatalogId(catalogId)
    setUsageDialogOpen(true)
  }

  const handleSeedDefaults = async () => {
    await seedDefaults.mutateAsync()
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Catalog</h1>
          <p className="text-muted-foreground">
            Manage document types and standards for your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeedDefaults} disabled={seedDefaults.isPending}>
            {seedDefaults.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Package className="mr-2 h-4 w-4" />
            )}
            Seed Defaults
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Document Type
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search document types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
          <Label htmlFor="show-inactive">Show inactive</Label>
        </div>
      </div>

      {/* Category Tabs */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All ({filteredItems.length})</TabsTrigger>
            {CATEGORY_OPTIONS.map((cat) => (
              <TabsTrigger key={cat.value} value={cat.value} className="gap-2">
                <cat.icon className="h-4 w-4" />
                {cat.label} ({itemsByCategory[cat.value]?.length || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {/* All tab */}
          <TabsContent value="all" className="mt-6">
            <CatalogTable
              items={filteredItems}
              onEdit={openEditDialog}
              onViewUsage={handleViewUsage}
              onDeactivate={(id) => deactivateCatalogEntry.mutate(id)}
              onActivate={(id) => activateCatalogEntry.mutate(id)}
            />
          </TabsContent>

          {/* Category tabs */}
          {CATEGORY_OPTIONS.map((cat) => (
            <TabsContent key={cat.value} value={cat.value} className="mt-6">
              <CatalogTable
                items={itemsByCategory[cat.value] || []}
                onEdit={openEditDialog}
                onViewUsage={handleViewUsage}
                onDeactivate={(id) => deactivateCatalogEntry.mutate(id)}
                onActivate={(id) => activateCatalogEntry.mutate(id)}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Document Type' : 'Create Document Type'}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Update the document type details.'
                : 'Add a new document type to your catalog.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="e.g., Project Proposal"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder="Brief description of this document type..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={form.watch('category')}
                onValueChange={(v) => form.setValue('category', v as DocumentCatalogCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        <cat.icon className="h-4 w-4" />
                        {cat.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file_type_hint">File Type Hint</Label>
              <Input
                id="file_type_hint"
                {...form.register('file_type_hint')}
                placeholder="e.g., .pdf, .docx"
              />
              <p className="text-xs text-muted-foreground">
                Suggested file extensions for this document type
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_client_deliverable"
                  checked={form.watch('is_client_deliverable')}
                  onCheckedChange={(v) => form.setValue('is_client_deliverable', v)}
                />
                <Label htmlFor="is_client_deliverable">Client Deliverable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={form.watch('is_active')}
                  onCheckedChange={(v) => form.setValue('is_active', v)}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createCatalogEntry.isPending || updateCatalogEntry.isPending}
              >
                {(createCatalogEntry.isPending || updateCatalogEntry.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingItem ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Usage Dialog */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Document Type Usage</DialogTitle>
            <DialogDescription>
              Documents using this document type
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {usageLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : usageData ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {usageData.count}
                  </Badge>
                  <span className="text-muted-foreground">documents using this type</span>
                </div>
                {usageData.documents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Recent documents:</p>
                    <ul className="text-sm space-y-1">
                      {(usageData.documents as Array<{ id: string; name: string }>).map((doc) => (
                        <li key={doc.id} className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{doc.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No usage data available</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setUsageDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Catalog Table Component
function CatalogTable({
  items,
  onEdit,
  onViewUsage,
  onDeactivate,
  onActivate,
}: {
  items: DocumentCatalog[]
  onEdit: (item: DocumentCatalog) => void
  onViewUsage: (id: string) => void
  onDeactivate: (id: string) => void
  onActivate: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No document types found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="card-carbon">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>File Type</TableHead>
              <TableHead>Client Deliverable</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const CategoryIcon = getCategoryIcon(item.category)
              return (
                <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getCategoryColor(item.category)}>
                      <CategoryIcon className="h-3 w-3 mr-1" />
                      {item.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.file_type_hint || '—'}</TableCell>
                  <TableCell>
                    {item.is_client_deliverable ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => onViewUsage(item.id)}
                    >
                      {item.usage_count} docs
                    </Button>
                  </TableCell>
                  <TableCell>
                    {item.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(item)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onViewUsage(item.id)}>
                          <FileText className="mr-2 h-4 w-4" />
                          View Usage
                        </DropdownMenuItem>
                        {item.is_active ? (
                          <DropdownMenuItem
                            className="text-amber-600"
                            onClick={() => onDeactivate(item.id)}
                          >
                            <PowerOff className="mr-2 h-4 w-4" />
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-green-600"
                            onClick={() => onActivate(item.id)}
                          >
                            <Power className="mr-2 h-4 w-4" />
                            Activate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
