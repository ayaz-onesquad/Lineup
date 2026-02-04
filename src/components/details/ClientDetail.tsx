import { useClient } from '@/hooks/useClients'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Mail, Phone, Calendar } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface ClientDetailProps {
  id: string
}

export function ClientDetail({ id }: ClientDetailProps) {
  const { data: client, isLoading } = useClient(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!client) {
    return <div className="text-muted-foreground">Client not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{client.name}</h3>
        </div>
        <Badge variant={client.status === 'active' ? 'success' : 'secondary'}>
          {client.status}
        </Badge>
      </div>

      {/* Details */}
      <Tabs defaultValue="details">
        <TabsList className="w-full">
          <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
          <TabsTrigger value="projects" className="flex-1">Projects</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{client.company_name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{client.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Added {formatDate(client.created_at)}</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <p className="text-sm text-muted-foreground">Projects will be listed here</p>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <p className="text-sm text-muted-foreground">Documents will be listed here</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
