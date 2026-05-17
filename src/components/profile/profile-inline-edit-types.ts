import type { OrgUrlItem } from "@/lib/groups/types"

/**
 * Shared type for the inline-edit drafts the profile page owns and the
 * sidebar / overview render. Kept in its own module to avoid a cycle
 * between the page (which imports the sidebar and overview) and the
 * sidebar / overview (which need this type to type their props).
 *
 * Org-only fields (everything after `website`) are populated only when
 * the page detects the `app.certified.actor.organization` marker. The
 * sidebar / overview gate their edit-mode UI on `isOrg` and skip these
 * fields when the marker is absent.
 */
export interface ProfileDrafts {
  displayName: string
  description: string
  website: string
  // Org-only fields. All strings here are stored verbatim — the save
  // handler is responsible for trimming and dropping empty values.

  // Location is decomposed into a free-text name plus optional
  // coordinates. The picker UI lets the user set either or both; the
  // save handler picks the right serialised shape (object when coords
  // are present, plain string otherwise).
  locationName: string
  locationLat: number | null
  locationLng: number | null

  /** ISO date string (yyyy-mm-dd) or year-only (yyyy). The handler
   *  normalises to a full ISO datetime before writing. */
  foundedDate: string
  /** Selected preset org types. Free-form text typed alongside the
   *  "Other" chip lives in `organizationTypeOther`; the save handler
   *  concatenates them into the persisted `string[]`. */
  organizationTypes: string[]
  /** Free-text value associated with the "Other" chip. */
  organizationTypeOther: string
  /** Long-form, multi-line description. Separate from the short
   *  `description` field above which mirrors the profile bio. */
  longDescription: string
  /** Editable URL list with stable per-row ids so React keys are
   *  stable across renders. New rows start with empty `url`/`label`. */
  additionalUrls: DraftUrlRow[]
}

export interface DraftUrlRow {
  /** Stable per-session id. Not persisted to the record. */
  id: string
  url: string
  label: string
}

let urlRowSeq = 0
export function newDraftUrlRow(init?: Partial<OrgUrlItem>): DraftUrlRow {
  return {
    id: `org-url-${++urlRowSeq}`,
    url: init?.url ?? "",
    label: init?.label ?? "",
  }
}
