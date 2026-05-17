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

export type OrgTypePreset = (typeof ORG_TYPE_PRESETS)[number]
