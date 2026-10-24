/**
 * Excel export for list pages.
 *
 * Every overview grid exports through this one function so the output is
 * consistent: one header row from the column labels, one row per record in the
 * order the user is looking at (filtered and sorted), readable values.
 *
 * `xlsx` is loaded on demand. It is ~400 KB, and only someone who clicks
 * Export needs it. Only its writer is used here; it never parses untrusted
 * workbooks.
 */

export type ExportCellValue = string | number | boolean | Date | null | undefined

export interface ExportColumn<T> {
  header: string
  value: (row: T) => ExportCellValue | unknown
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/
// snake_case enum values such as `on_deck` or `past_due`. Requires an
// underscore, so ordinary words and emails are left alone.
const SNAKE_ENUM = /^[a-z]+(?:_[a-z0-9]+)+$/

/** Turns a raw field value into something a spreadsheet shows sensibly. */
export function toExportValue(raw: unknown): ExportCellValue {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw
  if (Array.isArray(raw)) {
    return raw.map(item => toExportValue(item)).filter(v => v !== null).join(', ') || null
  }
  if (typeof raw === 'object') {
    // Joined relations: prefer a human label over "[object Object]".
    const obj = raw as Record<string, unknown>
    const label = obj.name ?? obj.full_name ?? obj.title ?? obj.label
    return typeof label === 'string' ? label : null
  }
  const text = String(raw)
  if (ISO_DATE.test(text)) {
    const date = new Date(text.length === 10 ? `${text}T00:00:00` : text)
    if (!Number.isNaN(date.getTime())) return date
  }
  if (SNAKE_ENUM.test(text)) {
    return text
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }
  // Rich-text fields are stored as HTML; export the text.
  if (text.startsWith('<') && /<\/?[a-z][^>]*>/i.test(text)) {
    return text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim()
  }
  return text
}

function fileStamp() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Strips characters Windows and macOS reject in file names. */
function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'export'
}

/**
 * Builds a workbook and triggers the download. Resolves once the file has
 * been handed to the browser.
 */
export async function exportToExcel<T>(options: {
  fileName: string
  sheetName?: string
  columns: ExportColumn<T>[]
  rows: T[]
}) {
  const { fileName, sheetName = 'Export', columns, rows } = options
  const XLSX = await import('xlsx')

  const header = columns.map(c => c.header)
  const body = rows.map(row => columns.map(c => toExportValue(c.value(row))))
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body], { cellDates: true, dateNF: 'yyyy-mm-dd' })

  // Column widths from the longest value (capped), so the file opens readable.
  sheet['!cols'] = header.map((h, i) => {
    const longest = body.reduce((max, r) => {
      const v = r[i]
      const len = v instanceof Date ? 10 : v === null || v === undefined ? 0 : String(v).length
      return Math.max(max, len)
    }, h.length)
    return { wch: Math.min(Math.max(longest + 2, 8), 60) }
  })
  // Freeze the header row.
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  const book = XLSX.utils.book_new()
  // Sheet names are limited to 31 characters and a few forbidden symbols.
  XLSX.utils.book_append_sheet(book, sheet, sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  XLSX.writeFile(book, `${safeFileName(fileName)}-${fileStamp()}.xlsx`, { compression: true })
}
