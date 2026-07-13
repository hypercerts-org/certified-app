"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Filter as FilterIcon } from "lucide-react"
import {
  DEFAULT_HIDDEN_CERT_LABELS,
  DEFAULT_HIDDEN_ORG_LABELS,
  HYPERLABEL_DISPLAY_LABELS,
  HYPERLABEL_DISPLAY_ORDER,
  HYPERLABEL_TIERS,
  type HyperlabelTier,
} from "@/lib/atproto/labels"
import Checkbox from "@/components/ui/checkbox"
import {
  Popover as UiPopover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import Tooltip from "@/components/ui/tooltip"

/** Sentinel slug for the "no label yet" checkbox that sits at the
 *  end of every labeler popover. Backed by an `includeLabels` /
 *  `excludeLabels` swap at the loader (see comment on
 *  `excludeCertLabels` / `includeCertLabels` below). */
const UNLABELED_SLUG = "unlabeled" as const
type UnlabeledSlug = typeof UNLABELED_SLUG

const UNLABELED_LABEL = "Not labeled yet"

/**
 * Orglabeler tier slugs used in the URL `?orgQuality=` param. These are
 * also the exact kebab-case label values the indexer stores (per issue
 * #145), so a slug is sent straight to the indexer as the org `labels` /
 * `excludeLabels` value — no slug↔value mapping needed. */
const ORG_TIER_SLUGS = ["high-quality", "standard", "likely-test"] as const
type OrgTierSlug = (typeof ORG_TIER_SLUGS)[number]

const ORG_TIER_DISPLAY_LABEL: Record<OrgTierSlug, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  "likely-test": "Likely test",
}

/** Default org-quality set when `?orgQuality=` is missing —
 *  everything except the labels listed in DEFAULT_HIDDEN_ORG_LABELS
 *  (today only "likely-test"). Matches the home feed's policy. */
const DEFAULT_ORG_TIER_SLUGS: readonly OrgTierSlug[] = ORG_TIER_SLUGS.filter(
  (slug) => !DEFAULT_HIDDEN_ORG_LABELS.includes(slug),
)

/**
 * Sentinel for an explicitly-empty selection. Without this, a writer
 * that puts `""` into the URL would be normalised away by setUrl
 * (which deletes empty values), and the next read would resolve to
 * the default set — making "deselect all" indistinguishable from "no
 * preference" for the user. We pick `-` because it never collides
 * with a legitimate value across degrees / quality / orgQuality.
 */
export const EMPTY_SELECTION_SENTINEL = "-"

/**
 * URL-backed quality-filter state shared by the single-kind view
 * (`ExploreMain`) and the combined All view (`ExploreAllBlocks`). Owns
 * the `?quality=` (cert / Activity Labeler tiers) and `?orgQuality=`
 * (Orglabeler tiers) params, derives the include/exclude label arrays
 * the loaders pass to the indexer, and exposes the toggle/reset
 * handlers + "is default" flags the popover renders against.
 */
