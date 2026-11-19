"use client";

import { Banner, Button, Field, Input, Skeleton, Text, Textarea } from "@hypercerts-org/ui-react";
import { type FormEvent, useState } from "react";
import type { SaveProfileResult } from "@/lib/hypercerts/actions";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import { useSaveProfile } from "@/lib/write-overlay/use-profile";

const NO_PROFILE: ProfileFields = { displayName: "", description: "" };

/**
 * Edits profile `did`'s display name and description: the signed-in user's
 * own, or an organization's they manage. `current` is the profile as its PDS
 * had it when the page was rendered (null: none yet). The form is disabled
 * while a save waits for the PDS to confirm it. Each save is based on the
 * newest version known here (the last save's, or the page's) and is refused
 * if the profile changed elsewhere in the meantime.
 */
export function ProfileForm({ did, current }: { did: string; current: ProfileVersion | null }) {
  const initial = current ?? NO_PROFILE;
  const [fields, setFields] = useState<ProfileFields>({
    displayName: initial.displayName,
    description: initial.description,
  });
  const [baseCid, setBaseCid] = useState(current?.cid ?? null);
  const save = useSaveProfile();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    save.mutate(
      { repo: did, fields, expectedCid: baseCid },
      { onSuccess: (result) => result.ok && setBaseCid(result.saved.cid) },
    );
  }

  const set = (name: keyof ProfileFields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  return (
    <form onSubmit={submit} className="profile-form" aria-busy={save.isPending}>
      {/* Disables every field while saving; the legend names the group. */}
      <fieldset disabled={save.isPending} className="stack">
        <legend className="visually-hidden">Profile</legend>
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
        <Field label="Description" description="A short introduction shown on the profile page.">
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
        {!save.isPending && save.data && <SaveStatus result={save.data} />}
      </fieldset>
    </form>
  );
}

function SaveStatus({ result }: { result: SaveProfileResult }) {
  if (!result.ok) {
    return (
      <Banner tone={result.reason === "unknown" ? "warning" : "danger"} role="alert">
        {result.message}
      </Banner>
    );
  }
  return (
    <Text tone="muted" role="status">
      Saved. The public profile will show the change shortly.
    </Text>
  );
}

/** The form on its way: its two fields and the button, in place. */
export function ProfileFormSkeleton() {
  return (
    <div className="stack" aria-hidden>
      <Skeleton variant="line" className="skeleton-label" />
      <Skeleton variant="box" className="skeleton-input" />
      <Skeleton variant="line" className="skeleton-label" />
      <Skeleton variant="box" className="skeleton-textarea" />
      <Skeleton variant="box" className="skeleton-button" />
    </div>
  );
}
