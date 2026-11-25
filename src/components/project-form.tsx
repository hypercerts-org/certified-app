"use client";

// The project form, for a new project or (`editing`) an existing one. A
// project groups activities, like a folder; it is an org.hypercerts.collection
// of type "project". Its fields are validated with their schemas from the
// lexicon and the rules shared with the server (lib/project-rules,
// lib/form-rules), on the fields and publish flow the activity form uses
// (record-form). A new project without activities chosen starts with one
// activity made from it (the SDK's rule), so its short description is then
// required.

import { Checkbox, ErrorMessage, Heading, SearchInput, Text } from "@hypercerts-org/ui-react";
import { useState } from "react";
import { LocationField } from "@/components/location-picker";
import { KeptField, useRecordForm } from "@/components/record-form";
import { TITLE_MIN, titleProblem } from "@/lib/form-rules";
import { type ProjectDraft, publishProject } from "@/lib/hypercerts/project-actions";
import type { SavedPlace } from "@/lib/hypercerts/queries";
import { imageProblem } from "@/lib/image-choice";
import { textLimit } from "@/lib/lexicon-fields";
import { locationProblem } from "@/lib/location-choice";
import {
  bannerLimits,
  checkProjectField,
  projectSchemas,
  shortDescriptionProblem,
} from "@/lib/project-rules";

const titleLimit = textLimit(projectSchemas.title);
const summaryLimit = textLimit(projectSchemas.shortDescription)?.max;

const EMPTY: ProjectDraft = {
  title: "",
  shortDescription: "",
  description: "",
  banner: null,
  activities: [],
  location: null,
};

const LABELS: Record<string, string> = {
  title: "Title",
  shortDescription: "Short description",
  description: "Description",
  banner: "Banner",
  activities: "Activities",
  location: "Location",
};
const labelOf = (name: string) => LABELS[name] ?? name;

/** An existing project to edit: its record, the version read, and its values. */
export type ProjectEditing = {
  uri: string;
  cid: string;
  initial: ProjectDraft;
  /** The description is in another app's format, kept as stored. */
  keptDescription: boolean;
};

/** One of the account's activities, as the picker lists it. */
export type ActivityChoice = { uri: string; title: string; meta: string };

/** With more activities than this, the picker gets a search field. */
const SEARCH_FROM = 8;

/**
 * A new project for account `repo` (the workspace's): the user's own, or an
 * organization's; or, with `editing`, one of its projects. `activities` are
 * the account's own, to choose from; `cancelHref` is where Cancel leads.
 */
