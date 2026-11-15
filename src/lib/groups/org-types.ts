/**
 * Canonical preset values for the org marker's `organizationType`
 * field. The profile editor renders these as toggleable chips; the
 * read-side renderer uses the order here to sort tags consistently.
 *
 * Free-text values not in this list round-trip through the editor's
 * "Other" chip and are preserved verbatim on the record.
 */
export const ORG_TYPE_PRESETS = [
  "Nonprofit",
  "Business",
  "Community Group",
  "Government",
  "Indigenous Group",
] as const

/** Lower-case, words separated by single spaces: "community-group",
 *  "Community Group" and "community_group" all read "community group". */
export function normalizeOrgType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, " ")
}

/** Labels for the slugs other clients write (the lexicon's examples are
 *  slugs: "nonprofit", "ngo", "social-enterprise"), where plain sentence
 *  case would read wrong. */
const KNOWN_LABELS: Record<string, string> = {
  ngo: "NGO",
  nonprofit: "Nonprofit",
  "non profit": "Nonprofit",
  "b corp": "B Corp",
  dao: "DAO",
}

/**
 * How an organization type reads in the interface, in sentence case:
 * "nonprofit" → "Nonprofit", "community-group" → "Community group",
 * "Indigenous Group" → "Indigenous group", "ngo" → "NGO". Text someone
 * typed in another form keeps its own capitals after the first letter
 * ("Land trust (UK)" stays).
 */
export function orgTypeLabel(value: string): string {
  const normalized = normalizeOrgType(value)
  if (!normalized) return ""
  const known = KNOWN_LABELS[normalized]
  if (known) return known
  const isSlugOrPreset =
    /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(value.trim()) ||
    ORG_TYPE_PRESETS.some((p) => normalizeOrgType(p) === normalized)
  const text = isSlugOrPreset ? normalized : value.trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
