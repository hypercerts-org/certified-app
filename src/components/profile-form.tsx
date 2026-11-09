"use client";

import { Banner, Button, Field, Input, Text, Textarea } from "@hypercerts-org/ui-react";
import { type FormEvent, useState } from "react";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import {
  dismissLost,
  type SaveOutcome,
  useProfileDisplay,
  useSaveProfile,
} from "@/lib/writes/use-profile";

const NO_PROFILE: ProfileFields = { displayName: "", description: "" };

/**
 * Edits the signed-in user's display name and description. `current` is the
 * profile as the PDS had it when the page was rendered (null: none yet). Each
 * save is based on the newest version known here (the last save's, or the
 * page's) and is refused if the profile changed elsewhere in the meantime.
 */
export function ProfileForm({ did, current }: { did: string; current: ProfileVersion | null }) {
  const initial = current ?? NO_PROFILE;
  const cid = current?.cid ?? null;
  const [fields, setFields] = useState<ProfileFields>({
    displayName: initial.displayName,
    description: initial.description,
  });
  const save = useSaveProfile(did);
  const display = useProfileDisplay(did, initial, did, current);
  // While a save is running or its outcome is being checked, the version to
  // base the next one on isn't known yet.
  const busy = save.isPending || display.status === "saving" || display.status === "checking";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) save.mutate({ fields, expectedCid: display.savedCid ?? cid });
  }

  const set = (name: keyof ProfileFields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  return (
    <form onSubmit={submit} className="stack profile-form">
      <Field label="Display name">
        {(field) => (
          <Input
            {...field}
            value={fields.displayName}
            onChange={(event) => set("displayName")(event.target.value)}
            autoComplete="name"
          />
        )}
      </Field>
      <Field label="Description" description="A short introduction shown on your profile.">
        {(field) => (
          <Textarea
            {...field}
            rows={5}
            value={fields.description}
            onChange={(event) => set("description")(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" loading={save.isPending} disabled={busy}>
        Save
      </Button>
      {!save.isPending && (
        <SaveStatus
          result={save.data}
          status={display.status}
          lost={display.lost}
          onDismissLost={() => void dismissLost(did, did)}
        />
      )}
    </form>
  );
}

function SaveStatus({
  result,
  status,
  lost,
  onDismissLost,
}: {
  result: SaveOutcome | undefined;
  status: ReturnType<typeof useProfileDisplay>["status"];
  lost: boolean;
  onDismissLost: () => void;
}) {
  if (lost) {
    return (
      <Banner tone="danger" role="alert" onDismiss={onDismissLost}>
        Your last change wasn't saved. Please make it again.
      </Banner>
    );
  }
  if (status === "checking") {
    return <Text tone="muted">Checking whether your last change was saved…</Text>;
  }
  if (!result) return null;
  if (!result.ok) {
    return (
      <Banner tone={result.reason === "unknown" ? "info" : "danger"} role="alert">
        {result.message}
      </Banner>
    );
  }
  if (!result.durable) {
    return (
      <Banner tone="warning" role="status">
        Saved. This browser couldn't keep a copy, so until your public profile updates a reload may
        briefly show the previous version.
      </Banner>
    );
  }
  return (
    <Text tone="muted" role="status">
      {status === "syncing" ? "Saved. Your public profile will show the change shortly." : "Saved."}
    </Text>
  );
}
