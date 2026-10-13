/**
 * Clipboard helpers for secret values.
 *
 * Copying a credential leaves it in the OS clipboard indefinitely, where any
 * other application (or the next paste into the wrong window) can read it.
 * `copySecret` schedules a clear so the exposure window is bounded.
 */

/** How long a copied secret stays on the clipboard before being cleared. */
export const SECRET_CLIPBOARD_TTL_MS = 45_000

let pendingClear: ReturnType<typeof setTimeout> | null = null
let lastCopiedSecret: string | null = null

/**
 * Copies a value to the clipboard. Returns true on success.
 *
 * Falls back to a hidden textarea plus `document.execCommand('copy')` where the
 * async Clipboard API is unavailable (older Safari, or any non-secure origin).
 */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/**
 * Copies a secret and clears the clipboard after `ttlMs`.
 *
 * The clear only happens if the clipboard still holds the value we wrote, so a
 * later copy by the user is never wiped out from under them. Browsers only
 * allow a clipboard read in a secure context with permission, so when the
 * read is refused we overwrite with an empty string instead, which is just as
 * effective at removing the secret.
 */
export async function copySecret(
  value: string,
  ttlMs: number = SECRET_CLIPBOARD_TTL_MS
): Promise<boolean> {
  const copied = await copyToClipboard(value)
  if (!copied) return false

  lastCopiedSecret = value

  if (pendingClear) clearTimeout(pendingClear)
  pendingClear = setTimeout(() => {
    void clearSecretFromClipboard()
  }, ttlMs)

  return true
}

/** Clears the clipboard if it still holds the last secret we wrote. */
export async function clearSecretFromClipboard(): Promise<void> {
  const secret = lastCopiedSecret
  lastCopiedSecret = null
  pendingClear = null
  if (!secret) return

  try {
    if (navigator.clipboard?.readText) {
      const current = await navigator.clipboard.readText()
      // The user has copied something else since; leave it alone.
      if (current !== secret) return
    }
  } catch {
    // Read refused. Overwrite anyway: removing the secret matters more than
    // preserving whatever the user may have copied in the meantime.
  }

  await copyToClipboard('')
}

/** Human-readable TTL for the toast message. */
export function secretClipboardTtlSeconds(ttlMs = SECRET_CLIPBOARD_TTL_MS): number {
  return Math.round(ttlMs / 1000)
}
