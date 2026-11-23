"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { toast } from "sonner";
import { follow, followIndexed, unfollow } from "@/lib/hypercerts/follow-actions";
import type { FollowRef } from "@/lib/hypercerts/views";
import {
  type FollowSave,
  followCaughtUp,
  forgetFollowSave,
  getFollowSave,
  getFollowSavesOf,
  putFollowSave,
  restoreFollowSave,
} from "./local-store";

/** Index polling: quick at first, then backing off to every 30 s, jittered. */
function pollDelay(updates: number) {
  return Math.min(30_000, 2_000 * 1.5 ** updates) * (0.8 + Math.random() * 0.4);
}

/** The request's answer was lost: the change may or may not have been made. */
const lost = (action: "follow" | "unfollow") =>
  ({ ok: false, message: `We couldn't confirm the ${action}. Reload to check.` }) as const;

/**
 * Whether `actor` follows `subject`, and a toggle. A click shows the new state
 * at once, kept in IndexedDB until the index shows it (so a reload or another
 * page shows it too); a write that fails puts the old state back and says so.
 * Until IndexedDB has been read it is `rendered`, so server and client agree.
 */
export function useFollow(actor: string, subject: string, rendered: FollowRef | null) {
  const save = useLiveQuery(
    () => getFollowSave(actor, subject).catch(() => undefined),
    [actor, subject],
  );

  const { data: indexed, dataUpdatedAt } = useQuery({
    queryKey: ["indexed-follow", actor, subject],
    enabled: Boolean(save),
    queryFn: async () => {
      const params = new URLSearchParams({ actor, subject });
      const response = await fetch(`/api/follows?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Follow index read failed (${response.status})`);
      return (await response.json()) as FollowRef | null;
    },
    // Only while there is a save: pollDelay is random, and Next.js prerenders
    // client components, where randomness is not allowed.
    refetchInterval: save ? (query) => pollDelay(query.state.dataUpdateCount) : false,
  });

  const caughtUp = Boolean(
    save && indexed !== undefined && dataUpdatedAt > save.savedAt && followCaughtUp(indexed, save),
  );
  useEffect(() => {
    if (!caughtUp || !save) return;
    void forgetFollowSave(actor, subject, save.savedAt)
      .then((deleted) => {
        if (deleted > 0) return followIndexed(subject);
      })
      .catch(() => {});
  }, [caughtUp, save, actor, subject]);

  const current: FollowRef | null =
    save && !caughtUp ? save.follow : indexed !== undefined ? indexed : rendered;
  const following = save && !caughtUp ? save.following : current !== null;

  const mutation = useMutation({
    retry: false,
    mutationFn: async (next: boolean) => {
      const previous = save;
      const base = { actor, subject, savedAt: Date.now() };
      const pending: FollowSave = next
        ? { ...base, following: true, follow: null, removed: [] }
        : {
            ...base,
            following: false,
            follow: null,
            removed: [...new Set([current?.uri, rendered?.uri].filter((uri) => uri != null))],
          };
      // Without storage the change still happens; the button shows it while
      // the request runs (below), and the index's state after.
      await putFollowSave(pending).catch(() => {});
      const result = next
        ? await follow(subject).catch(() => lost("follow"))
        : await unfollow({ subject, uris: pending.removed }).catch(() => lost("unfollow"));
      if (!result.ok) {
        await restoreFollowSave(actor, subject, previous).catch(() => {});
        toast.error(result.message);
        return;
      }
      const done =
        "follow" in result
          ? { ...pending, follow: result.follow }
          : { ...pending, removed: result.removed };
      await putFollowSave(done).catch(() => {});
    },
  });

  return {
    following: mutation.isPending ? mutation.variables : following,
    pending: mutation.isPending,
    toggle: () => {
      if (!mutation.isPending) mutation.mutate(!following);
    },
  };
}

/**
 * How many more (or fewer) follow `subject` than the index says: this
 * browser's follows and unfollows it hasn't caught up with.
 */
export function useFollowerDelta(subject: string): number {
  const saves = useLiveQuery(() => getFollowSavesOf(subject).catch(() => []), [subject]);
  return (saves ?? []).reduce((sum, save) => sum + (save.following ? 1 : -1), 0);
}
