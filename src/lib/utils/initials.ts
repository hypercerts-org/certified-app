/**
 * Returns display initials for a user.
 *
 * - If displayName has 2+ words → first letter of first two words.
 * - If displayName has 1 word → first 2 characters.
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
  const trimmed = displayName?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`;
    }
    return trimmed.slice(0, 2);
  }

  const h = handle?.trim().replace(/^@/, "");
  if (h && !h.startsWith("did:")) {
    return h.slice(0, 2);
  }

  return "?";
}
