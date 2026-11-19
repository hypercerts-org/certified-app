// Funding on a page: the figures (received, gifts, donors), then the ledger.
// Used by a profile's Funding tab and by project and activity pages.

import { Skeleton, Text } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { skeletonSlots } from "@/components/cards";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { Ledger, type LedgerOmit } from "@/components/receipts";
import { getFundingSummary, listReceiptsPage, type ReceiptFilter } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

const numberFormat = new Intl.NumberFormat("en");

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="funding-stat">
      <span className="funding-stat-value">{value}</span>
      <Text as="span" size="body-sm" tone="muted">
        {label}
      </Text>
    </div>
  );
}

/** The figures: the total in each currency, gifts and donors ("+" when not all were counted). */
async function FundingStats({
  filter,
  label,
  omit,
}: {
  filter: ReceiptFilter;
  label: string;
  omit: LedgerOmit;
}) {
  const summary = await getFundingSummary(filter);
  if (summary.gifts === 0) return null;
  const [main, ...others] = summary.totals;
  const plus = summary.capped ? "+" : "";
  const count = (n: number) => `${numberFormat.format(n)}${plus}`;
  return (
    <div className="funding-stats">
      <Stat value={main ? `${main.amount}${plus}` : "—"} label={label} />
      {others.map((total) => (
        <Stat
          key={total.currency}
          value={`${total.amount}${plus}`}
          label={`${label} in ${total.currency}`}
        />
      ))}
      <Stat value={count(summary.gifts)} label="Gifts" />
      {omit !== "from" && (
        <>
          <Stat value={count(summary.namedDonors)} label="Named donors" />
          <Stat value={count(summary.anonymousGifts)} label="Anonymous gifts" />
        </>
      )}
    </div>
  );
}

function FundingStatsSkeleton() {
  return (
    <div className="funding-stats" aria-hidden>
      {skeletonSlots(3).map((slot) => (
        <Skeleton key={slot} variant="box" className="skeleton-stat" />
      ))}
    </div>
  );
}

/**
 * The figures and the ledger for receipts `filter` selects. `label` names
 * the total ("Received", "Given"); `omit` the ledger's repeated column. The
 * figures load on their own: adding up a large account takes a while, and
 * the ledger needn't wait for it.
 */
export async function Funding({
  filter,
  label,
  omit,
  empty,
}: {
  filter: ReceiptFilter;
  label: string;
  omit: LedgerOmit;
  empty: string;
}) {
  const first = await listReceiptsPage(filter);
  return (
    <div className="funding">
      {first.items.length > 0 && (
        <Suspense fallback={<FundingStatsSkeleton />}>
          <FundingStats filter={filter} label={label} omit={omit} />
        </Suspense>
      )}
      <Ledger filter={filter} initial={first} omit={omit} empty={empty} />
    </div>
  );
}

/** Funding on its way: the figures, then ledger rows. */
export function FundingSkeleton() {
  return (
    <div className="funding" aria-hidden>
      <div className="funding-stats">
        {skeletonSlots(3).map((slot) => (
          <Skeleton key={slot} variant="box" className="skeleton-stat" />
        ))}
      </div>
      <div className="ledger-skeleton">
        {skeletonSlots(5).map((slot) => (
          <Skeleton key={slot} variant="line" className="ledger-skeleton-row" />
        ))}
      </div>
    </div>
  );
}

type Which = "received" | "given" | "confirmed";

const FUNDING_TABS: Record<Which, { label: string; path: string }> = {
  received: { label: "Received", path: "/funding" },
  given: { label: "Given", path: "/funding/given" },
  confirmed: { label: "Confirmed", path: "/funding/confirmed" },
};

/**
 * A profile's Funding tab, `which` of its lists: what the account received,
 * what it gave, and what it confirmed (the receipts it recorded, as the
 * platform that processed the payments: Ma Earth, for most).
 */
export async function ProfileFunding({
  params,
  which,
}: {
  params: Promise<{ actor: string }>;
  which: Which;
}) {
  const { actor, base } = await profileActor(params, FUNDING_TABS[which].path);
  const did = actor.did;
  return (
    <div className="profile-list-page funding-page">
      <ProfileTabs
        label="Funding"
        variant="segmented"
        tabs={(Object.keys(FUNDING_TABS) as Which[]).map((key) => ({
          label: FUNDING_TABS[key].label,
          href: `${base}${FUNDING_TABS[key].path}`,
        }))}
      />
      {which === "received" && (
        <Funding filter={{ to: did }} label="Received" omit="to" empty="No funding received yet." />
      )}
      {which === "given" && (
        <Funding filter={{ from: did }} label="Given" omit="from" empty="No funding given yet." />
      )}
      {which === "confirmed" && (
        <Funding
          filter={{ by: did }}
          label="Confirmed"
          omit="by"
          empty="This account hasn't confirmed any funding. Platforms that process payments confirm them by recording receipts."
        />
      )}
    </div>
  );
}

/** A Funding tab on its way. */
export function ProfileFundingSkeleton({ which }: { which: Which }) {
  return (
    <div className="profile-list-page funding-page">
      <SegmentedLinksSkeleton
        labels={Object.values(FUNDING_TABS).map((tab) => tab.label)}
        current={FUNDING_TABS[which].label}
      />
      <FundingSkeleton />
    </div>
  );
}