export function ProjectForm({
  repo,
  activities,
  places,
  cancelHref,
  editing,
}: {
  repo: string;
  activities: ActivityChoice[];
  /** The account's published places, to pick again. */
  places: SavedPlace[];
  cancelHref: string;
  editing?: ProjectEditing;
}) {
  const { form, formProps, failure } = useRecordForm({
    defaultValues: editing?.initial ?? EMPTY,
    // Editing can't save yet (its Save is disabled): Enter in a field lands here.
    publish: (values) =>
      editing
        ? Promise.resolve({ ok: false as const, message: "Saving changes is coming soon." })
        : publishProject(repo, values),
    labelOf,
    lost: "We couldn't confirm whether the project was published. Check your workspace before trying again.",
  });
  // An existing project gets no default activity: its short description stays optional.
  const activityCount = (chosen: number) => (editing ? 1 : chosen);

  return (
    <form {...formProps} className="record-form">
      {/* The fields read the form's state (was Publish pressed?) from here. */}
      <form.AppForm>
        <div className="record-form-columns">
          <div className="record-form-main">
            <form.AppField
              name="title"
              validators={{
                onDynamic: ({ value }) => titleProblem(value, checkProjectField.title),
              }}
            >
              {(field) => (
                <field.TextField
                  label="Title"
                  description={`At least ${TITLE_MIN} characters.`}
                  limit={titleLimit?.unit === "graphemes" ? titleLimit.max : undefined}
                />
              )}
            </form.AppField>

            <form.AppField
              name="shortDescription"
              validators={{
                onChangeListenTo: ["activities"],
                onDynamic: ({ value, fieldApi }) =>
                  shortDescriptionProblem(
                    value,
                    activityCount(fieldApi.form.getFieldValue("activities").length),
                  ),
              }}
            >
              {(field) => (
                <field.TextField
                  label="Short description"
                  description="What the project is about, in a sentence or two."
                  rows={3}
                  limit={summaryLimit}
                />
              )}
            </form.AppField>

            {editing?.keptDescription ? (
              <KeptField label="Description">
                Written in another app's format, so it can't be changed here. It stays as it is.
              </KeptField>
            ) : (
              <form.AppField
                name="description"
                validators={{
                  onDynamic: ({ value }) => checkProjectField.description({ value: value.trim() }),
                }}
              >
                {(field) => (
                  <field.TextField
                    label="Description (optional)"
                    description="Its goals, who is involved, where it stands."
                    rows={10}
                  />
                )}
              </form.AppField>
            )}

            <form.AppField name="activities">
              {(field) => (
                <ActivityPicker
                  choices={activities}
                  chosen={field.state.value}
                  onChange={(next) => field.handleChange(next)}
                  error={field.state.meta.errors.find(Boolean) as string | undefined}
                  editing={Boolean(editing)}
                />
              )}
            </form.AppField>
          </div>

          <aside className="record-form-details" aria-label="Details">
            <form.AppField
              name="banner"
              validators={{ onDynamic: ({ value }) => imageProblem(value, bannerLimits) }}
            >
              {(field) => <field.ImageField label="Banner (optional)" limits={bannerLimits} />}
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
                />
              )}
            </form.AppField>
          </aside>
        </div>

        <form.PublishBar
          label={editing ? "Save changes" : "Publish project"}
          cancelHref={cancelHref}
          failure={failure}
          editing={Boolean(editing)}
        />
      </form.AppForm>
    </form>
  );
}

/**
 * The account's activities to put in the project, as checkboxes; with many,
 * a search narrows them. With none chosen, a new project gets one made from
 * it (`editing`: an existing one simply holds none).
 */
function ActivityPicker({
  choices,
  chosen,
  onChange,
  error,
  editing,
}: {
  choices: ActivityChoice[];
  chosen: string[];
  onChange: (next: string[]) => void;
  error: string | undefined;
  editing: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? choices.filter((choice) => choice.title.toLowerCase().includes(q)) : choices;
  const toggle = (uri: string, on: boolean) =>
    onChange(on ? [...chosen, uri] : chosen.filter((item) => item !== uri));

  return (
    <section className="record-form-section" aria-labelledby="activities-heading">
      <div className="section-heading">
        <Heading level={2} size="heading" id="activities-heading">
          Activities
          {chosen.length > 0 && <span className="profile-section-count"> {chosen.length}</span>}
        </Heading>
        <Text tone="muted">
          {editing
            ? "The work the project holds."
            : choices.length > 0
              ? "The work the project holds. Choose none, and it starts with one activity made from the project."
              : "The project starts with one activity made from it. Add more later."}
        </Text>
      </div>
      {choices.length > SEARCH_FROM && (
        <SearchInput
          label="Search your activities"
          value={query}
          debounceMs={0}
          onChange={setQuery}
        />
      )}
      {choices.length > 0 && (
        <ul className="activity-choices">
          {shown.map((choice) => (
            <li key={choice.uri}>
              <Checkbox
                label={choice.title}
                description={choice.meta}
                checked={chosen.includes(choice.uri)}
                onChange={(event) => toggle(choice.uri, event.target.checked)}
              />
            </li>
          ))}
          {shown.length === 0 && (
            <li>
              <Text tone="muted">No activities match "{query.trim()}".</Text>
            </li>
          )}
        </ul>
      )}
      {error && <ErrorMessage live>{error}</ErrorMessage>}
    </section>
  );
}
