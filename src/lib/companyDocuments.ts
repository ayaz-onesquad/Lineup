/**
 * Constants and validation rules for the Company Documents library.
 *
 * Upload validation lives here rather than in the UI so the same rules apply
 * to the create form, the detail-page replace action, and any future bulk
 * import path.
 */

import type {
  CompanyDocumentType,
  CompanyDocumentStatus,
  CompanyDocumentConfidentiality,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Option lists (all rendered through SearchableSelect per CLAUDE.md)
// ---------------------------------------------------------------------------

export const COMPANY_DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: CompanyDocumentType
  label: string
  description: string
}> = [
  { value: 'sop', label: 'SOP', description: 'Standard Operating Procedure' },
  { value: 'protocol', label: 'Protocol', description: 'Formal protocol to follow' },
  { value: 'processing_guide', label: 'Processing Guide', description: 'Step-by-step processing instructions' },
  { value: 'policy', label: 'Policy', description: 'Company policy document' },
  { value: 'procedure', label: 'Procedure', description: 'Operational procedure' },
  { value: 'form', label: 'Form', description: 'Fillable or printable form' },
  { value: 'template', label: 'Template', description: 'Reusable document template' },
  { value: 'checklist', label: 'Checklist', description: 'Verification checklist' },
  { value: 'contract', label: 'Contract', description: 'Agreement or contract' },
  { value: 'certificate', label: 'Certificate', description: 'Licence, insurance or certification' },
  { value: 'training', label: 'Training Material', description: 'Onboarding or training content' },
  { value: 'other', label: 'Other', description: 'Anything not covered above' },
]

export const COMPANY_DOCUMENT_STATUS_OPTIONS: ReadonlyArray<{
  value: CompanyDocumentStatus
  label: string
  description: string
}> = [
  { value: 'draft', label: 'Draft', description: 'Being written, not yet in use' },
  { value: 'in_review', label: 'In Review', description: 'Awaiting approval' },
  { value: 'active', label: 'Active', description: 'Current and in force' },
  { value: 'archived', label: 'Archived', description: 'No longer in use' },
  { value: 'superseded', label: 'Superseded', description: 'Replaced by a newer document' },
]

export const COMPANY_DOCUMENT_CONFIDENTIALITY_OPTIONS: ReadonlyArray<{
  value: CompanyDocumentConfidentiality
  label: string
  description: string
}> = [
  { value: 'public', label: 'Public', description: 'Shareable outside the company' },
  { value: 'internal', label: 'Internal', description: 'Any team member may read it' },
  { value: 'restricted', label: 'Restricted', description: 'Admins and the owner only' },
  { value: 'confidential', label: 'Confidential', description: 'Admins and the owner only, highest handling care' },
]

export const COMPANY_DOCUMENT_CATEGORY_OPTIONS: ReadonlyArray<{
  value: string
  label: string
}> = [
  { value: 'Operations', label: 'Operations' },
  { value: 'Finance', label: 'Finance' },
  { value: 'HR & People', label: 'HR & People' },
  { value: 'Legal & Compliance', label: 'Legal & Compliance' },
  { value: 'Client Delivery', label: 'Client Delivery' },
  { value: 'Sales & Marketing', label: 'Sales & Marketing' },
  { value: 'IT & Security', label: 'IT & Security' },
  { value: 'Quality', label: 'Quality' },
  { value: 'Health & Safety', label: 'Health & Safety' },
  { value: 'Onboarding', label: 'Onboarding' },
  { value: 'Other', label: 'Other' },
]

// ---------------------------------------------------------------------------
// Badge styling for the data grid
// ---------------------------------------------------------------------------

export const COMPANY_DOCUMENT_STATUS_STYLES: Record<CompanyDocumentStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  archived: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  superseded: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
}

export const COMPANY_DOCUMENT_CONFIDENTIALITY_STYLES: Record<
  CompanyDocumentConfidentiality,
  string
> = {
  public: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  internal: 'bg-muted text-muted-foreground border-border',
  restricted: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  confidential: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
}

export function companyDocumentTypeLabel(type: CompanyDocumentType): string {
  return COMPANY_DOCUMENT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type
}

