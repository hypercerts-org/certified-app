"use client";

import { Banner, Button, Field, Input, Text, Textarea } from "@hypercerts-org/ui-react";
import { type FormEvent, useState } from "react";
import type { ProfileFields } from "@/lib/hypercerts/views";
import { useProfileDisplay, useSaveProfile } from "@/lib/writes/use-profile";

/**
 * Edits the signed-in user's display name and description. `initial` and
 * `cid` are the profile as the PDS has it; each save is based on that version
 * and refused if the profile changed elsewhere in the meantime.
 */
export function ProfileForm({
  did,
  initial,
  cid,
}: {
  did: string;
  initial: ProfileFields;
  cid: string | null;
}) {
  const [fields, setFields] = useState(initial);
  const [expectedCid, setExpectedCid] = useState(cid);
  const save = useSaveProfile(did);
  const display = useProfileDisplay(did, initial);
  const result = save.data;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(
      { fields, expectedCid },
      { onSuccess: (outcome) => outcome.ok && setExpectedCid(outcome.saved.cid) },
    );
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
      <Button type="submit" loading={save.isPending}>
        Save
      </Button>
      <SaveStatus
        result={result}
        status={display.status}
        lost={display.lost}
        pending={save.isPending}
      />
    </form>
  );
}

function SaveStatus({
  result,
  status,
  lost,
  pending,
}: {
  result: ReturnType<typeof useSaveProfile>["data"];
  status: ReturnType<typeof useProfileDisplay>["status"];
  lost: boolean;
  pending: boolean;
}) {
  if (pending) return null;
  if (lost) {
    return (
      <Banner tone="danger" role="alert">
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
  return (
    <Text tone="muted" role="status">
      {status === "syncing" ? "Saved. Your public profile will show the change shortly." : "Saved."}
    </Text>
  );
}
