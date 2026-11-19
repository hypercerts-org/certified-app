"use client";

// Funding receipts as a ledger, after staging's Funding page: when, from, to,
// what for, the amount, and who confirmed it (the account that recorded the
// receipt, usually the platform that processed the payment). An onchain
// payment links to its transaction. A page loads at a time ("Load more").

import { Avatar, Button, EmptyState, ErrorMessage } from "@hypercerts-org/ui-react";
import { ExternalLink } from "lucide-react";
import { useCallback } from "react";
import { actorHref } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import type { ReceiptFilter, ReceiptRow } from "@/lib/hypercerts/queries";
import type { ActorCard, Page, ReceiptParty } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

/** The column a ledger leaves out: the one every row would repeat. */
export type LedgerOmit = "from" | "to" | "for" | "by";

const receiptKey = (row: ReceiptRow) => row.uri;

function Account({ actor }: { actor: ActorCard }) {
  return (
    <IntentLink href={actorHref(actor)} className="ledger-account">
      <Avatar
        name={actor.displayName}
        src={actor.avatarUrl}
        size="sm"
        className={actor.isOrganization ? "avatar-square" : undefined}
      />
      <span dir="auto">{actor.displayName}</span>
    </IntentLink>
  );
}

function Party({ party, actor }: { party: ReceiptParty; actor: ActorCard | null }) {
  if (actor) return <Account actor={actor} />;
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
  omit: LedgerOmit;
  empty: string;
}) {
  const pageUrl = useCallback(
    (cursor: string) =>
      `/api/receipts?${new URLSearchParams({ ...(filter as Record<string, string>), cursor })}`,
    [filter],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, pageUrl, receiptKey);
  if (items.length === 0 && !hasMore) return <EmptyState title={empty} />;
  return (
    <div className="stack">
      <div className="ledger-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">When</th>
              {omit !== "from" && <th scope="col">From</th>}
              {omit !== "to" && <th scope="col">To</th>}
              {omit !== "for" && <th scope="col">For</th>}
              <th scope="col" className="ledger-amount">
                Amount
              </th>
              {omit !== "by" && <th scope="col">Confirmed by</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.uri}>
                <td className="ledger-mono ledger-when" title={row.date ?? undefined}>
                  {row.stamp ?? "—"}
                </td>
                {omit !== "from" && (
                  <td>
                    <Party party={row.from} actor={row.fromActor} />
                  </td>
                )}
                {omit !== "to" && (
                  <td>
                    <Party party={row.to} actor={row.toActor} />
                  </td>
                )}
                {omit !== "for" && (
                  <td className="ledger-for">
                    {row.forHref ? (
                      <IntentLink href={row.forHref} dir="auto">
                        {row.forTitle}
                      </IntentLink>
                    ) : (
                      <span className="ledger-muted">—</span>
                    )}
                  </td>
                )}
                <td className="ledger-amount">
                  <span className="ledger-value">{row.amount ?? "—"}</span>
                  {(row.type || row.transaction) && (
                    <span className="ledger-detail">
                      {row.type}
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
                  )}
                </td>
                {omit !== "by" && (
                  <td>
                    <Account actor={row.recorder} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
