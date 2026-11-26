"use client";

// Dialog for adding or removing an account, activity, or project in one or
// more of the acting account's typed lists, or creating a new list on the spot.

import {
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  ResponsiveDialog,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { skeletonSlots } from "@/components/cards";
import * as listActions from "@/lib/hypercerts/list-actions";
import type { ListMembershipRow } from "@/lib/hypercerts/list-actions";
import type { ListKind } from "@/lib/lists";

const NOUN: Record<ListKind["label"], string> = {
  Accounts: "account",
  Activities: "activity",
  Projects: "project",
  Endorsements: "endorsement",
};

export function AddToListDialog({
  open,
  onClose,
  repo,
  kind,
  target,
  targetLabel,
}: {
  open: boolean;
  onClose: () => void;
  /** The acting account's DID whose lists are managed. */
  repo: string;
  kind: ListKind["label"];
  /** Account DID for `Accounts`, or record AT-URI for `Activities`/`Projects`. */
  target: string;
  targetLabel: string;
}) {
  const newFormId = useId();
  const [lists, setLists] = useState<ListMembershipRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyRkey, setBusyRkey] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLists(null);
    setLoadError(null);
    setCreateError(null);
    setNewTitle("");
    void listActions
      .getListsForItem(repo, kind, target)
      .then((res) => {
        if (!active) return;
        if (!res.ok) {
          setLoadError(res.message);
          return;
        }
        setLists(res.lists);
      })
      .catch(() => {
        if (active) setLoadError("Couldn't load your lists right now.");
      });
    return () => {
      active = false;
    };
  }, [open, repo, kind, target]);

  const toggle = async (row: ListMembershipRow, next: boolean) => {
    if (busyRkey) return;
    setBusyRkey(row.rkey);
    setLists(
      (prev) =>
        prev?.map((item) =>
          item.rkey === row.rkey
            ? {
                ...item,
                included: next,
                itemCount: Math.max(0, item.itemCount + (next ? 1 : -1)),
              }
            : item,
        ) ?? null,
    );
    try {
      const res = await listActions
        .setListMembership(repo, row.rkey, { kind, target, include: next })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the list was updated. Reload to check.",
        }));
      if (!res.ok) {
        setLists((prev) => prev?.map((item) => (item.rkey === row.rkey ? row : item)) ?? null);
        toast.error(res.message);
        return;
      }
      toast(next ? `Added to ${row.title}` : `Removed from ${row.title}`);
    } finally {
      setBusyRkey(null);
    }
  };

  const createAndAdd = async () => {
    const trimmed = newTitle.trim();
    if (creating) return;
    if (!trimmed) {
      setCreateError("Add a name for the new list.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await listActions
        .createListWithItem(repo, { kind, title: trimmed, target })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the list was created. Reload to check.",
        }));
      if (!res.ok) {
        setCreateError(res.message);
        return;
      }
      setLists((prev) => [res.list, ...(prev ?? [])]);
      setNewTitle("");
      toast(`Created ${res.list.title} and added ${targetLabel}`);
    } finally {
      setCreating(false);
    }
  };

  const noun = NOUN[kind];

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Add to list"
      description={`Choose which of your ${kind.toLowerCase()} lists hold ${targetLabel}.`}
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="stack">
        {loadError && (
          <Banner tone="danger" role="alert">
            {loadError}
          </Banner>
        )}

        {lists === null && !loadError && (
          <div className="stack" aria-hidden>
            {skeletonSlots(3).map((slot) => (
              <Skeleton key={slot} variant="line" />
            ))}
          </div>
        )}

        {lists && lists.length > 0 && (
          <ul className="add-to-list-rows divided">
            {lists.map((row) => (
              <li key={row.uri} className="add-to-list-row">
                <Checkbox
                  label={row.title}
                  description={row.itemCount === 1 ? "1 item" : `${row.itemCount} items`}
                  checked={row.included}
                  disabled={busyRkey !== null}
                  onChange={(event) => void toggle(row, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}

        {lists && lists.length === 0 && (
          <Text size="body-sm" tone="muted">
            You don&apos;t have any {kind.toLowerCase()} lists yet. Create one below.
          </Text>
        )}

        <form
          id={newFormId}
          className="add-to-list-create"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void createAndAdd();
          }}
        >
          {createError && (
            <Banner tone="danger" role="alert">
              {createError}
            </Banner>
          )}
          <Field label={`New ${noun} list`}>
            {(field) => (
              <div className="add-to-list-create-row">
                <Input
                  {...field}
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.currentTarget.value)}
                  placeholder={`e.g. Favorite ${kind.toLowerCase()}`}
                  disabled={creating}
                  maxLength={256}
                />
                <Button type="submit" variant="secondary" size="sm" loading={creating}>
                  <Plus size={16} aria-hidden />
                  Create &amp; add
                </Button>
              </div>
            )}
          </Field>
        </form>
      </div>
    </ResponsiveDialog>
  );
}
