// The new-activity form's checks, shared by the form and the action that
// publishes it, so both apply the same ones: each field's schema from the
// lexicon (lib/lexicon-fields), and the few rules the lexicon doesn't have
// (with lib/form-rules, which New project shares).

import * as activity from "@hypercerts-org/lexicon/org/hypercerts/claim/activity";
import * as defs from "@hypercerts-org/lexicon/org/hypercerts/defs";
import { blobLimits, fieldOf, lexiconValidator } from "@/lib/lexicon-fields";

/** The lexicon's schema for each text field of the form. */
export const fieldSchemas = {
  title: fieldOf(activity.main.schema, "title"),
  shortDescription: fieldOf(activity.main.schema, "shortDescription"),
  description: fieldOf(defs.descriptionString.schema, "value"),
  workScope: fieldOf(activity.workScopeString.schema, "scope"),
  identity: fieldOf(activity.contributorIdentity.schema, "identity"),
  role: fieldOf(activity.contributorRole.schema, "role"),
  share: fieldOf(activity.contributor.schema, "contributionWeight"),
};

type FieldName = keyof typeof fieldSchemas;

/** Each text field's check against its schema: undefined, or what is wrong. */
export const checkField = Object.fromEntries(
  Object.entries(fieldSchemas).map(([name, schema]) => [name, lexiconValidator(schema)]),
) as Record<FieldName, ReturnType<typeof lexiconValidator>>;

/** The image's accepted types and largest size. */
export const imageLimits = blobLimits(fieldOf(defs.smallImage.schema, "image"));

/** A contributor's share: a positive decimal, such as 1 or 0.25 (the SDK's rule). */
export function isShare(text: string): boolean {
  return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0;
}

/** An account given by its handle (alice.example.com, @alice.bsky.social). */
export function looksLikeHandle(text: string): boolean {
  return /^@?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i.test(text.trim());
}

/** Dates as the form holds them (YYYY-MM-DD): the end may not come before the start. */
export function datesInOrder(start: string, end: string): boolean {
  return !start || !end || start <= end;
}