export function companyDocumentStatusLabel(status: CompanyDocumentStatus): string {
  return COMPANY_DOCUMENT_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/** 50 MB. Large enough for scanned SOP binders, small enough to stay usable. */
export const MAX_COMPANY_DOCUMENT_BYTES = 50 * 1024 * 1024

/**
 * Allowlist of accepted MIME types, mapped to the extension we store.
 *
 * Deliberately excluded:
 *   - image/svg+xml  SVG is an XSS vector when served inline.
 *   - text/html      same reason.
 *   - archives       contents cannot be inspected or previewed.
 */
export const ALLOWED_COMPANY_DOCUMENT_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/rtf': 'rtf',
}

/** `accept` attribute for the file input, derived from the allowlist. */
export const COMPANY_DOCUMENT_ACCEPT = Object.keys(ALLOWED_COMPANY_DOCUMENT_TYPES).join(',')

/** Extensions the in-app viewer can render without any download. */
export const INLINE_VIEWABLE_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'txt',
  'md',
  'csv',
]

export class CompanyDocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanyDocumentValidationError'
  }
}

/**
 * Validates a file before it is uploaded. Throws a
 * CompanyDocumentValidationError whose message is safe to show the user.
 *
 * Note: `file.type` is browser-reported and therefore not trustworthy on its
 * own. The extension is checked against the same allowlist so a renamed
 * executable cannot slip through on a spoofed MIME type alone.
 */
export function validateCompanyDocumentFile(file: File): { extension: string } {
  if (file.size === 0) {
    throw new CompanyDocumentValidationError('That file is empty.')
  }

  if (file.size > MAX_COMPANY_DOCUMENT_BYTES) {
    const limitMb = Math.round(MAX_COMPANY_DOCUMENT_BYTES / (1024 * 1024))
    throw new CompanyDocumentValidationError(
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${limitMb} MB.`
    )
  }

  const mimeExtension = ALLOWED_COMPANY_DOCUMENT_TYPES[file.type]
  const nameExtension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const allowedExtensions = new Set(Object.values(ALLOWED_COMPANY_DOCUMENT_TYPES))

  if (!mimeExtension && !allowedExtensions.has(nameExtension)) {
    throw new CompanyDocumentValidationError(
      `"${file.name}" is not an accepted file type. Allowed: PDF, Word, Excel, PowerPoint, images, text and CSV.`
    )
  }

  // Where both signals are present they must agree, so a .exe renamed to .pdf
  // (or a PDF MIME type claimed for a .exe) is rejected.
  if (mimeExtension && allowedExtensions.has(nameExtension) && mimeExtension !== nameExtension) {
    const benign =
      (mimeExtension === 'jpg' && nameExtension === 'jpeg') ||
      (mimeExtension === 'md' && nameExtension === 'markdown')
    if (!benign) {
      throw new CompanyDocumentValidationError(
        `"${file.name}" does not match its file type. Rename it with the correct extension and try again.`
      )
    }
  }

  return { extension: mimeExtension ?? nameExtension }
}

/**
 * Strips anything that could escape the tenant folder or confuse the storage
 * layer, and caps the length. This guards the stored display name only: the
 * actual object key is a generated UUID, so traversal is impossible by design.
 */
export function sanitizeFileName(name: string): string {
  return name
    .split(/[/\\]/)
    .pop()!                           // drop any directory component
    .replace(/[^\w .()[\]+&,'-]/g, '_') // allowlist of safe display characters
    .replace(/\.{2,}/g, '.')          // collapse traversal sequences
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255)
}

/** Returns the lowercase extension of a stored file name, without the dot. */
export function fileExtension(fileName: string | null | undefined): string {
  if (!fileName) return ''
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

/** True when the in-app viewer can render this file with no download. */
export function isInlineViewable(
  fileName: string | null | undefined,
  fileType: string | null | undefined
): boolean {
  if (fileType === 'application/pdf') return true
  if (fileType?.startsWith('image/') && fileType !== 'image/svg+xml') return true
  if (fileType?.startsWith('text/') && fileType !== 'text/html') return true
  return INLINE_VIEWABLE_EXTENSIONS.includes(fileExtension(fileName))
}
