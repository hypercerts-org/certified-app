const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Returns the input URL unchanged if it parses as an absolute URL with an
 * allowlisted scheme (http, https, mailto, tel). Returns null otherwise —
 * e.g. for `javascript:`, `data:`, `vbscript:`, relative URLs, or malformed
 * input.
 *
 * Use before rendering user-controlled URLs as anchor `href` attributes,
 * since `href="javascript:..."` executes JavaScript when clicked.
 */
export function safeExternalUrl(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
