/**
 * Returns display initials for a user.
 *
 * - If displayName has 2+ words → first letter of first two words.
 * - If displayName has 1 word → first 2 characters.
 * - If displayName is absent or whitespace-only → did?.slice(4, 6) ?? "?".
 */
export function getInitials(
  displayName?: string | null,
  did?: string | null
): string {
  const trimmed = displayName?.trim();
  if (!trimmed) {
    return did?.slice(4, 6) || "?";
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  return trimmed.slice(0, 2);
}
