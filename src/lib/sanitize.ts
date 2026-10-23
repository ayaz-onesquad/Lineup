/**
 * HTML sanitization for rich text.
 *
 * Rich text written in the Tiptap editor is stored as raw HTML and rendered
 * through `dangerouslySetInnerHTML`. Because those columns are writable
 * directly over the PostgREST API, the stored HTML must be treated as
 * untrusted input, not as something the editor guarantees is safe. Every render
 * path goes through `sanitizeRichText` so a crafted payload cannot execute in
 * another user's browser (and read their auth token out of localStorage).
 */

import DOMPurify from 'dompurify'

/**
 * Tags Tiptap can produce, plus the table and figure markup used by the
 * editor's extensions. Anything else is stripped.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'mark',
  'sub',
  'sup',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
]

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'title',
  'colspan',
  'rowspan',
  'start',
  'type',
  'class',
  'data-type',
  'data-checked',
]

/**
 * Hook: force every surviving link to be safe to click.
 * Registered once at module load.
 */
let hooksInstalled = false

function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true

  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (!(node instanceof Element)) return
    if (node.tagName !== 'A') return

    // Links always open in a new tab without handing the opener window over.
    if (node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

/**
 * Sanitizes stored rich-text HTML for rendering.
 *
 * `javascript:`, `data:` and `vbscript:` URLs, every `on*` handler, and all
 * script, style, iframe, object, embed, form and svg content are removed by the
 * allowlist above combined with DOMPurify's URI policy.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return ''
  installHooks()

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only http(s) and mailto/tel links survive.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    // Belt and braces: these are already excluded by ALLOWED_TAGS.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'onerror', 'onload'],
    // Reject `<a name>`/`id` clobbering of DOM properties.
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
  })
}

/**
 * Strips all markup, for places that need a plain-text preview of rich text
 * (grid cells, notification bodies, search snippets).
 */
export function richTextToPlainText(
  html: string | null | undefined,
  maxLength = 200
): string {
  if (!html) return ''
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  const text = clean.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

/** Markup the rich-text fields produce; its presence means a value is already HTML. */
const RICH_TEXT_TAG = /<\/?(?:p|br|strong|b|em|i|u|s|ul|ol|li|h[1-6]|blockquote|pre|code|a|span|div)\b[^>]*>/i

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Turns a stored value into HTML for the rich-text editor and viewer. A field that
 * used to be plain text (no tags) reads as one paragraph per line, escaped; a
 * value that already has markup is returned as is (render it through
 * `sanitizeRichText`, which RichTextView does).
 */
export function toRichTextHtml(value: string | null | undefined): string {
  if (!value) return ''
  if (RICH_TEXT_TAG.test(value)) return value
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

/** True when rich text has no visible text (an empty editor gives `<p></p>`). */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  return richTextToPlainText(html, Number.MAX_SAFE_INTEGER) === ''
}
