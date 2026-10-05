import { supabase } from '@/services/supabase'
import {
  validateCompanyDocumentFile,
  sanitizeFileName,
} from '@/lib/companyDocuments'
import type {
  CompanyDocument,
  CompanyDocumentWithPeople,
  CreateCompanyDocumentInput,
  UpdateCompanyDocumentInput,
  CompanyDocumentVersion,
  CompanyDocumentAccessLogEntry,
  CompanyDocumentAcknowledgement,
  CompanyDocumentAccessAction,
  UserProfile,
} from '@/types/database'

const BUCKET = 'documents'

/** Sub-folder inside the tenant folder, so company docs are easy to audit. */
const FOLDER = 'company-documents'

/**
 * Default signed-URL lifetime, in seconds. Short on purpose: a leaked view URL
 * stops working almost immediately. Overridable per tenant via
 * `tenant_security_settings.signed_url_ttl_seconds`.
 */
const DEFAULT_SIGNED_URL_TTL = 120

export class DownloadNotPermittedError extends Error {
  constructor(message = 'This document is view-only. Downloading is not permitted.') {
    super(message)
    this.name = 'DownloadNotPermittedError'
  }
}

export class CompanyDocumentStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanyDocumentStorageError'
  }
}

// ---------------------------------------------------------------------------
// Profile hydration
//
// created_by / updated_by / owner_user_id reference auth.users, so profiles are
// resolved through user_profiles.user_id (the same approach documents.ts uses).
// ---------------------------------------------------------------------------

async function loadProfiles(userIds: Iterable<string>): Promise<Map<string, UserProfile>> {
  const ids = Array.from(new Set(Array.from(userIds).filter(Boolean)))
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from('user_profiles')
    .select('id, user_id, first_name, last_name, full_name, avatar_url')
    .in('user_id', ids)

  return new Map((data ?? []).map(p => [p.user_id, p as UserProfile]))
}

function attachPeople(
  doc: CompanyDocument,
  profiles: Map<string, UserProfile>
): CompanyDocumentWithPeople {
  return {
    ...doc,
    owner: doc.owner_user_id ? profiles.get(doc.owner_user_id) ?? null : null,
    creator: doc.created_by ? profiles.get(doc.created_by) ?? null : null,
    updater: doc.updated_by ? profiles.get(doc.updated_by) ?? null : null,
  }
}

