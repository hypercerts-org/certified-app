"use client";

// The activity form, for a new activity or (`editing`) an existing one. Each
// field is validated with its own schema from the lexicon, the one the SDK
// checks the record with, and the limits it shows come from there too; the
// few rules the lexicon doesn't have are shared with the server
// (lib/activity-rules, lib/form-rules). The fields and the publish flow are
// the ones the project form uses (record-form).

import { Button, Field, Heading, Text } from "@hypercerts-org/ui-react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { ActorPicker } from "@/components/actor-picker";
import { LocationField } from "@/components/location-picker";
import { KeptField, useRecordForm } from "@/components/record-form";
import { checkField, datesInOrder, fieldSchemas, imageLimits, isShare } from "@/lib/activity-rules";
import { TITLE_MIN, titleProblem } from "@/lib/form-rules";
import {
  type ActivityDraft,
  type ContributorDraft,
  publishActivity,
} from "@/lib/hypercerts/activity-actions";
import type { SavedPlace } from "@/lib/hypercerts/queries";
import type { Kept } from "@/lib/hypercerts/record-drafts";
import { imageProblem } from "@/lib/image-choice";
import { textLimit } from "@/lib/lexicon-fields";
import { locationProblem } from "@/lib/location-choice";

const summaryLimit = textLimit(fieldSchemas.shortDescription)?.max;

const EMPTY: ActivityDraft = {
  title: "",
  shortDescription: "",
  description: "",
  startDate: "",
  endDate: "",
  workScope: "",
  contributors: [],
  image: null,
  location: null,
};

/** An existing activity to edit: its record, the version read, and its values. */
export type ActivityEditing = {
  uri: string;
  cid: string;
  initial: ActivityDraft;
  /** What the form can't show, kept as stored. */
  kept: Kept;
};

const NO_CONTRIBUTOR: ContributorDraft = { identity: "", role: "", share: "" };

/** Field names as the form and the server name them, as the summary of problems says them. */
const LABELS: Record<string, string> = {
  title: "Title",
  shortDescription: "Short description",
  description: "Description",
  image: "Image",
  endDate: "Time period",
  workScope: "Work scope",
  location: "Location",
};
const labelOf = (name: string) =>
  LABELS[name] ?? (name.startsWith("contributors") ? "Contributors" : name);

/**
 * A new activity for account `repo` (the workspace's): the user's own, or an
 * organization's; or, with `editing`, one of its activities. `self` is how
 * "Add …" names that account among the contributors (its handle, else its
 * DID), `selfName` how the button says it for an organization (null: the
 * user's own, "Add yourself"); `cancelHref` where Cancel leads.
 */
