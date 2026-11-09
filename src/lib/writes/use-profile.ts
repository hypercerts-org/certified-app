"use client";

// React wiring for the profile write overlay: local operations from IndexedDB
// (live across tabs), index and PDS reads through TanStack Query, and the
// rules in ./profile-overlay deciding what to show and what to settle.

import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { type SaveProfileResult, saveProfile } from "@/app/(site)/settings/profile/actions";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import { type ProfileOperation, writeStore } from "./local-store";
import {
  type Change,
  needsPdsCheck,
  type ProfileDisplay,
  projectProfile,
  reconcileWithIndex,
  resolveWithPds,
} from "./profile-overlay";

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

/** Saves to one repository are serialized across this browser's tabs. */
function withWriteLock<T>(did: string, fn: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(`certified-write:${did}`, fn) : fn();
}

async function apply(changes: Change[]) {
  if (changes.length === 0) return;
  const table = writeStore().profileOperations;
  await writeStore().transaction("rw", table, async () => {
    for (const change of changes) {
      if ("remove" in change) await table.delete(change.seq);
      else
        await table.update(change.seq, (op) => {
          Object.assign(op, change.set);
        });
    }
  });
}

const NO_OPERATIONS: ProfileOperation[] = [];

/** Index polling: quick at first, then backing off to every 30 s, jittered. */
function pollDelay(updates: number) {
  return Math.min(30_000, 2_000 * 1.5 ** updates) * (0.8 + Math.random() * 0.4);
}

/**
 * The profile to display for `did`, given what the server rendered. Without
 * local writes it is exactly `rendered`. While IndexedDB is being read (and
 * where it is unavailable) the rendered profile shows, so the server and the
 * first client render agree.
 */
export function useProfileDisplay(
  did: string,
  rendered: ProfileFields,
): ProfileDisplay & { lost: boolean } {
  const operations = useLiveQuery(
    () =>
      writeStore()
        .profileOperations.where("repoDid")
        .equals(did)
        .sortBy("seq")
        .catch(() => [] as ProfileOperation[]),
    [did],
  );
  const ops = operations ?? NO_OPERATIONS;
  const pending = ops.some((op) => op.state !== "saved" || !op.indexed);
  const [lost, setLost] = useState(false);

  const { data: indexed } = useQuery({
    queryKey: ["indexed-profile", did],
    queryFn: () => fetchJson<ProfileVersion | null>(`/api/profiles/${did}`),
    enabled: ops.length > 0,
    refetchInterval: (query) => (pending ? pollDelay(query.state.dataUpdateCount) : false),
  });

  const checkPds = needsPdsCheck(indexed, ops);
  const { data: pds } = useQuery({
    queryKey: ["pds-profile", did],
    queryFn: () => fetchJson<ProfileVersion | null>("/api/me/profile"),
    enabled: checkPds,
    staleTime: 0,
    // Signed out or another account: retrying can't help. The check runs again
    // when the window regains focus.
    retry: (failures, error) => !(error instanceof HttpError && error.status < 500) && failures < 3,
  });

  // A "submitting" row with no save in progress was never answered (the tab
  // closed or reloaded mid-save): its outcome is unknown.
  useEffect(() => {
    const abandoned = ops.filter((op) => op.state === "submitting");
    if (abandoned.length === 0 || !navigator.locks) return;
    void navigator.locks.request(`certified-write:${did}`, { ifAvailable: true }, async (lock) => {
      if (lock)
        await apply(
          abandoned.map((op): Change => ({ seq: op.seq ?? 0, set: { state: "unknown" } })),
        );
    });
  }, [ops, did]);

  useEffect(() => {
    if (indexed !== undefined) void apply(reconcileWithIndex(indexed, ops));
  }, [indexed, ops]);

  useEffect(() => {
    if (!checkPds || pds === undefined) return;
    const changes = resolveWithPds(pds, indexed, ops);
    if (changes.some((change) => "lost" in change && change.lost)) setLost(true);
    void apply(changes);
  }, [checkPds, pds, indexed, ops]);

  return { ...projectProfile(rendered, indexed, ops), lost };
}

export type SaveOutcome = SaveProfileResult | { ok: false; reason: "storage"; message: string };

/**
 * Saves the signed-in user's profile. The intent is stored before the request
 * is sent, so a reload mid-save can be recovered; the answer replaces it with
 * exactly what the PDS stored. Never retried automatically.
 */
export function useSaveProfile(did: string) {
  return useMutation({
    retry: false,
    mutationFn: (input: { fields: ProfileFields; expectedCid: string | null }) =>
      withWriteLock(did, async (): Promise<SaveOutcome> => {
        const table = writeStore().profileOperations;
        const intent: ProfileOperation = {
          id: crypto.randomUUID(),
          actorDid: did,
          repoDid: did,
          state: "submitting",
          submitted: input.fields,
          expectedCid: input.expectedCid,
        };
        let seq: number;
        try {
          // The auto-incremented key: always a number once added.
          seq = (await table.add(intent)) as number;
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
        // A failed local update only weakens reload recovery; the PDS answer stands.
        if (result.ok) {
          const done: ProfileOperation = {
            ...intent,
            seq,
            state: "saved",
            saved: result.saved,
            indexed: false,
          };
          await table.put(done).catch(() => {});
        } else if (result.reason === "unknown") {
          const unsure: ProfileOperation = { ...intent, seq, state: "unknown" };
          await table.put(unsure).catch(() => {});
        } else {
          await table.delete(seq).catch(() => {});
        }
        return result;
      }),
  });
}