function collectUserIds(docs: CompanyDocument[]): string[] {
  const ids: string[] = []
  for (const d of docs) {
    if (d.owner_user_id) ids.push(d.owner_user_id)
    if (d.created_by) ids.push(d.created_by)
    if (d.updated_by) ids.push(d.updated_by)
  }
  return ids
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/**
 * SHA-256 of the file, stored alongside it so a later download can be checked
 * for tampering and so duplicate uploads are detectable.
 * Returns null where SubtleCrypto is unavailable (non-HTTPS origins).
 */
async function sha256Hex(file: File): Promise<string | null> {
  if (!window.crypto?.subtle) return null
  try {
    const buffer = await file.arrayBuffer()
    const digest = await window.crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/** Collision-free object key. The original name is kept in `file_name`. */
function buildStoragePath(tenantId: string, extension: string): string {
  const id =
    window.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const suffix = extension ? `.${extension}` : ''
  return `${tenantId}/${FOLDER}/${id}${suffix}`
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const companyDocumentsApi = {
  /** All company documents visible to the caller. RLS filters confidentiality. */
  getAll: async (tenantId: string): Promise<CompanyDocumentWithPeople[]> => {
    const { data, error } = await supabase
      .from('company_documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('title', { ascending: true })

    if (error) throw error

    const docs = (data ?? []) as CompanyDocument[]
    const profiles = await loadProfiles(collectUserIds(docs))
    return docs.map(d => attachPeople(d, profiles))
  },

  getById: async (id: string): Promise<CompanyDocumentWithPeople | null> => {
    const { data, error } = await supabase
      .from('company_documents')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    const doc = data as CompanyDocument
    const profiles = await loadProfiles(collectUserIds([doc]))
    return attachPeople(doc, profiles)
  },

  /** Documents whose review date has passed or falls within `withinDays`. */
  getDueForReview: async (
    tenantId: string,
    withinDays = 30
  ): Promise<CompanyDocumentWithPeople[]> => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + withinDays)

    const { data, error } = await supabase
      .from('company_documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('review_due_date', 'is', null)
      .lte('review_due_date', cutoff.toISOString().slice(0, 10))
      .order('review_due_date', { ascending: true })

    if (error) throw error

    const docs = (data ?? []) as CompanyDocument[]
    const profiles = await loadProfiles(collectUserIds(docs))
    return docs.map(d => attachPeople(d, profiles))
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateCompanyDocumentInput
  ): Promise<CompanyDocument> => {
    const { data, error } = await supabase
      .from('company_documents')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        owner_user_id: input.owner_user_id ?? userId,
        title: input.title,
        description: input.description ?? null,
        document_type: input.document_type,
        category: input.category ?? null,
        reference_code: input.reference_code ?? null,
        status: input.status ?? 'draft',
        version: input.version ?? '1.0',
        effective_date: input.effective_date ?? null,
        review_due_date: input.review_due_date ?? null,
        confidentiality: input.confidentiality ?? 'internal',
        // View-only by default: the whole point of this library is that staff
        // read protocols in the app rather than copying them to local devices.
        allow_download: input.allow_download ?? false,
        watermark_on_view: input.watermark_on_view ?? true,
        requires_acknowledgement: input.requires_acknowledgement ?? false,
        storage_path: input.storage_path ?? null,
        file_name: input.file_name ?? null,
        file_type: input.file_type ?? null,
        file_size_bytes: input.file_size_bytes ?? null,
        file_checksum: input.file_checksum ?? null,
        external_link: input.external_link ?? null,
        tags: input.tags ?? [],
      })
      .select()
      .single()

    if (error) throw error
    return data as CompanyDocument
  },

  update: async (
    id: string,
    userId: string,
    input: UpdateCompanyDocumentInput
  ): Promise<CompanyDocument> => {
    // Only forward keys the caller actually supplied, so a partial edit never
    // clears unrelated fields.
    const payload: Record<string, unknown> = { updated_by: userId }
    const assignable: (keyof UpdateCompanyDocumentInput)[] = [
      'title',
      'description',
      'document_type',
      'category',
      'reference_code',
      'status',
      'version',
      'effective_date',
      'review_due_date',
      'owner_user_id',
      'confidentiality',
      'allow_download',
      'watermark_on_view',
      'requires_acknowledgement',
      'storage_path',
      'file_name',
      'file_type',
      'file_size_bytes',
      'file_checksum',
      'external_link',
      'tags',
    ]
    for (const key of assignable) {
      if (input[key] !== undefined) payload[key] = input[key]
    }

    const { data, error } = await supabase
      .from('company_documents')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as CompanyDocument
  },

  /**
   * Soft delete. The stored object is deliberately left in place: the access
   * log and the version history still reference it, and an org_admin may need
   * to restore the record.
   */
  delete: async (id: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('company_documents')
      .update({ deleted_at: new Date().toISOString(), updated_by: userId })
      .eq('id', id)

    if (error) throw error
  },

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  /**
   * Uploads a file into the tenant's company-documents folder.
   *
   * The object key is a generated UUID under `{tenantId}/company-documents/`,
   * which satisfies the tenant-path storage policy from migration 029 and makes
   * path traversal through a crafted file name impossible.
   */
  uploadFile: async (
    tenantId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{
    storage_path: string
    file_name: string
    file_type: string
    file_size_bytes: number
    file_checksum: string | null
  }> => {
    const { extension } = validateCompanyDocumentFile(file)

    onProgress?.(10)
    const checksum = await sha256Hex(file)
    onProgress?.(25)

    const storagePath = buildStoragePath(tenantId, extension)

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      // Never overwrite: the key is unique, so a collision means something is
      // wrong and should fail loudly.
      upsert: false,
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'private, max-age=0, no-store',
    })

    if (error) {
      const message = error.message?.toLowerCase() ?? ''
      if (message.includes('bucket not found') || message.includes('404')) {
        throw new CompanyDocumentStorageError(
          `Storage bucket "${BUCKET}" not found. Create it in the Supabase dashboard (Storage > Create Bucket, name "${BUCKET}", public OFF).`
        )
      }
      if (message.includes('row-level security') || message.includes('unauthorized')) {
        throw new CompanyDocumentStorageError(
          'You do not have permission to upload to this tenant\'s storage folder.'
        )
      }
      throw new CompanyDocumentStorageError(error.message)
    }

    onProgress?.(100)

    return {
      storage_path: storagePath,
      file_name: sanitizeFileName(file.name),
      file_type: file.type || 'application/octet-stream',
      file_size_bytes: file.size,
      file_checksum: checksum,
    }
  },

  // -------------------------------------------------------------------------
  // Access: viewing and downloading
  // -------------------------------------------------------------------------

  /**
   * Short-lived signed URL for in-app viewing. Issued for any document the
   * caller can read, including view-only ones, and recorded in the access log.
   */
  getViewUrl: async (
    doc: Pick<CompanyDocument, 'id' | 'tenant_id' | 'storage_path'>,
    ttlSeconds: number = DEFAULT_SIGNED_URL_TTL
  ): Promise<string> => {
    if (!doc.storage_path) {
      throw new CompanyDocumentStorageError('This document has no stored file.')
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, Math.max(30, Math.min(ttlSeconds, 3600)))

    if (error) throw new CompanyDocumentStorageError(error.message)

    void companyDocumentsApi.logAccess(doc.id, doc.tenant_id, 'view')
    return data.signedUrl
  },

  /**
   * Signed URL with a forced `Content-Disposition: attachment`, issued only
   * when the document permits downloading and the tenant has not disabled
   * downloads outright. Blocked attempts are logged, not silently ignored.
   */
  getDownloadUrl: async (
    doc: Pick<
      CompanyDocument,
      'id' | 'tenant_id' | 'storage_path' | 'file_name' | 'allow_download'
    >,
    options: { blockedByTenantPolicy?: boolean; ttlSeconds?: number } = {}
  ): Promise<string> => {
    if (!doc.storage_path) {
      throw new CompanyDocumentStorageError('This document has no stored file.')
    }

    if (!doc.allow_download) {
      void companyDocumentsApi.logAccess(doc.id, doc.tenant_id, 'download_blocked')
      throw new DownloadNotPermittedError()
    }

    if (options.blockedByTenantPolicy) {
      void companyDocumentsApi.logAccess(doc.id, doc.tenant_id, 'download_blocked')
      throw new DownloadNotPermittedError(
        'Your organisation has disabled document downloads. View the document in the app instead.'
      )
    }

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(
      doc.storage_path,
      Math.max(30, Math.min(options.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL, 3600)),
      { download: doc.file_name ?? true }
    )

    if (error) throw new CompanyDocumentStorageError(error.message)

    void companyDocumentsApi.logAccess(doc.id, doc.tenant_id, 'download')
    return data.signedUrl
  },

  /**
   * Appends an access-log row. Never throws: a failed audit write must not
   * stop a user from reading a protocol they are entitled to read.
   */
  logAccess: async (
    companyDocumentId: string,
    tenantId: string,
    action: CompanyDocumentAccessAction
  ): Promise<void> => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      await supabase.from('company_document_access_log').insert({
        company_document_id: companyDocumentId,
        tenant_id: tenantId,
        user_id: auth.user.id,
        action,
        user_agent: (navigator.userAgent || '').slice(0, 400),
      })
    } catch (err) {
      console.warn('[companyDocumentsApi.logAccess] failed:', err)
    }
  },

  /** Access history for one document. RLS limits non-admins to their own rows. */
  getAccessLog: async (
    companyDocumentId: string,
    limit = 100
  ): Promise<CompanyDocumentAccessLogEntry[]> => {
    const { data, error } = await supabase
      .from('company_document_access_log')
      .select('*')
      .eq('company_document_id', companyDocumentId)
      .order('accessed_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const entries = (data ?? []) as CompanyDocumentAccessLogEntry[]
    const profiles = await loadProfiles(entries.map(e => e.user_id))
    return entries.map(e => ({ ...e, user: profiles.get(e.user_id) ?? null }))
  },

  // -------------------------------------------------------------------------
  // Version history
  // -------------------------------------------------------------------------

  /**
   * Prior file versions. Rows are written automatically by the
   * `company_documents_archive_previous_file` trigger when a file is replaced.
   */
  getVersions: async (companyDocumentId: string): Promise<CompanyDocumentVersion[]> => {
    const { data, error } = await supabase
      .from('company_document_versions')
      .select('*')
      .eq('company_document_id', companyDocumentId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const versions = (data ?? []) as CompanyDocumentVersion[]
    const profiles = await loadProfiles(
      versions.map(v => v.created_by).filter((v): v is string => !!v)
    )
    return versions.map(v => ({
      ...v,
      creator: v.created_by ? profiles.get(v.created_by) ?? null : null,
    }))
  },

  // -------------------------------------------------------------------------
  // Acknowledgements
  // -------------------------------------------------------------------------

  getAcknowledgements: async (
    companyDocumentId: string
  ): Promise<CompanyDocumentAcknowledgement[]> => {
    const { data, error } = await supabase
      .from('company_document_acknowledgements')
      .select('*')
      .eq('company_document_id', companyDocumentId)
      .order('acknowledged_at', { ascending: false })

    if (error) throw error

    const acks = (data ?? []) as CompanyDocumentAcknowledgement[]
    const profiles = await loadProfiles(acks.map(a => a.user_id))
    return acks.map(a => ({ ...a, user: profiles.get(a.user_id) ?? null }))
  },

  /** Records that the current user has read this version of the document. */
  acknowledge: async (
    companyDocumentId: string,
    tenantId: string,
    version: string
  ): Promise<void> => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You must be signed in to acknowledge a document.')

    const { error } = await supabase.from('company_document_acknowledgements').upsert(
      {
        company_document_id: companyDocumentId,
        tenant_id: tenantId,
        user_id: auth.user.id,
        version,
      },
      { onConflict: 'company_document_id,user_id,version', ignoreDuplicates: true }
    )

    if (error) throw error

    void companyDocumentsApi.logAccess(companyDocumentId, tenantId, 'acknowledge')
  },
}
