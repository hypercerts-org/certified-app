/**
 * Subtab definitions for the activity (cert) and project detail pages,
 * shared by the desktop top-bar strip (`desktop-top-bar.tsx`) and the
 * detail components' content transition (`TabPanelTransition`). Single
 * source of truth for the left-to-right tab order, which drives both the
 * strip and the direction of the desktop tab-switch slide.
 *
 * Plain `key` entries map to `?tab=<key>` on the current pathname;
 * `subRoute` entries link to a child route (`<pathname>/<subRoute>`) — used
 * by `Explore`, which has its own page. `overview` is the implicit default
 * (no `?tab=`).
 */
export type DetailTab = { key: string; label: string; subRoute?: string }

export const CERT_DETAIL_TABS: DetailTab[] = [
  { key: "overview", label: "Overview" },
  { key: "description", label: "Description" },
  { key: "contributors", label: "Contributors" },
  { key: "contributor-board", label: "Contributor Board" },
  { key: "funding", label: "Funding" },
  { key: "updates", label: "Updates" },
]

export const PROJECT_DETAIL_TABS: DetailTab[] = [
  { key: "overview", label: "Overview" },
  { key: "description", label: "Description" },
  { key: "activities", label: "Activities" },
  { key: "updates", label: "Updates" },
]
