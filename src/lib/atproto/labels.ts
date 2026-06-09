/**
 * Hypercerts ecosystem labelers — DIDs + value sets.
 *
 * Two labelers score record quality (see issue #145 and
 * https://docs.hypercerts.org/tools/labelers):
 *
 *   - **Activity Labeler** (`activitylabeler.certified.one`) on every
 *     `org.hypercerts.claim.activity` (cert):
 *     `high-quality`, `standard`, `draft`, `likely-test`
 *   - **Orglabeler** (`orglabeler.certified.one`) on every
 *     `app.certified.actor.organization`:
 *     `high-quality`, `standard`, `likely-test`
 *
 * Label values are **kebab-case** (pinned by a regression test in the
 * indexer). The glyph-prefixed strings the docs site historically
 * showed (`✦ High Quality`, …) are NOT what the services emit — never
 * filter with them, they match nothing.
 *
 * The app reads these labels **from the magic-indexer**, never by
 * talking to the labelers directly: every record node carries a
 * `labels` field, and the records connection accepts `labels` /
 * `excludeLabels` filter args. Because the indexer only ingests the two
 * labelers below, the optional `labelerDids` trust-set arg is omitted
 * (omitted = labels from any ingested labeler match), so the DIDs here
 * are documentation of the canonical trust set, not query inputs.
 *
 * Default UX policy: the feed and explore page hide records explicitly
 * labeled `draft` / `likely-test`. Records with no label fall through
 * unfiltered — important during the ingestion-warmup window before the
 * labelers have caught up with backfill. A filter toggle on each
 * surface lets the viewer include the hidden tiers.
 */

/**
 * Canonical labeler DIDs ingested by the magic-indexer. Documentation
 * only — the app doesn't query the labelers directly, and it doesn't
 * scope by `labelerDids` (omitted = any ingested labeler). The retired
 * "Hyperlabel" service that the Activity Labeler replaced is no longer
 * ingested — don't reintroduce its DIDs.
 */
export const ACTIVITY_LABELER_DID = "did:plc:antf7bsm6f4ohkqfdckefyt7"
export const ORGLABELER_DID = "did:plc:pswneepkd5lesumj7ejmkbal"

/** Cert quality tiers, lowest to highest. Emitted by the Activity Labeler. */
export const HYPERLABEL_TIERS = ["likely-test", "draft", "standard", "high-quality"] as const
export type HyperlabelTier = (typeof HYPERLABEL_TIERS)[number]

/** Display order (best → worst) used by every cert-quality popover /
 *  filter chip across the app. Opposite of HYPERLABEL_TIERS which is
 *  sorted worst → best for indexer-side tier comparisons. */
export const HYPERLABEL_DISPLAY_ORDER: readonly HyperlabelTier[] = [
  "high-quality",
  "standard",
  "draft",
  "likely-test",
]

/** Human-readable label per tier — shared by the home-feed filter
 *  popover and the /explore Cert quality popover. */
export const HYPERLABEL_DISPLAY_LABELS: Record<HyperlabelTier, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  draft: "Draft",
  "likely-test": "Likely test",
}

/** Org quality tiers, lowest to highest. Emitted by the Orglabeler.
 *  Kebab-case (the exact strings the indexer stores) — no glyphs. */
export const ORGLABEL_TIERS = ["likely-test", "standard", "high-quality"] as const
export type OrglabelTier = (typeof ORGLABEL_TIERS)[number]

/**
 * Labels excluded by default from the feed + explore certs surfaces.
 * Records with one of these label values are dropped unless the
 * viewer explicitly opts in via the "include drafts and test data"
 * toggle. Records with NO label (e.g. unlabeled-yet) are NOT
 * excluded — they pass through until a labeler weighs in.
 */
export const DEFAULT_HIDDEN_CERT_LABELS: readonly string[] = ["draft", "likely-test"]

/** Same idea for org records. */
export const DEFAULT_HIDDEN_ORG_LABELS: readonly string[] = ["likely-test"]
