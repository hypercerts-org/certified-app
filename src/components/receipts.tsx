"use client";

// Funding receipts as a ledger, compact enough for the content column: when;
// from and to, what it was for as a line under whoever received it (or under
// the giver, when "to" is left out); the amount, with its kind and the
// platform that confirmed it (the account that recorded the receipt) under
// it. Columns every row would repeat are left out (`omit`). An onchain
// payment links to its transaction. A page loads at a time ("Load more").

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";
import { ExternalLink, HandCoins } from "lucide-react";
import { useCallback } from "react";
import { ActorLink } from "@/components/actor";
import { Empty } from "@/components/empty";
import { IntentLink } from "@/components/intent-link";
import type { ReceiptFilter, ReceiptRow } from "@/lib/hypercerts/queries";
import type { ActorCard, Page, ReceiptParty } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

/** What a ledger leaves out: what every row would repeat (a project's page: to and for). */
export type LedgerOmit = "from" | "to" | "for" | "by";

const receiptKey = (row: ReceiptRow) => row.uri;

/** What the gift was for, as a line under a party. */
function For({ row }: { row: ReceiptRow }) {
  if (!row.forHref) return null;
  return (
    <span className="ledger-for">
      for{" "}
      <IntentLink href={row.forHref} dir="auto">
        {row.forTitle}
      </IntentLink>
    </span>
  );
}

function Party({ party, actor }: { party: ReceiptParty; actor: ActorCard | null }) {
  if (actor) return <ActorLink actor={actor} className="ledger-account" />;
  if (party.kind === "anonymous") return <span className="ledger-anonymous">Anonymous</span>;
  if (party.kind === "text") {
    // A wallet address, shortened the way wallets show them.
    const short = /^0x[0-9a-fA-F]{40}$/.test(party.value)
      ? `${party.value.slice(0, 6)}…${party.value.slice(-4)}`
      : party.value;
    return (
      <span className="ledger-mono" title={party.value}>
        {short}
      </span>
    );
  }
  return <span className="ledger-mono">{party.did}</span>;
}

export function Ledger({
  filter,
  initial,
  omit,
  empty,
}: {
  filter: ReceiptFilter;
  initial: Page<ReceiptRow>;
  omit: LedgerOmit[];
  empty: string;
}) {
  const pageUrl = useCallback(
    (cursor: string) =>
      `/api/receipts?${new URLSearchParams({ ...(filter as Record<string, string>), cursor })}`,
    [filter],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, pageUrl, receiptKey);
  if (items.length === 0 && !hasMore) return <Empty icon={HandCoins} title={empty} />;
  const show = (column: LedgerOmit) => !omit.includes(column);
  // "For" goes under whoever received the gift, else under the giver.
  const forUnder = show("for") ? (show("to") ? "to" : "from") : null;
  return (
    <div className="stack">
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable overflow region */}
      <section className="ledger-scroll" tabIndex={0} aria-label="Funding receipts">
        <table className="ledger">
          <caption className="visually-hidden">Funding receipts</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              {show("from") && <th scope="col">From</th>}
              {show("to") && <th scope="col">To</th>}
              <th scope="col" className="ledger-amount">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.uri}>
                <td className="ledger-when" title={row.stampFull ?? undefined}>
                  {row.stamp ?? "—"}
                </td>
                {show("from") && (
                  <td>
                    <span className="ledger-party">
                      <Party party={row.from} actor={row.fromActor} />
                      {forUnder === "from" && <For row={row} />}
                    </span>
                  </td>
                )}
                {show("to") && (
                  <td>
                    <span className="ledger-party">
                      <Party party={row.to} actor={row.toActor} />
                      {forUnder === "to" && <For row={row} />}
                    </span>
                  </td>
                )}
                <td className="ledger-amount">
                  <span className="ledger-value">{row.amount ?? "—"}</span>
                  <span className="ledger-detail">
                    {row.type}
                    {show("by") && (
                      <span>
                        {row.type ? "via " : "Via "}
                        <ActorLink actor={row.recorder} avatar={false} />
                      </span>
                    )}
                    {row.transaction &&
                      (row.transaction.href ? (
                        <a
                          href={row.transaction.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ledger-tx"
                          title={`${row.network ?? "Transaction"} ${row.transaction.id}`}
                        >
                          {row.network ?? "Tx"}
                          <ExternalLink size={12} aria-hidden />
                          <span className="visually-hidden"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <span className="ledger-mono" title={row.transaction.id}>
                          {row.network ?? row.transaction.short}
                        </span>
                      ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
