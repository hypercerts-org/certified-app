/**
 * Labeller display constants and filter vocabulary.
 *
 * The actual label data now arrives **inline on every record**
 * via the Magic Indexer (`indexer.ts`). The previous `fetchLabels`
 * function paginated the entire history of the
 * `hyperlabel-production.up.railway.app` queryLabels endpoint
 * client-side, built an in-memory `Map<uri, LabelValue>`, and
 * joined it with the indexer response in JavaScript. That whole
 * dance is gone — Magic Indexer ingests labels itself, exposes
 * them as filter args on the records query, and returns them as
 * a `labels: [String!]!` field on every node.
 *
 * What remains here is purely UI vocabulary: the four known
 * label values, the display strings, and the default filter
 * selection. This file is now constants-only and has no network
 * dependencies.
 *
 * If you need to fall back to the old client-side fetchLabels
 * path (e.g. while pointing at the upstream Hyperindex instance
 * that doesn't expose inline labels), see the git history of
 * this file before commit a4cd... and revert.
 */

export type LabelValue = "high-quality" | "standard" | "draft" | "likely-test"

export type FilterValue = LabelValue | "unlabelled"

export const LABEL_DISPLAY: Record<LabelValue, string> = {
  "high-quality": "High Quality",
  standard: "Standard",
  draft: "Draft",
  "likely-test": "Likely Test",
}

export const DEFAULT_SELECTED_FILTERS: FilterValue[] = ["standard", "high-quality", "unlabelled"]

export const ALL_LABELS: LabelValue[] = ["high-quality", "standard", "draft", "likely-test"]

/**
 * Pick the first known LabelValue from a list of label strings
 * (as returned by the indexer's `labels` field on a record). If
 * the record has no labels or no recognised labels, returns
 * undefined — the UI treats that as "unlabelled".
 */
export function pickKnownLabel(labels: readonly string[] | undefined): LabelValue | undefined {
  if (!labels) return undefined
  for (const l of labels) {
    if ((ALL_LABELS as readonly string[]).includes(l)) {
      return l as LabelValue
    }
  }
  return undefined
}
