/**
 * Normalize a user-entered website URL.
 *
 * Accepts URLs with or without an explicit `http(s)` scheme:
 *   - `"https://example.com/path"` → `{ ok: true, url: "https://example.com/path" }`
 *   - `"www.gainforest.earth"`     → `{ ok: true, url: "https://www.gainforest.earth" }`
 *   - `"example.org"`              → `{ ok: true, url: "https://example.org" }`
 *   - `""`                         → `{ ok: true, url: "" }`  (empty is valid — field is optional)
 *
 * Rejects anything that isn't a plain http(s) website:
 *   - non-http(s) schemes (`javascript:`, `data:`, `mailto:`, `tel:`, ...)
 *   - hostnames without a dot (e.g. `localhost`)
 *   - URLs containing userinfo (`user:pass@host`)
 *   - whitespace or otherwise un-parseable input
 *
 * The returned `url` preserves the user's original casing/path/query and only
 * adds a `https://` prefix when one was missing — so saved data always has a
 * scheme and is safe to render directly as an `href`.
 */
export function normalizeWebsiteUrl(
  input: string,
): { ok: true; url: string } | { ok: false } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, url: "" };
  if (/\s/.test(trimmed)) return { ok: false };

  const hasScheme = /^https?:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false };
  }
  if (!parsed.hostname.includes(".")) return { ok: false };
  if (parsed.username !== "" || parsed.password !== "") return { ok: false };

  return { ok: true, url: hasScheme ? trimmed : `https://${trimmed}` };
}
