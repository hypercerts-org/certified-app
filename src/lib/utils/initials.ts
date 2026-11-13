/**
 * Returns display initials for a user.
 *
 * - If displayName has 2+ words → first letter of first two words.
 * - If displayName has 1 word → first 2 characters.
 * - Leading symbols are skipped ("@holke.xyz" → "ho", "(Ma) Earth" → "ME").
 * - Otherwise fall back to the handle's first 2 characters (a real handle,
 *   not the opaque DID — `did:plc:…` would otherwise yield a misleading
 *   "PL"). A bare DID (or nothing) → "?".
 *
 * The second argument is the handle where available; a DID passed here is
 * recognised by its `did:` prefix and ignored.
 */
export function getInitials(
  displayName?: string | null,
  handle?: string | null
): string {
  // Each word from its first letter or digit, so "@holke.xyz" (a
  // contributor written as a handle) gives "ho", not "@h".
  const parts = (displayName ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${Array.from(parts[0])[0]}${Array.from(parts[1])[0]}`;
  }
  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join("");
  }

  const h = handle?.trim().replace(/^@/, "");
  if (h && !h.startsWith("did:")) {
    return h.slice(0, 2);
  }

  return "?";
}
