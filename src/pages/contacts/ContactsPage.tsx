import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAllContacts } from '@/hooks/useContacts'
import { useUIStore } from '@/stores'
import { PageShell } from '@/components/layouts/PageShell'
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid'
import { GridToolbar, GridSearch } from '@/components/shared/GridToolbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TruncatedCell } from '@/components/shared/TruncatedCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Users, Star, MoreVertical, ExternalLink, Building2, Plus } from 'lucide-react'
import { CONTACT_ROLE_OPTIONS } from '@/lib/utils'
import type { ContactWithCreator } from '@/types/database'

function contactName(contact: ContactWithCreator): string {
  return `${contact.first_name} ${contact.last_name}`.trim()
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return CONTACT_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role
}

export function ContactsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data: contacts, isLoading, error, refetch } = useAllContacts()
  const { openCreateModal } = useUIStore()

  const filteredContacts = useMemo(() => {
    const searchLower = search.toLowerCase()
    return (contacts ?? []).filter((contact) => {
      return (
        contact.first_name.toLowerCase().includes(searchLower) ||
        contact.last_name.toLowerCase().includes(searchLower) ||
        contact.email?.toLowerCase().includes(searchLower) ||
        contact.clients?.name.toLowerCase().includes(searchLower)
      )
    })
  }, [contacts, search])

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1: the contact's name
  // identifies the row; the client, role and the two contact methods are what
  // you need to triage without opening the record.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<ContactWithCreator>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '110px',
        accessor: (row) => row.display_id ?? 0,
        cell: (row) => (
          <Badge variant="outline" className="font-mono text-xs">
            CON-{String(row.display_id ?? 0).padStart(4, '0')}
          </Badge>
        ),
      },
      {
        id: 'name',
        header: 'Name',
        priority: 'primary',
        hideable: false,
        minWidth: '200px',
        accessor: (row) => contactName(row),
        cell: (row) => (
          <span className="font-medium">
            <TruncatedCell value={contactName(row)} maxLines={1} />
          </span>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        priority: 'secondary',
        width: '180px',
        accessor: (row) => row.clients?.name ?? '',
        cell: (row) =>
          row.clients?.name && row.client_id ? (
            <Link
              to={`/clients/${row.client_id}`}
              className="flex min-w-0 items-center gap-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <TruncatedCell value={row.clients.name} maxLines={1} />
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'role',
        header: 'Role',
        priority: 'secondary',
        width: '150px',
        accessor: (row) => roleLabel(row.role),
        cell: (row) =>
          row.role ? (
            <Badge variant="outline">{roleLabel(row.role)}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'email',
        header: 'Email',
        priority: 'secondary',
        width: '220px',
        accessor: (row) => row.email ?? '',
        cell: (row) => <TruncatedCell value={row.email} maxLines={1} />,
      },
      {
        id: 'phone',
        header: 'Phone',
        priority: 'secondary',
        width: '150px',
        accessor: (row) => row.phone ?? '',
      },
      {
        id: 'is_primary',
        header: 'Primary',
        mobileLabel: 'Primary',
        width: '100px',
        align: 'center',
        accessor: (row) => !!row.is_primary,
        cell: (row) =>
          row.is_primary ? (
            <>
              <Star
                className="mx-auto h-4 w-4 fill-yellow-500 text-yellow-500"
                aria-hidden="true"
              />
              <span className="sr-only">Primary contact</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    []
  )

  return (
    <PageShell
      title="All Contacts"
      description="Manage contacts across all clients"
      icon={Users}
      actions={
        <Button onClick={() => openCreateModal('contact')} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add Contact
        </Button>
      }
    >
      <DataGrid
        columns={columns}
        data={filteredContacts}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="contacts"
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        ariaLabel="Contacts"
        // The page has no quick-view panel, so opening the record is the only
        // row action: double click, Enter, or a tap on mobile.
        onRowOpen={(row) => navigate(`/contacts/${row.id}`)}
        hasActiveFilters={!!search}
        onClearFilters={() => setSearch('')}
        emptyState={{
          icon: Users,
          title: 'No contacts yet',
          description: 'Add a contact to start tracking the people behind your clients.',
          action: (
            <Button variant="outline" onClick={() => openCreateModal('contact')}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add Contact
            </Button>
          ),
        }}
        toolbar={
          <GridToolbar
            search={
              <GridSearch
                value={search}
                onChange={setSearch}
                placeholder="Search by name, email or client..."
              />
            }
          />
        }
        rowActions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${contactName(row)}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50">
              <DropdownMenuItem asChild>
                <Link to={`/contacts/${row.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Contact
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/contacts/${row.id}?edit=true`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Edit Contact
                </Link>
              </DropdownMenuItem>
              {row.client_id && (
                <DropdownMenuItem asChild>
                  <Link to={`/clients/${row.client_id}`}>
                    <Building2 className="mr-2 h-4 w-4" />
                    View Client
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </PageShell>
  )
}
