/**
 * Hypercerts ecosystem labelers — DIDs + value sets.
 *
 * Two AppView-side labelers score record quality (see issue #97 and
 * https://docs.hypercerts.org/tools/labelers):
 *
 *   - **Hyperlabel** on every `org.hypercerts.claim.activity` (cert):
 *     `high-quality`, `standard`, `draft`, `likely-test`
 *   - **Orglabeler** on every `app.certified.actor.organization`:
 *     `✦ High Quality`, `● Standard`, `⚠ Likely Test`
 *     (unicode glyph prefixes are PART of the value — not rendering
 *     hints; clients filter with the exact string)
 *
 * Default UX policy: the feed and explore page hide records that are
 * explicitly labeled `draft` / `likely-test` (cert) or `⚠ Likely Test`
 * (org). Records with no label fall through unfiltered — important
 * during the ingestion-warmup window before labelers have caught up
 * with backfill. A filter toggle on each surface lets the viewer
 * include the hidden tiers.
 */

/**
 * Hyperlabel signing DIDs. The labeler service at
 * `hyperlabel-production.up.railway.app` currently signs labels with
 * the `heisenberg.climateai.org` DID, while the canonical
 * `did:plc:5rw6of6...` (aka `einstein.climateai.org`) is registered
 * at the same endpoint but dormant. The indexer must subscribe to
 * BOTH via `LABELER_DIDS`, or the actively-signed labels never get
 * ingested and `excludeLabels: ["likely-test"]` is a no-op. See
 * hypercerts-org/magic-indexer#138.
 */
export const HYPERLABEL_DIDS = [
  "did:plc:5rw6of6lry7ihmyhm323ycwn", // canonical (einstein.climateai.org) — dormant
  "did:plc:edod7rboajioq3jbyxsgeicc", // active signer (heisenberg.climateai.org)
] as const

/** Orglabeler's DID — scores org-record quality. */
export const ORGLABELER_DID = "did:plc:pswneepkd5lesumj7ejmkbal"

/** Cert quality tiers, lowest to highest. */
export const HYPERLABEL_TIERS = ["likely-test", "draft", "standard", "high-quality"] as const
export type HyperlabelTier = (typeof HYPERLABEL_TIERS)[number]

/** Org quality tiers, lowest to highest. */
export const ORGLABEL_TIERS = ["⚠ Likely Test", "● Standard", "✦ High Quality"] as const
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
export const DEFAULT_HIDDEN_ORG_LABELS: readonly string[] = ["⚠ Likely Test"]
