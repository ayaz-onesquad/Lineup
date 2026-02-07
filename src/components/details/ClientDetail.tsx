import { Link } from 'react-router-dom'
import { useClient } from '@/hooks/useClients'
import { useProjectsByClient } from '@/hooks/useProjects'
import { useContacts } from '@/hooks/useContacts'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Calendar, Star } from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'

interface ClientDetailProps {
  id: string
}

export function ClientDetail({ id }: ClientDetailProps) {
  const { data: client, isLoading } = useClient(id)
  const { data: projects, isLoading: projectsLoading } = useProjectsByClient(id)
  const { data: contacts, isLoading: contactsLoading } = useContacts(id)

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

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList className="w-full">
          <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
          <TabsTrigger value="contacts" className="flex-1">
            Contacts
            {contacts && contacts.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                {contacts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex-1">
            Projects
            {projects && projects.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                {projects.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{client.company_name}</span>
            </div>
            {client.industry && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{client.industry.replace('_', ' ')}</span>
              </div>
            )}
            {client.location && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{client.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Added {formatDate(client.created_at)}</span>
            </div>
          </div>
          {client.overview && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">{client.overview}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          {contactsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : contacts?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No contacts</p>
          ) : (
            <div className="space-y-2">
              {contacts?.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {contact.first_name[0]}{contact.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate">
                        {contact.first_name} {contact.last_name}
                      </p>
                      {contact.is_primary && (
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    {contact.email && (
                      <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                    )}
                  </div>
                  {contact.role && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {contact.role}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          {projectsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : projects?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No projects</p>
          ) : (
            <div className="space-y-2">
              {projects?.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="block p-3 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{project.name}</span>
                    <Badge className={`${getStatusColor(project.status)} text-xs`}>
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span>{project.project_code}</span>
                    <Badge variant="outline" className={`${getHealthColor(project.health)} text-xs`}>
                      {project.health.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={project.completion_percentage} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground">{project.completion_percentage}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
