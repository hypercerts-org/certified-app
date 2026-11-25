// The column beside a project's or an activity's tabs, the same on every tab:
// what stays put. Its figures (RecordFigures) and its facts and permanent ID
// (RecordFacts), as a profile's column has the account's.

import { Card, CopyableId, Heading } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { type Stat, StatRow } from "@/components/stat-row";
import { getFundingSummary, getRecordBadges } from "@/lib/hypercerts/queries";

/**
 * A record's figures: a project's activities, its badges, and (on its own, as
 * adding it up can take a while) the funding it received, each leading to
 * its tab. Only those it has; no card when it has none.
 */
export async function RecordFigures({
  uri,
  base,
  activities = 0,
}: {
  uri: string;
  base: string;
  /** A project's activities; an activity has none. */
  activities?: number;
}) {
  const badges = await getRecordBadges(uri);
  const stats: Stat[] = [];
  if (activities > 0) {
    stats.push({ label: "Activities", value: activities, href: `${base}/activities` });
  }
  if (badges.length > 0) {
    stats.push({ label: "Badges", value: badges.length, href: `${base}/badges` });
  }
  // Nothing to count: a card only for funding received.
  if (stats.length === 0 && (await getFundingSummary({ for: uri })).totals.length === 0) {
    return null;
  }
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        In numbers
      </Heading>
      <div className="rail-figures">
        {stats.length > 0 && <StatRow label="In numbers" stats={stats} />}
        <Suspense fallback={null}>
          <Received uri={uri} base={base} />
        </Suspense>
      </div>
    </Card>
  );
}

async function Received({ uri, base }: { uri: string; base: string }) {
  const summary = await getFundingSummary({ for: uri });
  const [main] = summary.totals;
  if (!main) return null;
  return (
    <StatRow
      label="Funding"
      stats={[
        {
          label: "Received",
          value: `${main.amount}${summary.capped ? "+" : ""}`,
          href: `${base}/funding`,
        },
      ]}
    />
  );
}

/** What the record is ("Project", "Activity"): facts with a value, then its permanent ID. */
export function RecordFacts({
  title,
  uri,
  facts,
}: {
  title: string;
  uri: string;
  facts: [label: string, value: string | null][];
}) {
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        {title}
      </Heading>
      <dl className="facts">
        {facts.map(([label, value]) =>
          value ? (
            <div key={label} className="fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ) : null,
        )}
        <div className="fact">
          <dt>Permanent ID</dt>
          <dd>
            <CopyableId value={uri} displayValue={uri} label="Permanent ID" />
          </dd>
        </div>
      </dl>
    </Card>
  );
}
