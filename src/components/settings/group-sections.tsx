"use client";

import {
  Badge,
  Banner,
  Button,
  Field,
  IdentityRow,
  ResponsiveDialog,
  Select,
  Text,
} from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { identityOf } from "@/components/actor";
import { actorHref } from "@/components/cards";
import type { OwnershipTransferStatus } from "@/lib/cgs";
import {
  type AuditEntryView,
  acceptGroupOwnershipTransfer,
  cancelGroupOwnershipTransfer,
  destroyGroupAccount,
  getGroupAuditLog,
  proposeGroupOwnershipTransfer,
} from "@/lib/hypercerts/group-actions";
import { nameOf } from "@/lib/hypercerts/views";
import type { GroupMemberRow } from "./settings-access";
import { SettingsAction, SettingsGroup, SettingsRow } from "./settings-frame";

function formatShortDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// ---------------------------------------------------------------------------
// Ownership Transfer (`/[actor]/settings/ownership`)
// ---------------------------------------------------------------------------

export function GroupOwnershipSection({
  groupDid,
  groupName,
  groupHandle,
  callerDid,
  isOwner,
  members,
  initialTransfer,
}: {
  groupDid: string;
  groupName: string;
  groupHandle: string | null;
  callerDid: string;
  isOwner: boolean;
  members: GroupMemberRow[];
  initialTransfer: OwnershipTransferStatus | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [transfer, setTransfer] = useState<OwnershipTransferStatus | null>(initialTransfer);
  const [targetDid, setTargetDid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPropose, setConfirmPropose] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);

  const isRecipient =
    !isOwner && Boolean(transfer?.pending && transfer.proposedOwner === callerDid);
  const eligibleTargets = members.filter((m) => m.role !== "owner" && m.actor.did !== callerDid);
  const memberByDid = (did: string) => members.find((m) => m.actor.did === did);
  const targetMember = targetDid ? memberByDid(targetDid) : undefined;
  const proposedMember = transfer?.proposedOwner ? memberByDid(transfer.proposedOwner) : undefined;

  const handlePropose = async () => {
    if (!targetDid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await proposeGroupOwnershipTransfer(groupDid, targetDid);
      if (!res.ok) {
        setError(res.message);
        setConfirmPropose(false);
        return;
      }
      setTransfer(res.transfer);
      setTargetDid("");
      setConfirmPropose(false);
      toast("Ownership transfer proposed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await acceptGroupOwnershipTransfer(groupDid);
      if (!res.ok) {
        setError(res.message);
        setConfirmAccept(false);
        return;
      }
      setConfirmAccept(false);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      toast(`You are now the owner of ${groupName}`);
      setTransfer({ groupDid, pending: false });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await cancelGroupOwnershipTransfer(groupDid);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setTransfer({ groupDid, pending: false });
      toast(isRecipient ? "Ownership transfer declined" : "Transfer cancelled");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const pending = transfer?.pending && transfer.proposedOwner;

  return (
    <>
      <SettingsGroup title="Transfer ownership">
        {pending ? (
          <SettingsRow
            label="Pending transfer"
            description={
              isRecipient
                ? "Accepting makes you the owner, and the current owner becomes an admin."
                : "Nothing changes until the proposed owner accepts."
            }
            actions={
              isRecipient ? (
                <>
                  <SettingsAction tone="muted" disabled={busy} onClick={() => void handleCancel()}>
                    Decline
                  </SettingsAction>
                  <SettingsAction disabled={busy} onClick={() => setConfirmAccept(true)}>
                    Accept
                  </SettingsAction>
                </>
              ) : (
                <SettingsAction disabled={busy} onClick={() => void handleCancel()}>
                  Cancel transfer
                </SettingsAction>
              )
            }
          >
            {error && (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            )}
            {proposedMember ? (
              <IdentityRow
                {...identityOf(proposedMember.actor)}
                href={actorHref(proposedMember.actor)}
                secondary="Proposed owner"
              />
            ) : (
              <Text size="body-sm" tone="ink">
                {transfer.proposedOwner}
              </Text>
            )}
            <Text size="body-sm" tone="muted">
              Proposed {formatShortDate(transfer.createdAt)} — expires{" "}
              {formatShortDate(transfer.expiresAt)} if not accepted.
            </Text>
          </SettingsRow>
        ) : (
          <SettingsRow
            label="New owner"
            description="Pick an existing member. Nothing changes until they accept."
          >
            {error && (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            )}
            {eligibleTargets.length === 0 ? (
              <Text size="body-sm" tone="muted">
                This group has no other members yet. Add someone under Members above first.
              </Text>
            ) : (
              <div className="settings-form">
                <Field label="Member">
                  {(field) => (
                    <Select
                      {...field}
                      value={targetDid}
                      onChange={(e) => setTargetDid(e.currentTarget.value)}
                      disabled={busy}
                    >
                      <option value="">Select a member…</option>
                      {eligibleTargets.map((m) => (
                        <option key={m.actor.did} value={m.actor.did}>
                          {m.actor.handle ? `@${m.actor.handle}` : nameOf(m.actor)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="settings-form-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!targetDid || busy}
                    loading={busy}
                    onClick={() => setConfirmPropose(true)}
                  >
                    Propose transfer
                  </Button>
                </div>
              </div>
            )}
            <Text size="body-sm" tone="muted">
              Moves control of the group within Certified; doesn&apos;t hand over the group
              account&apos;s PDS sign-in credentials.
            </Text>
          </SettingsRow>
        )}
      </SettingsGroup>

      <ResponsiveDialog
        open={confirmPropose}
        onClose={() => !busy && setConfirmPropose(false)}
        title="Propose new owner"
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmPropose(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void handlePropose()}>
              Propose transfer
            </Button>
          </>
        }
      >
        <Text>
          Propose{" "}
          <strong>
            {targetMember?.actor.handle
              ? `@${targetMember.actor.handle}`
              : targetMember
                ? nameOf(targetMember.actor)
                : targetDid}
          </strong>{" "}
          as the owner of <strong>{groupHandle ? `@${groupHandle}` : groupName}</strong>? They
          become the owner once they accept — and you become an admin. You can cancel until then.
        </Text>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={confirmAccept}
        onClose={() => !busy && setConfirmAccept(false)}
        title="Accept ownership"
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmAccept(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void handleAccept()}>
              Accept ownership
            </Button>
          </>
        }
      >
        <Text>
          Become the owner of <strong>{groupHandle ? `@${groupHandle}` : groupName}</strong>? The
          current owner becomes an admin. Only the new owner can undo this, by transferring
          ownership back.
        </Text>
      </ResponsiveDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Activity Log (`/[actor]/settings/activity`)
// ---------------------------------------------------------------------------

export function GroupAuditLogSection({
  groupDid,
  initialEntries,
  initialCursor,
}: {
  groupDid: string;
  initialEntries: AuditEntryView[];
  initialCursor?: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getGroupAuditLog(groupDid, cursor);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEntries((prev) => [...prev, ...res.entries]);
      setCursor(res.cursor);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsGroup title="Audit log" description="Recorded actions taken on this group's behalf.">
      {entries.length === 0 ? (
        <Text size="body-sm" tone="muted">
          No activity recorded yet.
        </Text>
      ) : (
        <div className="stack">
          <ul className="divided settings-list">
            {entries.map((entry) => (
              <li key={entry.id} className="settings-audit-item">
                <div className="settings-audit-head">
                  <Text as="span" tone="ink" className="settings-audit-action">
                    {entry.action}
                  </Text>
                  <Badge
                    variant={
                      entry.result === "permitted"
                        ? "success"
                        : entry.result === "denied"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {entry.result}
                  </Badge>
                </div>
                <div className="settings-audit-meta">
                  <Text as="span" size="body-sm" tone="muted">
                    by{" "}
                    <Link
                      href={actorHref(entry.actorHandle ?? entry.actorDid)}
                      className="inline-link"
                    >
                      {entry.actorHandle ? `@${entry.actorHandle}` : entry.actorDisplayName}
                    </Link>
                  </Text>
                  <Text as="span" size="body-sm" tone="muted">
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                  </Text>
                </div>
                {(entry.collection || entry.rkey) && (
                  <Text size="body-sm" tone="muted" className="settings-audit-code">
                    {[entry.collection, entry.rkey].filter(Boolean).join(" / ")}
                  </Text>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          {cursor && (
            <Button variant="secondary" size="sm" loading={loading} onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </SettingsGroup>
  );
}

// ---------------------------------------------------------------------------
// Group Status (`/[actor]/settings/status`)
// ---------------------------------------------------------------------------

export function GroupStatusSection({
  groupDid,
  groupName,
  groupHandle,
  isSelfOwned,
}: {
  groupDid: string;
  groupName: string;
  groupHandle: string | null;
  isSelfOwned: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDestroy = async () => {
    if (destroying) return;
    setDestroying(true);
    setError(null);
    try {
      const res = await destroyGroupAccount(groupDid);
      if (!res.ok) {
        setError(res.message);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      toast(`${groupHandle ? `@${groupHandle}` : groupName} is now a regular account`);
      router.push(isSelfOwned ? "/settings" : "/workspace");
      router.refresh();
    } finally {
      setDestroying(false);
    }
  };

  return (
    <>
      <SettingsGroup title="Group status">
        <SettingsRow
          label="Turn back into a regular account"
          description="Members can no longer act for it and group features go away. Nothing is deleted, and you can make it a group again later."
          actions={
            <SettingsAction disabled={destroying} onClick={() => setConfirmOpen(true)}>
              Turn back
            </SettingsAction>
          }
        >
          <Text size="body-sm" tone="muted">
            Active group on Certified
          </Text>
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
        </SettingsRow>
      </SettingsGroup>

      <ResponsiveDialog
        open={confirmOpen}
        onClose={() => !destroying && setConfirmOpen(false)}
        title={`Turn ${groupHandle ? `@${groupHandle}` : groupName} back into a regular account?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={destroying} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={destroying} onClick={() => void handleDestroy()}>
              Turn back
            </Button>
          </>
        }
      >
        <Text>
          Members can no longer act for it and the group features go away. The account, its handle
          and everything it published stay, and you can make it a group again later.
        </Text>
      </ResponsiveDialog>
    </>
  );
}