export function useQualityFilters() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const setUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, searchParams, router],
  )

  // Cert quality (Activity Labeler tiers) — INCLUDED set, with the
  // synthetic `unlabeled` sentinel. Missing param = home-feed default
  // (every non-hidden tier + unlabeled).
  const qualityParam = searchParams?.get("quality")
  const qualityIncluded = useMemo<Set<HyperlabelTier | UnlabeledSlug>>(() => {
    if (qualityParam == null) {
      return new Set<HyperlabelTier | UnlabeledSlug>([
        ...HYPERLABEL_TIERS.filter((t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t)),
        UNLABELED_SLUG,
      ])
    }
    if (qualityParam === EMPTY_SELECTION_SENTINEL) {
      return new Set<HyperlabelTier | UnlabeledSlug>()
    }
    const valid = new Set<string>([...HYPERLABEL_TIERS, UNLABELED_SLUG])
    return new Set(
      qualityParam
        .split(",")
        .filter((v): v is HyperlabelTier | UnlabeledSlug => valid.has(v)),
    )
  }, [qualityParam])
  const certIncludeUnlabeled = qualityIncluded.has(UNLABELED_SLUG)
  const excludeCertLabels = useMemo<readonly string[] | undefined>(
    () =>
      certIncludeUnlabeled
        ? HYPERLABEL_TIERS.filter((t) => !qualityIncluded.has(t))
        : undefined,
    [qualityIncluded, certIncludeUnlabeled],
  )
  const includeCertLabels = useMemo<readonly string[] | undefined>(
    () =>
      certIncludeUnlabeled
        ? undefined
        : HYPERLABEL_TIERS.filter((t) => qualityIncluded.has(t)),
    [qualityIncluded, certIncludeUnlabeled],
  )
  const qualityIsDefault = useMemo(() => {
    const expectedSize =
      HYPERLABEL_TIERS.length - DEFAULT_HIDDEN_CERT_LABELS.length + 1
    if (qualityIncluded.size !== expectedSize) return false
    if (!qualityIncluded.has(UNLABELED_SLUG)) return false
    for (const t of HYPERLABEL_TIERS) {
      const shouldBeIncluded = !DEFAULT_HIDDEN_CERT_LABELS.includes(t)
      if (qualityIncluded.has(t) !== shouldBeIncluded) return false
    }
    return true
  }, [qualityIncluded])

  // Org quality (Orglabeler tiers) — same pattern.
  const orgQualityParam = searchParams?.get("orgQuality")
  const orgQualityIncluded = useMemo<Set<OrgTierSlug | UnlabeledSlug>>(() => {
    if (orgQualityParam == null) {
      return new Set<OrgTierSlug | UnlabeledSlug>([
        ...DEFAULT_ORG_TIER_SLUGS,
        UNLABELED_SLUG,
      ])
    }
    if (orgQualityParam === EMPTY_SELECTION_SENTINEL) {
      return new Set<OrgTierSlug | UnlabeledSlug>()
    }
    const valid = new Set<string>([...ORG_TIER_SLUGS, UNLABELED_SLUG])
    return new Set(
      orgQualityParam
        .split(",")
        .filter((v): v is OrgTierSlug | UnlabeledSlug => valid.has(v)),
    )
  }, [orgQualityParam])
  const orgIncludeUnlabeled = orgQualityIncluded.has(UNLABELED_SLUG)
  const excludeOrgLabels = useMemo<readonly OrgTierSlug[] | undefined>(
    () =>
      orgIncludeUnlabeled
        ? ORG_TIER_SLUGS.filter((slug) => !orgQualityIncluded.has(slug))
        : undefined,
    [orgQualityIncluded, orgIncludeUnlabeled],
  )
  const includeOrgLabels = useMemo<readonly OrgTierSlug[] | undefined>(
    () =>
      orgIncludeUnlabeled
        ? undefined
        : ORG_TIER_SLUGS.filter((slug) => orgQualityIncluded.has(slug)),
    [orgQualityIncluded, orgIncludeUnlabeled],
  )
  const orgQualityIsDefault = useMemo(() => {
    if (orgQualityIncluded.size !== DEFAULT_ORG_TIER_SLUGS.length + 1) return false
    if (!orgQualityIncluded.has(UNLABELED_SLUG)) return false
    for (const slug of ORG_TIER_SLUGS) {
      const shouldBeIncluded = DEFAULT_ORG_TIER_SLUGS.includes(slug)
      if (orgQualityIncluded.has(slug) !== shouldBeIncluded) return false
    }
    return true
  }, [orgQualityIncluded])

  const onResetQuality = useCallback(() => {
    setUrl({ quality: null, orgQuality: null })
  }, [setUrl])
  const onQualityToggle = useCallback(
    (slug: HyperlabelTier | UnlabeledSlug) => {
      const next = new Set(qualityIncluded)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      const defaultSlugs = new Set<HyperlabelTier | UnlabeledSlug>([
        ...HYPERLABEL_TIERS.filter((t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t)),
        UNLABELED_SLUG,
      ])
      const isDefault =
        next.size === defaultSlugs.size &&
        Array.from(defaultSlugs).every((s) => next.has(s))
      const ordered: (HyperlabelTier | UnlabeledSlug)[] = [
        ...HYPERLABEL_TIERS.filter((t) => next.has(t)),
        ...(next.has(UNLABELED_SLUG) ? [UNLABELED_SLUG] : []),
      ]
      const value = isDefault
        ? null
        : ordered.length === 0
          ? EMPTY_SELECTION_SENTINEL
          : ordered.join(",")
      setUrl({ quality: value })
    },
    [qualityIncluded, setUrl],
  )
  const onOrgQualityToggle = useCallback(
    (slug: OrgTierSlug | UnlabeledSlug) => {
      const next = new Set(orgQualityIncluded)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      const defaultSlugs = new Set<OrgTierSlug | UnlabeledSlug>([
        ...DEFAULT_ORG_TIER_SLUGS,
        UNLABELED_SLUG,
      ])
      const isDefault =
        next.size === defaultSlugs.size &&
        Array.from(defaultSlugs).every((s) => next.has(s))
      const ordered: (OrgTierSlug | UnlabeledSlug)[] = [
        ...ORG_TIER_SLUGS.filter((s) => next.has(s)),
        ...(next.has(UNLABELED_SLUG) ? [UNLABELED_SLUG] : []),
      ]
      const value = isDefault
        ? null
        : ordered.length === 0
          ? EMPTY_SELECTION_SENTINEL
          : ordered.join(",")
      setUrl({ orgQuality: value })
    },
    [orgQualityIncluded, setUrl],
  )

  return {
    qualityIncluded,
    orgQualityIncluded,
    excludeCertLabels,
    includeCertLabels,
    excludeOrgLabels,
    includeOrgLabels,
    qualityIsDefault,
    orgQualityIsDefault,
    onQualityToggle,
    onOrgQualityToggle,
    onResetQuality,
  }
}

