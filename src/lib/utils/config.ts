const DEV_FALLBACK = "http://localhost:3000"

export const DEFAULT_PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://certified.one"

export interface AppUrlEnvironment {
  PUBLIC_URL?: string
  VERCEL_BRANCH_URL?: string
  VERCEL_URL?: string
  NODE_ENV?: string
}

export interface AppUrlConfig {
  canonicalUrl: string | undefined
  allowedRequestOrigins: ReadonlySet<string>
}

/**
 * Resolves the canonical OAuth URL and the exact origins trusted for browser
 * mutations. PUBLIC_URL remains authoritative; Vercel's stable branch URL and
 * then its commit-specific deployment URL are fallbacks.
 */
export function resolveAppUrlConfig(env: AppUrlEnvironment): AppUrlConfig {
  const publicUrl = normalizePublicOrigin(env.PUBLIC_URL)
  const branchUrl = normalizeVercelOrigin(env.VERCEL_BRANCH_URL, "VERCEL_BRANCH_URL")
  const deploymentUrl = normalizeVercelOrigin(env.VERCEL_URL, "VERCEL_URL")
  const configuredOrigins = [publicUrl, branchUrl, deploymentUrl].filter(
    (origin): origin is string => origin !== undefined,
  )
  const devFallback =
    configuredOrigins.length === 0 && env.NODE_ENV !== "production"
      ? DEV_FALLBACK
      : undefined

  return {
    canonicalUrl: publicUrl ?? branchUrl ?? deploymentUrl ?? devFallback,
    allowedRequestOrigins: new Set([
      ...configuredOrigins,
      ...(devFallback ? [devFallback] : []),
    ]),
  }
}

function normalizePublicOrigin(
  rawValue: string | undefined,
): string | undefined {
  const value = optionalValue(rawValue)
  if (!value) return undefined

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalidPublicUrl()
  }

  const isLoopbackHttp =
    url.protocol === "http:" && isLoopbackHost(url.hostname)

  if (
    (url.protocol !== "https:" && !isLoopbackHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw invalidPublicUrl()
  }

  return url.origin
}

function normalizeVercelOrigin(
  rawValue: string | undefined,
  variableName: "VERCEL_BRANCH_URL" | "VERCEL_URL",
): string | undefined {
  const value = optionalValue(rawValue)
  if (!value) return undefined

  if (/[/:\\@?#]/.test(value)) {
    throw invalidVercelUrl(variableName)
  }

  let url: URL
  try {
    url = new URL(`https://${value}`)
  } catch {
    throw invalidVercelUrl(variableName)
  }

  if (
    !url.hostname.endsWith(".vercel.app") ||
    url.hostname === "vercel.app" ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw invalidVercelUrl(variableName)
  }

  return url.origin
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

/** Returns whether a URL hostname identifies a supported loopback address. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

function invalidPublicUrl(): Error {
  return new Error(
    "PUBLIC_URL must be an origin such as https://certified.app, without credentials, a path, query, or fragment. HTTP is allowed only for a loopback host; production OAuth still requires HTTPS.",
  )
}

function invalidVercelUrl(variableName: "VERCEL_BRANCH_URL" | "VERCEL_URL"): Error {
  return new Error(
    `${variableName} must be a hostname-only generated Vercel domain ending in .vercel.app, without a scheme, port, path, query, fragment, or credentials.`,
  )
}

const APP_URL_CONFIG = resolveAppUrlConfig(process.env)

/** The canonical URL used to construct OAuth metadata and callbacks. */
export const PUBLIC_URL_STRICT: string | undefined = APP_URL_CONFIG.canonicalUrl

/**
 * A guaranteed URL for legacy non-security-sensitive callers. Production OAuth
 * and CSRF code use PUBLIC_URL_STRICT and ALLOWED_REQUEST_ORIGINS instead.
 */
export const PUBLIC_URL: string = PUBLIC_URL_STRICT ?? DEV_FALLBACK

/** Exact configured origins that may issue same-origin browser mutations. */
export const ALLOWED_REQUEST_ORIGINS: ReadonlySet<string> =
  APP_URL_CONFIG.allowedRequestOrigins
