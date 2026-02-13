/**
 * Security Utilities for LineUp SaaS
 * OWASP Standards Implementation
 */

// ============================================================================
// Rate Limiting (Client-Side)
// ============================================================================

interface RateLimitEntry {
  count: number
  firstRequest: number
  lastRequest: number
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  blockDurationMs?: number
}

// In-memory rate limit store (for client-side throttling)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Default rate limit configurations
export const RATE_LIMITS = {
  // Auth endpoints - strict limits
  auth: { maxRequests: 5, windowMs: 60 * 1000, blockDurationMs: 5 * 60 * 1000 }, // 5 requests per minute, 5 min block
  passwordReset: { maxRequests: 3, windowMs: 15 * 60 * 1000 }, // 3 per 15 minutes
  signup: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 per minute

  // API endpoints - moderate limits
  mutation: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 writes per minute
  query: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 reads per minute

  // Form submissions
  form: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 form submissions per minute
} as const

/**
 * Check if a request should be rate limited
 * @param key Unique identifier for the rate limit (e.g., 'auth:login', 'mutation:createProject')
 * @param config Rate limit configuration
 * @returns Object with allowed status and retry info
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfterMs?: number; remaining?: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // Clean up old entries
  if (entry && now - entry.firstRequest > config.windowMs) {
    rateLimitStore.delete(key)
  }

  const currentEntry = rateLimitStore.get(key)

  if (!currentEntry) {
    // First request in this window
    rateLimitStore.set(key, { count: 1, firstRequest: now, lastRequest: now })
    return { allowed: true, remaining: config.maxRequests - 1 }
  }

  // Check if blocked
  if (config.blockDurationMs && currentEntry.count >= config.maxRequests) {
    const blockEndsAt = currentEntry.lastRequest + config.blockDurationMs
    if (now < blockEndsAt) {
      return { allowed: false, retryAfterMs: blockEndsAt - now }
    }
    // Block expired, reset
    rateLimitStore.delete(key)
    rateLimitStore.set(key, { count: 1, firstRequest: now, lastRequest: now })
    return { allowed: true, remaining: config.maxRequests - 1 }
  }

  // Check if within limit
  if (currentEntry.count >= config.maxRequests) {
    const windowEndsAt = currentEntry.firstRequest + config.windowMs
    return { allowed: false, retryAfterMs: windowEndsAt - now }
  }

  // Increment count
  currentEntry.count++
  currentEntry.lastRequest = now
  return { allowed: true, remaining: config.maxRequests - currentEntry.count }
}

/**
 * Create a rate-limited wrapper for async functions
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  key: string,
  config: RateLimitConfig
): T {
  return (async (...args: Parameters<T>) => {
    const result = checkRateLimit(key, config)
    if (!result.allowed) {
      const seconds = Math.ceil((result.retryAfterMs || 0) / 1000)
      throw new RateLimitError(`Too many requests. Please try again in ${seconds} seconds.`, result.retryAfterMs)
    }
    return fn(...args)
  }) as T
}

export class RateLimitError extends Error {
  retryAfterMs: number

  constructor(message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs || 60000
  }
}

// ============================================================================
// Input Validation & Sanitization
// ============================================================================

/**
 * Sanitize string input to prevent XSS
 * Note: React automatically escapes, but this is for extra safety
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email)
}

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean
  score: number
  feedback: string[]
} {
  const feedback: string[] = []
  let score = 0

  if (password.length >= 8) score++
  else feedback.push('Password should be at least 8 characters')

  if (password.length >= 12) score++
  else feedback.push('Consider using 12+ characters for better security')

  if (/[a-z]/.test(password)) score++
  else feedback.push('Add lowercase letters')

  if (/[A-Z]/.test(password)) score++
  else feedback.push('Add uppercase letters')

  if (/[0-9]/.test(password)) score++
  else feedback.push('Add numbers')

  if (/[^a-zA-Z0-9]/.test(password)) score++
  else feedback.push('Add special characters')

  return {
    valid: score >= 4 && password.length >= 8,
    score,
    feedback,
  }
}

/**
 * Enforce maximum length on input
 */
export function enforceMaxLength(input: string, maxLength: number): string {
  return input.slice(0, maxLength)
}

// Input length limits (OWASP recommended)
export const INPUT_LIMITS = {
  name: 100,
  email: 254,
  description: 5000,
  comment: 2000,
  title: 200,
  url: 2048,
  phone: 20,
  password: 128,
} as const

/**
 * Strip unexpected fields from an object
 * Prevents mass assignment vulnerabilities
 */
export function pickAllowedFields<T extends Record<string, unknown>>(
  input: T,
  allowedFields: string[]
): Partial<T> {
  const result: Partial<T> = {}
  for (const field of allowedFields) {
    if (field in input) {
      result[field as keyof T] = input[field as keyof T]
    }
  }
  return result
}

// ============================================================================
// Request Debouncing
// ============================================================================

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Debounce function calls by key
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  key: string,
  delayMs: number
): T {
  return ((...args: Parameters<T>) => {
    const existingTimer = debounceTimers.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      fn(...args)
      debounceTimers.delete(key)
    }, delayMs)

    debounceTimers.set(key, timer)
  }) as T
}

// ============================================================================
// Exponential Backoff
// ============================================================================

/**
 * Calculate delay for exponential backoff
 */
export function getBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
  // Add jitter (10-20% randomness)
  const jitter = delay * (0.1 + Math.random() * 0.1)
  return Math.floor(delay + jitter)
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Don't retry on rate limit errors
      if (error instanceof RateLimitError) {
        throw error
      }

      if (attempt < maxAttempts - 1) {
        const delay = getBackoffDelay(attempt, baseDelayMs)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// ============================================================================
// Security Headers Check (for development/debugging)
// ============================================================================

/**
 * Check if running in secure context
 */
export function isSecureContext(): boolean {
  return window.isSecureContext === true
}

/**
 * Check for common security misconfigurations
 */
export function auditSecurityConfig(): {
  secure: boolean
  issues: string[]
  warnings: string[]
} {
  const issues: string[] = []
  const warnings: string[] = []

  // Check secure context
  if (!isSecureContext() && window.location.hostname !== 'localhost') {
    issues.push('Not running in secure context (HTTPS required in production)')
  }

  // Check for localStorage usage
  try {
    localStorage.setItem('__security_test', 'test')
    localStorage.removeItem('__security_test')
  } catch {
    warnings.push('localStorage not available - some features may not work')
  }

  // Check for third-party cookies disabled
  if (!navigator.cookieEnabled) {
    warnings.push('Cookies are disabled - authentication may not work')
  }

  return {
    secure: issues.length === 0,
    issues,
    warnings,
  }
}
