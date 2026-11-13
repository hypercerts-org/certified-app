import React from "react";
import Link from "next/link";
import Skeleton from "./skeleton";

export interface StatRowItem {
  label: string;
  /** `null` once loaded means "unknown" and shows an en dash. */
  value: number | string | null;
  /** Links the whole stat (value and label) to the full list. */
  href?: string;
  /** Shows a skeleton in place of the value, never a "0". */
  loading?: boolean;
}

export interface StatRowProps {
  items: StatRowItem[];
  /** Names the list, e.g. "Records by kind". */
  "aria-label"?: string;
  className?: string;
}

const statInner = "flex flex-col gap-1";

// The value: Inter 600 at the h4 size (no serif; numbers are not titles).
// A style may set its own numeral face (--font-numeral, looks.css);
// unset, the value inherits the UI face.
const valueCls =
  "flex min-h-6 items-center text-h4 tracking-normal tabular-nums text-[var(--fg-primary)] font-[family-name:var(--font-numeral)]";
const labelCls = "text-ui text-[var(--fg-muted)]";

/**
 * A quiet inline row of statistics (DESIGN.md §9.13), in place of boxed
 * count tiles: each stat is its value over a muted label, separated by
 * space and wrapping on phones. Linked stats underline on hover (hover
 * devices only). While `loading`, the value is a skeleton.
 */
export default function StatRow({
  items,
  "aria-label": ariaLabel,
  className = "",
}: StatRowProps) {
  return (
    <ul
      aria-label={ariaLabel}
      className={`m-0 flex list-none flex-wrap gap-x-8 gap-y-4 p-0 ${className}`.trim()}
    >
      {items.map((item) => {
        const value = item.loading ? (
          <Skeleton variant="line" width={32} height={20} />
        ) : (
          (item.value ?? "–")
        );
        const content = (
          <>
            <span className={valueCls}>{value}</span>
            <span className={labelCls}>{item.label}</span>
          </>
        );
        return (
          <li key={item.label} aria-busy={item.loading || undefined}>
            {item.href ? (
              <Link
                href={item.href}
                className={`${statInner} rounded no-underline underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2`}
              >
                {content}
              </Link>
            ) : (
              <div className={statInner}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
