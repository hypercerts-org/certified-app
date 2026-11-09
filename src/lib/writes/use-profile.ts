"use client";

// React wiring for the profile write overlay. Local operations come from
// IndexedDB (live across tabs); index and PDS reads run through TanStack
// Query. Reconciliation happens inside those query functions, so it runs once
// per fetch however many components show the profile; components only
// project.

import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import {
  profileIndexed,
  type SaveProfileResult,
  saveProfile,
} from "@/app/(site)/settings/profile/actions";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import {
  type NewProfileOperation,
  operationsFor,
  type ProfileOperation,
  writeStore,
} from "./local-store";
import {
  type Change,
  type ProfileDisplay,
  pdsQuestion,
  projectProfile,
  reconcileWithIndex,
  resolveWithPds,
} from "./profile-overlay";
import { useViewer } from "./viewer";

class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`${url} answered ${status}`);
    this.name = "HttpError";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new HttpError(url, response.status);
  return response.json() as Promise<T>;
}

/** Saves to one repository run one at a time across this browser's tabs. */
const lockName = (repoDid: string) => `certified-write:${repoDid}`;

async function apply(changes: Change[]) {
  if (changes.length === 0) return;
  const table = writeStore().profileOperations;
  await writeStore().transaction("rw", table, async () => {
    for (const change of changes) {
      if ("remove" in change) await table.delete(change.seq);
      // update(), unlike put(), does nothing if the row was cleared meanwhile.
      else
        await table.update(change.seq, (op) => {
          Object.assign(op, change.next);
        });
    }
  });
}

/**
 * A "submitting" row while no save holds the lock was never answered (the tab
 * closed or reloaded mid-save): its outcome is unknown. Without Web Locks a
 * running save can't be told apart, and the PDS check settles it either way.
 */
async function markAbandoned(repoDid: string, operations: ProfileOperation[]) {
  const abandoned = operations.filter((op) => op.state === "submitting");
  if (abandoned.length === 0) return;
  const mark = () =>
    apply(
      abandoned.map(
        (op): Change => ({ seq: op.seq, next: { ...op, state: "unknown", checks: 0 } }),
      ),
    );
  if (!navigator.locks) return mark();
  await navigator.locks.request(lockName(repoDid), { ifAvailable: true }, (lock) =>
    lock ? mark() : undefined,
  );
}

/** Index polling: quick at first, then backing off to every 30 s, jittered. */
function pollDelay(updates: number) {
  return Math.min(30_000, 2_000 * 1.5 ** updates) * (0.8 + Math.random() * 0.4);
}

const NO_OPERATIONS: ProfileOperation[] = [];

/**
 * The profile to display for `did`, given what the server rendered. Without
 * this account's own local saves it is exactly `rendered`, as it is while
 * IndexedDB and the signed-in account are being read, so the server and the
 * first client render agree. `viewer` overrides the account reported by the
 * header, where the caller already knows it.
 */
export function useProfileDisplay(
  did: string,
  rendered: ProfileFields,
  viewer?: string,
): ProfileDisplay {
  const reported = useViewer();
  const actor = viewer ?? reported;
  const operations =
    useLiveQuery(
      () =>
        actor
          ? operationsFor(actor, did).catch((err: unknown) => {
              // Without IndexedDB (blocked site data) there is nothing to overlay.
              if (process.env.NODE_ENV !== "production") console.warn("[overlay]", err);
              return NO_OPERATIONS;
            })
          : NO_OPERATIONS,
      [actor, did],
    ) ?? NO_OPERATIONS;
  const pending = operations.some((op) => op.state !== "saved" || !op.indexed);

  const { data: indexed } = useQuery({
    queryKey: ["indexed-profile", actor, did],
    enabled: Boolean(actor) && operations.length > 0,
    queryFn: async () => {
      const version = await fetchJson<ProfileVersion | null>(`/api/profiles/${did}`);
      if (actor) {
        const current = await operationsFor(actor, did);
        await markAbandoned(did, current);
        const changes = reconcileWithIndex(version, current);
        await apply(changes);
        if (changes.some((c) => "next" in c && c.next.state === "saved" && c.next.indexed)) {
          void profileIndexed(did);
        }
      }
      return version;
    },
    refetchInterval: (query) => (pending ? pollDelay(query.state.dataUpdateCount) : false),
  });

  const question = actor ? pdsQuestion(indexed, operations) : null;
  // A save already checked once (and not yet applied) is re-read after a pause.
  const recheck = operations.some((op) => op.state === "unknown" && op.checks > 0);
  useQuery({
    queryKey: ["pds-profile", actor, did, question],
    enabled: question !== null,
    queryFn: async () => {
      if (recheck) await new Promise((resolve) => setTimeout(resolve, 3_000));
      const version = await fetchJson<ProfileVersion | null>(
        `/api/me/profile?did=${encodeURIComponent(did)}`,
      );
      if (actor) await apply(resolveWithPds(version, await operationsFor(actor, did)));
      return version;
    },
    // Signed out or another account: retrying can't help. The check runs again
    // when the window regains focus.
    retry: (failures, error) => !(error instanceof HttpError && error.status < 500) && failures < 3,
  });

  return projectProfile(rendered, indexed, operations);
}

export type SaveOutcome =
  | (Extract<SaveProfileResult, { ok: true }> & { durable: boolean })
  | Extract<SaveProfileResult, { ok: false }>
  | { ok: false; reason: "storage"; message: string };

/**
 * Saves the signed-in user's profile. The intent is stored before the request
 * is sent, so a reload mid-save can be recovered; the answer replaces it with
 * exactly what the PDS stored. Never retried automatically. `durable: false`
 * means the save succeeded but this browser couldn't record it, so a reload
 * before indexing may briefly show the old profile.
 */
export function useSaveProfile(did: string) {
  return useMutation({
    retry: false,
    mutationFn: (input: { fields: ProfileFields; expectedCid: string | null }) => {
      const save = async (): Promise<SaveOutcome> => {
        const table = writeStore().profileOperations;
        const intent: NewProfileOperation = {
          id: crypto.randomUUID(),
          actorDid: did,
          repoDid: did,
          state: "submitting",
          submitted: input.fields,
          expectedCid: input.expectedCid,
        };
        let seq: number;
        try {
          seq = await table.add(intent);
        } catch {
          // Without storage, a reload could hide a save that succeeded.
          return {
            ok: false,
            reason: "storage",
            message:
              "This browser can't store your changes, so they weren't sent. Check that site data is allowed.",
          };
        }

        let result: SaveProfileResult;
        try {
          result = await saveProfile(input);
        } catch {
          result = {
            ok: false,
            reason: "unknown",
            message: "Checking whether your profile was saved…",
          };
        }
        const recorded = (next: ProfileOperation) =>
          table.update(seq, (op) => {
            Object.assign(op, next);
          });
        if (result.ok) {
          const updated = await recorded({
            ...intent,
            seq,
            state: "saved",
            saved: result.saved,
            indexed: false,
          }).catch(() => 0);
          return { ...result, durable: updated === 1 };
        }
        if (result.reason === "unknown") {
          await recorded({ ...intent, seq, state: "unknown", checks: 0 }).catch(() => {});
        } else {
          await table.delete(seq).catch(() => {});
        }
        return result;
      };
      return navigator.locks ? navigator.locks.request(lockName(did), save) : save();
    },
  });
}
