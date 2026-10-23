// Rich text helpers for website-lead-intake. Dependency-free on purpose: this runs on every
// public website request, and the rules are small enough to read in one sitting.
//
// sanitizeMessageHtml() keeps only p, br, strong, b, em, i, u, ul, ol, li, with no attributes.
// Its output is built from scratch: tags this module writes itself, and text it escapes itself.
// Nothing from the input is copied through as markup, so no input can produce a tag or an
// attribute outside the allowlist, however it is malformed.

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li'])

/** Elements whose content is code or chrome, never message text: dropped with their content. */
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|title|head|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decodes the entities a browser editor emits (named basics and numeric). Others stay as text. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ''
      return String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanitizes rich text from the website form. Keeps p, br, strong, b, em, i, u, ul, ol, li with
 * no attributes; every other tag is removed (its text kept), comments and script-like elements
 * are removed with their content, text is re-escaped, and open tags are closed. Stops adding
 * text once `maxTextLength` visible characters are in. Returns '' when no text is left.
 */
export function sanitizeMessageHtml(input: string, maxTextLength = 2000): string {
  if (!input) return ''
  const source = input
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(DROP_WITH_CONTENT, '')

  const out: string[] = []
  const open: string[] = []
  let textLength = 0
  let full = false

  const pushText = (raw: string) => {
    if (full || !raw) return
    let text = decodeEntities(raw)
    if (textLength + text.length > maxTextLength) {
      text = text.slice(0, Math.max(0, maxTextLength - textLength))
      full = true
    }
    textLength += text.length
    if (text) out.push(escapeHtml(text))
  }

  // A tag: `<name ...>`, `</name>`, `<name/>` or `<name/attr>`. Any other `<` is text.
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:[\s/][^<>]*)?>/g
  let last = 0
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    pushText(source.slice(last, m.index))
    last = tag.lastIndex
    if (full) break

    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    if (!ALLOWED.has(name)) continue

    if (name === 'br') {
      if (!closing) out.push('<br>')
      continue
    }
    if (!closing) {
      // A list item only makes sense in a list; elsewhere it becomes a paragraph
      const effective = name === 'li' && !open.some((t) => t === 'ul' || t === 'ol') ? 'p' : name
      out.push(`<${effective}>`)
      open.push(effective)
    } else {
      const at = open.lastIndexOf(name)
      if (at === -1) continue // stray closing tag
      while (open.length > at) out.push(`</${open.pop()}>`)
    }
  }
  if (!full) pushText(source.slice(last))
  while (open.length) out.push(`</${open.pop()}>`)

  const html = out.join('')
  return htmlToPlainText(html) ? html : ''
}

/**
 * Plain text from sanitized rich text, for emails and plain-text fields: a line per paragraph,
 * line break or list item ("- " before each item), tags removed, entities decoded.
 */
export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<\/(ul|ol)\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim()
}

/** Plain text as rich text: one escaped paragraph per non-empty line. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

/** One `<p><strong>Label:</strong> value</p>` line, both escaped. */
export function labeledLine(label: string, value: string): string {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
}
