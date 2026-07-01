/**
 * Returns the URL string if it parses to http: or https:; otherwise null.
 *
 * Use for rendering ANY user-controlled URL into an `href`. `new URL()`
 * happily accepts `javascript:alert(1)` — without an explicit protocol
 * check, a group admin or anyone who can write a profile record on a
 * federated PDS can plant XSS via the website field. This function
 * makes the safe path obvious: never render `<a href={url}>`, always
 * `<a href={safeHttpUrl(url) ?? "#"}>`.
 */
export function safeHttpUrl(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
