"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import {
  profileIndexed,
  type SaveProfileResult,
  saveProfile,
} from "@/app/(site)/settings/profile/actions";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import { forgetSave, getSave, indexCaughtUp, putSave } from "./local-store";

const profileUri = (did: string) => `at://${did}/app.certified.actor.profile/self`;

const fieldsOf = ({ displayName, description }: ProfileFields): ProfileFields => ({
  displayName,
  description,
});

/** Index polling: quick at first, then backing off to every 30 s, jittered. */
function pollDelay(updates: number) {
  return Math.min(30_000, 2_000 * 1.5 ** updates) * (0.8 + Math.random() * 0.4);
}

/**
 * The profile to show for `did`: a save made in this browser until the index
 * catches up with it, otherwise what the server rendered (or the index read
 * that caught up). Until IndexedDB has been read it is `rendered`, so server
 * and client renders agree.
 */
export function useProfileDisplay(did: string, rendered: ProfileFields): ProfileFields {
  const uri = profileUri(did);
  const save = useLiveQuery(() => getSave<ProfileFields>(uri).catch(() => undefined), [uri]);

  const { data: indexed, dataUpdatedAt } = useQuery({
    queryKey: ["indexed-profile", did],
    enabled: Boolean(save),
    queryFn: async () => {
      const response = await fetch(`/api/profiles/${did}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Profile index read failed (${response.status})`);
      return (await response.json()) as ProfileVersion | null;
    },
    // Only while there is a save: pollDelay is random, and Next.js prerenders
    // client components, where randomness is not allowed.
    refetchInterval: save ? (query) => pollDelay(query.state.dataUpdateCount) : false,
  });

  const caughtUp = Boolean(
    save &&
      indexed !== undefined &&
      dataUpdatedAt > save.savedAt &&
      indexCaughtUp(indexed?.cid ?? null, save),
  );
  useEffect(() => {
    if (!caughtUp || !save) return;
    // Every component showing the profile runs this; only one deletes the row.
    void forgetSave(uri, save.cid)
      .then((deleted) => {
        if (deleted > 0) return profileIndexed(did);
      })
      .catch(() => {});
  }, [caughtUp, save, uri, did]);

  if (save && !caughtUp) return save.value;
  if (indexed === undefined) return rendered;
  return indexed ? fieldsOf(indexed) : { displayName: "", description: "" };
}

const UNKNOWN: SaveProfileResult = {
  ok: false,
  reason: "unknown",
  message: "We couldn't confirm whether your profile was saved. Reload to check.",
};

/**
 * Saves the signed-in user's profile and keeps what the PDS stored for
 * display until the index catches up. Never retried automatically.
 */
export function useSaveProfile() {
  return useMutation({
    retry: false,
    mutationFn: async (input: { fields: ProfileFields; expectedCid: string | null }) => {
      const result = await saveProfile(input).catch(() => UNKNOWN);
      if (result.ok) {
        const { uri, cid } = result.saved;
        // Without storage the save still succeeded; a reload just shows the
        // index's version until it catches up.
        await putSave({ uri, cid, value: fieldsOf(result.saved) }, input.expectedCid).catch(
          () => {},
        );
      }
      return result;
    },
  });
}
