import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAllContacts } from '@/hooks/useContacts'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Users, Search, Star, MoreVertical, ExternalLink, Building2, Plus } from 'lucide-react'
import { CONTACT_ROLE_OPTIONS } from '@/lib/utils'

export function ContactsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data: contacts, isLoading } = useAllContacts()
  const { openCreateModal } = useUIStore()

  const filteredContacts = contacts?.filter((contact) => {
    const searchLower = search.toLowerCase()
    return (
      contact.first_name.toLowerCase().includes(searchLower) ||
      contact.last_name.toLowerCase().includes(searchLower) ||
      contact.email?.toLowerCase().includes(searchLower) ||
      contact.clients?.name.toLowerCase().includes(searchLower)
    )
  })

  const handleRowDoubleClick = (contactId: string) => {
    navigate(`/contacts/${contactId}`)
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Contacts</h1>
          <p className="text-muted-foreground">Manage contacts across all clients</p>
        </div>
        <Button onClick={() => openCreateModal('contact')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Contacts Table */}
      {isLoading ? (
        <Card className="card-carbon">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-[80px] text-center">Primary</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filteredContacts?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search ? 'No contacts match your search' : 'No contacts yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-carbon">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-[80px] text-center">Primary</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts?.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => handleRowDoubleClick(contact.id)}
                  >
                    <TableCell className="font-medium">
                      {contact.first_name} {contact.last_name}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/clients/${contact.client_id}`}
                        className="flex items-center gap-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {contact.clients?.name || '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {contact.is_primary ? (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.role ? (
                        <Badge variant="outline">
                          {CONTACT_ROLE_OPTIONS.find((o) => o.value === contact.role)?.label ||
                            contact.role}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{contact.email || '—'}</TableCell>
                    <TableCell>{contact.phone || '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/contacts/${contact.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Contact
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/contacts/${contact.id}?edit=true`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Edit Contact
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/clients/${contact.client_id}`}>
                              <Building2 className="mr-2 h-4 w-4" />
                              View Client
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