export function ActivityForm({
  repo,
  self,
  selfName,
  places,
  cancelHref,
  editing,
}: {
  repo: string;
  self: string;
  selfName: string | null;
  /** The account's published places, to pick again. */
  places: SavedPlace[];
  cancelHref: string;
  editing?: ActivityEditing;
}) {
  const kept = editing?.kept;
  const { form, formProps, failure } = useRecordForm({
    defaultValues: editing?.initial ?? EMPTY,
    // Editing can't save yet (its Save is disabled): Enter in a field lands here.
    publish: (values) =>
      editing
        ? Promise.resolve({ ok: false as const, message: "Saving changes is coming soon." })
        : publishActivity(repo, values),
    labelOf,
    lost: "We couldn't confirm whether the activity was published. Check your workspace before trying again.",
  });

  return (
    <form {...formProps} className="record-form">
      {/* The fields read the form's state (was Publish pressed?) from here. */}
      <form.AppForm>
        <div className="record-form-columns">
          <div className="record-form-main">
            <form.AppField
              name="title"
              validators={{ onDynamic: ({ value }) => titleProblem(value, checkField.title) }}
            >
              {(field) => (
                <field.TextField label="Title" description={`At least ${TITLE_MIN} characters.`} />
              )}
            </form.AppField>

            <form.AppField
              name="shortDescription"
              validators={{
                onDynamic: ({ value }) =>
                  value.trim()
                    ? checkField.shortDescription({ value: value.trim() })
                    : "Add a short description.",
              }}
            >
              {(field) => (
                <field.TextField
                  label="Short description"
                  description="What was done, in two or three sentences."
                  rows={3}
                  limit={summaryLimit}
                />
              )}
            </form.AppField>

            {kept?.description ? (
              <KeptField label="Description">
                Written in another app's format, so it can't be changed here. It stays as it is.
              </KeptField>
            ) : (
              <form.AppField
                name="description"
                validators={{
                  onDynamic: ({ value }) => checkField.description({ value: value.trim() }),
                }}
              >
                {(field) => (
                  <field.TextField
                    label="Description (optional)"
                    description="The full story: goals, how it went, what came of it."
                    rows={10}
                  />
                )}
              </form.AppField>
            )}

            <form.AppField name="contributors" mode="array">
              {(list) => (
                <section className="record-form-section" aria-labelledby="contributors-heading">
                  <div className="section-heading">
                    <Heading level={2} size="heading" id="contributors-heading">
                      Contributors
                    </Heading>
                    <Text tone="muted">
                      Who did the work: an account by its handle (such as alice.bsky.social), or
                      anyone by name. Role and share are optional.
                    </Text>
                  </div>
                  {list.state.value.length > 0 && (
                    <ul className="contributor-rows divided">
                      {list.state.value.map((_, i) => (
                        // Rows have no identity of their own until filled in.
                        // biome-ignore lint/suspicious/noArrayIndexKey: TanStack Form addresses array rows by index
                        <li key={i} className="contributor-row">
                          <form.AppField
                            name={`contributors[${i}].identity`}
                            validators={{
                              onDynamic: ({ value }) =>
                                value.trim()
                                  ? checkField.identity({ value: value.trim() })
                                  : "Name the contributor, or remove the row.",
                            }}
                          >
                            {(field) => {
                              const err = field.state.meta.errors.find(Boolean) as
                                | string
                                | undefined;
                              return (
                                <Field label="Contributor" error={err}>
                                  {(wiring) => (
                                    <ActorPicker
                                      {...wiring}
                                      value={field.state.value}
                                      onChange={(next) => field.handleChange(next)}
                                      onBlur={field.handleBlur}
                                      placeholder="@handle or full name"
                                    />
                                  )}
                                </Field>
                              );
                            }}
                          </form.AppField>
                          <form.AppField
                            name={`contributors[${i}].role`}
                            validators={{
                              onDynamic: ({ value }) => checkField.role({ value: value.trim() }),
                            }}
                          >
                            {(field) => <field.TextField label="Role" />}
                          </form.AppField>
                          <form.AppField
                            name={`contributors[${i}].share`}
                            validators={{
                              onDynamic: ({ value }) => {
                                const share = value.trim();
                                if (share && !isShare(share)) return "Use a number above 0.";
                                return checkField.share({ value: share });
                              },
                            }}
                          >
                            {(field) => (
                              <field.TextField
                                label="Share"
                                inputMode="decimal"
                                className="contributor-share"
                              />
                            )}
                          </form.AppField>
                          {/* Placed by its own box: the toolkit wraps an icon button in a tooltip. */}
                          <div className="contributor-remove">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove contributor ${i + 1}`}
                              onClick={() => list.removeValue(i)}
                            >
                              <Trash2 size={16} aria-hidden />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {kept && kept.contributors > 0 && (
                    <Text size="body-sm" tone="muted">
                      {kept.contributors === 1
                        ? "One more contributor is linked as a record of its own, and stays as it is."
                        : `${kept.contributors} more contributors are linked as records of their own, and stay as they are.`}
                    </Text>
                  )}
                  <div className="record-form-row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => list.pushValue({ ...NO_CONTRIBUTOR })}
                    >
                      <Plus size={16} aria-hidden />
                      Add contributor
                    </Button>
                    {!list.state.value.some((row) => row.identity.trim() === self) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => list.pushValue({ ...NO_CONTRIBUTOR, identity: self })}
                      >
                        <UserPlus size={16} aria-hidden />
                        {selfName ? `Add ${selfName}` : "Add yourself"}
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </form.AppField>
          </div>

          <aside className="record-form-details" aria-label="Details">
            <form.AppField
              name="image"
              validators={{ onDynamic: ({ value }) => imageProblem(value, imageLimits) }}
            >
              {(field) => <field.ImageField label="Image (optional)" limits={imageLimits} />}
            </form.AppField>

            <form.AppField
              name="location"
              validators={{ onDynamic: ({ value }) => locationProblem(value, repo) }}
            >
              {(field) => (
                <LocationField
                  label="Location (optional)"
                  value={field.state.value}
                  onChange={(next) => field.handleChange(next)}
                  saved={places}
                  error={field.state.meta.errors.find(Boolean) as string | undefined}
                  note={
                    kept && kept.locations > 0
                      ? `${kept.locations === 1 ? "One more location stays" : `${kept.locations} more locations stay`} as they are.`
                      : undefined
                  }
                />
              )}
            </form.AppField>

            <fieldset className="record-form-period">
              <legend className="record-form-legend">Time period (optional)</legend>
              <form.AppField name="startDate">
                {(field) => <field.DateField label="Start" />}
              </form.AppField>
              <form.AppField
                name="endDate"
                validators={{
                  onChangeListenTo: ["startDate"],
                  onDynamic: ({ value, fieldApi }) =>
                    datesInOrder(fieldApi.form.getFieldValue("startDate"), value)
                      ? undefined
                      : "The end can't be before the start.",
                }}
              >
                {(field) => <field.DateField label="End" />}
              </form.AppField>
            </fieldset>

            {kept?.workScope ? (
              <KeptField label="Work scope">
                Written as an expression, so it can't be changed here. It stays as it is.
              </KeptField>
            ) : (
              <form.AppField
                name="workScope"
                validators={{
                  onDynamic: ({ value }) => checkField.workScope({ value: value.trim() }),
                }}
              >
                {(field) => (
                  <field.TextField
                    label="Work scope (optional)"
                    description="The kinds of work, such as reforestation or code review."
                  />
                )}
              </form.AppField>
            )}
          </aside>
        </div>

        <form.PublishBar
          label={editing ? "Save changes" : "Publish activity"}
          cancelHref={cancelHref}
          failure={failure}
          editing={Boolean(editing)}
        />
      </form.AppForm>
    </form>
  );
}