export type QualityFilters = ReturnType<typeof useQualityFilters>

/**
 * The quality-filter popover (trigger + content). `showCertSection`
 * adds the Activity-quality (cert) section above Account quality — true
 * on the certs single-kind view and on the All view (which includes
 * activities); false on accounts/projects single-kind views, where only
 * the author-org tier applies.
 */
export function QualityFilterPopover({
  q,
  showCertSection,
  open,
  onOpenChange,
}: {
  q: QualityFilters
  showCertSection: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const filtered =
    (showCertSection && !q.qualityIsDefault) || !q.orgQualityIsDefault
  return (
    <UiPopover open={open} onOpenChange={onOpenChange}>
      <Tooltip label="Filter by quality">
        <PopoverTrigger>
          <button
            type="button"
            className={`explore__chrome-btn explore__chrome-btn--icon${
              filtered ? " explore__chrome-btn--active" : ""
            }`}
            aria-label={`Filter by quality${filtered ? " (filtered)" : ""}`}
          >
            <FilterIcon size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end">
        {showCertSection ? (
          <>
            <p className="popover__section-heading">Activity quality</p>
            {HYPERLABEL_DISPLAY_ORDER.map((tier) => (
              <div key={tier} className="popover__item popover__item--check">
                <Checkbox
                  label={HYPERLABEL_DISPLAY_LABELS[tier]}
                  checked={q.qualityIncluded.has(tier)}
                  onChange={() => q.onQualityToggle(tier)}
                />
              </div>
            ))}
            <div className="popover__item popover__item--check">
              <Checkbox
                label={UNLABELED_LABEL}
                checked={q.qualityIncluded.has(UNLABELED_SLUG)}
                onChange={() => q.onQualityToggle(UNLABELED_SLUG)}
              />
            </div>
            <hr className="popover__divider" aria-hidden="true" />
          </>
        ) : null}
        <p className="popover__section-heading">Account quality</p>
        {ORG_TIER_SLUGS.map((slug) => (
          <div key={slug} className="popover__item popover__item--check">
            <Checkbox
              label={ORG_TIER_DISPLAY_LABEL[slug]}
              checked={q.orgQualityIncluded.has(slug)}
              onChange={() => q.onOrgQualityToggle(slug)}
            />
          </div>
        ))}
        <div className="popover__item popover__item--check">
          <Checkbox
            label={UNLABELED_LABEL}
            checked={q.orgQualityIncluded.has(UNLABELED_SLUG)}
            onChange={() => q.onOrgQualityToggle(UNLABELED_SLUG)}
          />
        </div>
        <hr className="popover__divider" aria-hidden="true" />
        <button
          type="button"
          className="popover__reset-btn"
          onClick={q.onResetQuality}
          disabled={(!showCertSection || q.qualityIsDefault) && q.orgQualityIsDefault}
        >
          Reset to default
        </button>
      </PopoverContent>
    </UiPopover>
  )
}
