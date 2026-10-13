import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePasswords, usePasswordMutations } from '@/hooks/usePasswords'
import { passwordsApi } from '@/services/api'
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
  DropdownMenuSeparator,
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
  Lock,
  Plus,
  MoreVertical,
  ExternalLink,
  Copy,
  Trash2,
  Edit,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/urlSafety'
import { toast } from '@/hooks/use-toast'
import { copySecret, secretClipboardTtlSeconds } from '@/lib/clipboard'
import type { Password } from '@/types/database'

/** Hostname only, so a long URL does not dominate the column. */
function urlHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function PasswordsPage() {
  const navigate = useNavigate()
  const { data: passwords, isLoading, error, refetch } = usePasswords()
  const { deletePassword } = usePasswordMutations()
  const { openCreateModal } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [passwordToDelete, setPasswordToDelete] = useState<string | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)

  const hasActiveFilters = !!searchQuery
  const clearFilters = () => setSearchQuery('')

  // Filter passwords by search query
  const filteredPasswords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return passwords ?? []
    return (passwords ?? []).filter(
      p =>
        p.application_name.toLowerCase().includes(query) ||
        p.username?.toLowerCase().includes(query) ||
        p.email?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
    )
  }, [passwords, searchQuery])

  /**
   * Fetches the secret for one record, then copies it.
   *
   * The grid no longer carries the secrets: reveal happens one row at a time,
   * on demand, and is recorded in the password access log.
   */
  const handleCopyPassword = useCallback(async (id: string) => {
    setCopyingId(id)
    try {
      const secret = await passwordsApi.reveal(id)
      const copied = await copySecret(secret)
      toast({
        title: copied ? 'Password copied' : 'Could not copy',
        description: copied
          ? `Cleared from the clipboard automatically in ${secretClipboardTtlSeconds()} seconds.`
          : 'Your browser blocked clipboard access. Open the record and reveal it there.',
        variant: copied ? undefined : 'destructive',
      })
    } catch (err) {
      toast({
        title: 'Could not retrieve the password',
        description: err instanceof Error ? err.message : 'An unknown error occurred.',
        variant: 'destructive',
      })
    } finally {
      setCopyingId(null)
    }
  }, [])

  const handleDelete = async () => {
    if (passwordToDelete) {
      await deletePassword.mutateAsync(passwordToDelete)
      setDeleteDialogOpen(false)
      setPasswordToDelete(null)
    }
  }

  const confirmDelete = (id: string) => {
    setPasswordToDelete(id)
    setDeleteDialogOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Columns
  //
  // Priorities per docs/DESIGN-SYSTEM.md section 4.1. The application name
  // identifies the row; category, username, email and the rotation date are the
  // four facts needed to triage a credential without opening it.
  //
  // The secret is deliberately absent from the row data: the masked cell is a
  // constant, and the value is only ever fetched one row at a time through
  // `passwordsApi.reveal`, which is audited server-side.
  // ---------------------------------------------------------------------------
  const columns = useMemo<DataGridColumn<Password>[]>(
    () => [
      {
        id: 'display_id',
        header: 'ID',
        hideOnMobile: true,
        hideable: false,
        width: '110px',
        accessor: row => row.display_id ?? 0,
        cell: row => (
          <Badge variant="outline" className="font-mono text-xs">
            PWD-{String(row.display_id ?? 0).padStart(4, '0')}
          </Badge>
        ),
      },
      {
        id: 'application_name',
        header: 'Application',
        priority: 'primary',
        hideable: false,
        minWidth: '200px',
        accessor: row => row.application_name,
        cell: row => (
          <span className="font-medium">
            <TruncatedCell value={row.application_name} maxLines={1} />
          </span>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        priority: 'secondary',
        width: '150px',
        accessor: row => row.category ?? '',
        cell: row =>
          row.category ? (
            <Badge variant="secondary">{row.category}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'username',
        header: 'Username',
        priority: 'secondary',
        width: '160px',
        accessor: row => row.username ?? '',
        cell: row => <TruncatedCell value={row.username} maxLines={1} />,
      },
      {
        id: 'email',
        header: 'Email',
        priority: 'secondary',
        width: '200px',
        accessor: row => row.email ?? '',
        cell: row => <TruncatedCell value={row.email} maxLines={1} />,
      },
      {
        id: 'password_changed_at',
        header: 'Changed',
        priority: 'secondary',
        mobileLabel: 'Changed',
        width: '150px',
        accessor: row => row.password_changed_at,
        cell: row =>
          row.password_changed_at ? (
            <span>{formatDate(row.password_changed_at)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'url',
        header: 'URL',
        width: '180px',
        accessor: row => (row.url ? urlHostname(row.url) : ''),
        cell: row =>
          row.url ? (
            // safeHttpUrl rejects anything that is not http(s), so a stored
            // `javascript:` value cannot become an executable href.
            <a
              href={safeHttpUrl(row.url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-[160px] items-center gap-1 truncate text-primary hover:underline"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{urlHostname(row.url)}</span>
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'password',
        header: 'Password',
        // Never sortable and never accessible as data: there is no secret in
        // the row to sort by, and there must never be one.
        sortable: false,
        hideOnMobile: true,
        width: '130px',
        cell: row => (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">••••••••</span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={copyingId === row.id}
              aria-label={`Copy password for ${row.application_name}`}
              title="Copy password (recorded in the access log)"
              onClick={e => {
                e.stopPropagation()
                void handleCopyPassword(row.id)
              }}
            >
              {copyingId === row.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        ),
      },
      {
        id: 'created_at',
        header: 'Created',
        hideOnMobile: true,
        width: '150px',
        accessor: row => row.created_at,
        cell: row => formatDate(row.created_at),
      },
    ],
    // `copyingId` drives the spinner on the copy button.
    [copyingId, handleCopyPassword]
  )

  return (
    <PageShell
      title="Password Manager"
      description="Manage credentials for your tools and services"
      icon={Lock}
      actions={
        <Button onClick={() => openCreateModal('password')} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Password
        </Button>
      }
    >
      <DataGrid
        columns={columns}
        data={filteredPasswords}
        getRowId={row => row.id}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        storageKey="passwords"
        defaultSort={{ columnId: 'application_name', direction: 'asc' }}
        ariaLabel="Passwords"
        // Double click, Enter or a mobile tap opens the record. There is no
        // quick-view panel for credentials, so single click does nothing.
        onRowOpen={row => navigate(`/passwords/${row.id}`)}
        // Copying a credential IS the point of this list, so it is the one
        // row action that stays on the mobile card rather than moving to the
        // detail page. See docs/DESIGN-SYSTEM.md section 4.5.
        mobileCardActions={row => (
          <Button
            variant="outline"
            size="sm"
            disabled={copyingId === row.id}
            aria-label={`Copy password for ${row.application_name}`}
            onClick={() => void handleCopyPassword(row.id)}
          >
            {copyingId === row.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Copy password
          </Button>
        )}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        emptyState={{
          icon: Lock,
          title: 'No passwords yet',
          description: 'Start by adding your first credential.',
          action: (
            <Button onClick={() => openCreateModal('password')}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Password
            </Button>
          ),
        }}
        toolbar={
          <GridToolbar
            search={
              <GridSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by application, username, email or category..."
              />
            }
          />
        }
        rowActions={row => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Password actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50">
              <DropdownMenuItem onClick={() => navigate(`/passwords/${row.id}?edit=true`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/passwords/${row.id}`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => confirmDelete(row.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Password?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this credential. This action cannot be undone.
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
    </PageShell>
  )
}
