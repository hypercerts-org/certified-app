import { IntentLink } from "@/components/intent-link";
import type { Count } from "@/lib/hypercerts/queries";

// Figures in a row, each a large number over its label, and a link to where
// the figure comes from: the workspace's and a profile's Overview.

const numberFormat = new Intl.NumberFormat("en");

/** A count ("1,000+" when it stopped counting), or a figure already written ("$21,503"). */
const formatValue = (value: Count | number | string) =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? numberFormat.format(value)
      : `${numberFormat.format(value.value)}${value.capped ? "+" : ""}`;

export type Stat = { label: string; value: Count | number | string; href?: string };

export function StatRow({ label, stats }: { label: string; stats: Stat[] }) {
  return (
    <ul className="stat-row" aria-label={label}>
      {stats.map((stat) => {
        const content = (
          <>
            <span className="stat-value">{formatValue(stat.value)}</span>
            <span className="stat-label">{stat.label}</span>
          </>
        );
        return (
          <li key={stat.label}>
            {stat.href ? (
              // Its page loads on hover or focus, not with this one.
              <IntentLink href={stat.href} className="stat stat-link">
                {content}
              </IntentLink>
            ) : (
              <span className="stat">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
