/**
 * A URL from a record, if it is http(s): anything else (javascript:, data:,
 * ftp:) never reaches an href. `httpsOnly` for what browsers load on their
 * own, such as images: no mixed content.
 */
export function safeUrl(value: unknown, httpsOnly = false): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || (!httpsOnly && protocol === "http:") ? value : null;
  } catch {
    return null;
  }
}
