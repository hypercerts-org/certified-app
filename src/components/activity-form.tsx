"use client";

// The new-activity form. Each field is validated with its own schema from the
// lexicon, the one the SDK checks the record with, and the limits it shows
// come from there too; the few rules the lexicon doesn't have are shared with
// the server (lib/activity-rules, lib/form-rules). The fields and the publish
// flow are the ones New project uses (record-form).

import { Button, Heading, Text } from "@hypercerts-org/ui-react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { useRecordForm } from "@/components/record-form";
import { checkField, datesInOrder, fieldSchemas, imageLimits, isShare } from "@/lib/activity-rules";
import { TITLE_MIN, titleProblem } from "@/lib/form-rules";
import {
  type ActivityDraft,
  type ContributorDraft,
  publishActivity,
} from "@/lib/hypercerts/activity-actions";
import { textLimit } from "@/lib/lexicon-fields";

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
};
const labelOf = (name: string) =>
  LABELS[name] ?? (name.startsWith("contributors") ? "Contributors" : name);

/**
 * A new activity for account `repo` (the workspace's): the user's own, or an
 * organization's. `self` is how "Add …" names that account among the
 * contributors (its handle, else its DID), `selfName` how the button says it
 * for an organization (null: the user's own, "Add yourself"); `cancelHref`
 * where Cancel leads.
 */
export function ActivityForm({
  repo,
  self,
  selfName,
  cancelHref,
}: {
  repo: string;
  self: string;
  selfName: string | null;
  cancelHref: string;
}) {
  const { form, formProps, failure } = useRecordForm({
    defaultValues: EMPTY,
    publish: (values) => publishActivity(repo, values),
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
                    <ul className="contributor-rows">
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
                            {(field) => <field.TextField label="Contributor" />}
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
              validators={{
                onDynamic: ({ value }) => {
                  if (!value) return undefined;
                  if (imageLimits.accept.length > 0 && !imageLimits.accept.includes(value.type)) {
                    return "Use a JPEG, PNG or WebP image.";
                  }
                  if (imageLimits.maxSize !== null && value.size > imageLimits.maxSize) {
                    return "The image is too large.";
                  }
                  return undefined;
                },
              }}
            >
              {(field) => <field.ImageField label="Image (optional)" limits={imageLimits} />}
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
          </aside>
        </div>

        <form.PublishBar label="Publish activity" cancelHref={cancelHref} failure={failure} />
      </form.AppForm>
    </form>
  );
}
