// The new-project form's checks, shared by the form and the action that
// publishes it: each field's schema from the lexicon (a project is an
// org.hypercerts.collection of type "project"), and the rules beyond it
// (lib/form-rules).

import * as collection from "@hypercerts-org/lexicon/org/hypercerts/collection";
import * as defs from "@hypercerts-org/lexicon/org/hypercerts/defs";
import { blobLimits, fieldOf, lexiconValidator } from "@/lib/lexicon-fields";

/** The lexicon's schema for each text field of the form. */
export const projectSchemas = {
  title: fieldOf(collection.main.schema, "title"),
  shortDescription: fieldOf(collection.main.schema, "shortDescription"),
  description: fieldOf(defs.descriptionString.schema, "value"),
};

/** Each text field's check against its schema: undefined, or what is wrong. */
export const checkProjectField = {
  title: lexiconValidator(projectSchemas.title),
  shortDescription: lexiconValidator(projectSchemas.shortDescription),
  description: lexiconValidator(projectSchemas.description),
};

/** The banner's accepted types and largest size. */
export const bannerLimits = blobLimits(fieldOf(defs.largeImage.schema, "image"));

/**
 * What is wrong with the short description. A project published with none of
 * the account's activities starts with one made from it (the SDK's rule, so
 * the project shows in other apps), and an activity needs a short description.
 */
export function shortDescriptionProblem(text: string, activities: number): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return activities === 0
      ? "Add a short description, or choose activities for the project."
      : undefined;
  }
  return checkProjectField.shortDescription({ value: trimmed });
}
