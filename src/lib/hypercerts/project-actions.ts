"use server";

// Publishing a new project (an org.hypercerts.collection of type "project"),
// to the user's own repository or (through CGS) an organization's they belong
// to, with the Hypercerts SDK. The form checks the same rules as it goes
// (components/project-form); they are checked again here, as the arguments
// come from the browser.

import { createProject } from "@hypercerts-org/sdk/project";
import { updateTag } from "next/cache";
import { projectHref } from "@/components/cards";
import { getOAuthSession } from "@/lib/auth/dal";
import { titleProblem } from "@/lib/form-rules";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { mayPublish } from "@/lib/hypercerts/publish-access";
import { projectIndexed } from "@/lib/hypercerts/queries";
import { sdkContext, type WriteFailure, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import { bannerLimits, checkProjectField, shortDescriptionProblem } from "@/lib/project-rules";
import { isDid } from "@/lib/validate";

/** The form's values. `activities`: URIs of the account's own activities to put in it. */
export type ProjectDraft = {
  title: string;
  shortDescription: string;
  description: string;
  /** A File in the browser; it may reach the server as a plain Blob. */
  banner: Blob | null;
  activities: string[];
};

/** `fields`: messages for the fields at fault, by the form's field names. */
export type PublishProjectResult =
  | { ok: true; href: string; indexed: boolean }
  | { ok: false; message: string; fields?: Record<string, string> };

const MESSAGES: Record<WriteFailure | "signed-out", string> = {
  "signed-out": "Your session has ended. Sign in again to publish.",
  forbidden: "You can't publish for this account. Check that you're still a member.",
  invalid: "The project couldn't be published as entered.",
  unknown:
    "We couldn't confirm whether the project was published. Check your workspace before trying again.",
  unavailable:
    "The project couldn't be published right now. Your draft is still here; please try again.",
};

const fail = (reason: keyof typeof MESSAGES, fields?: Record<string, string>) => ({
  ok: false as const,
  message: MESSAGES[reason],
  fields,
});

const isText = (value: unknown): value is string => typeof value === "string";

function wellFormed(draft: unknown): draft is ProjectDraft {
  const d = draft as ProjectDraft | null;
  return (
    !!d &&
    [d.title, d.shortDescription, d.description].every(isText) &&
    Array.isArray(d.activities) &&
    d.activities.length <= 1000 &&
    d.activities.every(isText) &&
    (d.banner === null || d.banner instanceof Blob)
  );
}

/** What is wrong with the draft, by field, before anything is written. */
function problems(repo: string, draft: ProjectDraft): Record<string, string> {
  const fields: Record<string, string> = {};
  const add = (name: string, message: string | undefined) => {
    if (message && !fields[name]) fields[name] = message;
  };
  add("title", titleProblem(draft.title, checkProjectField.title));
  add("shortDescription", shortDescriptionProblem(draft.shortDescription, draft.activities.length));
  add("description", checkProjectField.description({ value: draft.description.trim() }));
  // Only the account's own activities are offered.
  const own = `at://${repo}/org.hypercerts.claim.activity/`;
  if (draft.activities.some((uri) => !uri.startsWith(own))) {
    add("activities", "Choose from this account's activities.");
  }
  if (draft.banner) {
    if (bannerLimits.accept.length > 0 && !bannerLimits.accept.includes(draft.banner.type)) {
      add("banner", "Use a JPEG, PNG or WebP image.");
    } else if (bannerLimits.maxSize !== null && draft.banner.size > bannerLimits.maxSize) {
      add("banner", "The image is too large.");
    }
  }
  return fields;
}

/**
 * Publishes `draft` as a new project of account `repo`, waits for the index
 * to show it, and expires the pages it changes. With no activities chosen,
 * the SDK makes one from the project. Never retried automatically.
 */
export async function publishProject(
  repo: string,
  draft: ProjectDraft,
): Promise<PublishProjectResult> {
  if (!isText(repo) || !isDid(repo) || !wellFormed(draft)) return fail("invalid");
  const fields = problems(repo, draft);
  if (Object.keys(fields).length > 0) return fail("invalid", fields);

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out");
    if (!(await mayPublish(session.did, repo))) return fail("forbidden");

    const text = (value: string) => value.trim() || undefined;
    const created = await createProject(
      sdkContext(session),
      {
        title: draft.title.trim(),
        shortDescription: text(draft.shortDescription),
        description: text(draft.description),
        banner: draft.banner ?? undefined,
        activities: draft.activities.map((uri) => ({ activity: { uri } })),
      },
      writeTo(session, repo),
    );

    const indexed = await waitForIndex(() => projectIndexed(created.uri));
    // The account's projects and activities (a default activity may be new),
    // its profile feed, and Explore's lists.
    updateTag(tags.projects(repo));
    updateTag(tags.activities(repo));
    updateTag(tags.actor(repo));
    updateTag(tags.explore());
    const [, , , , rkey] = created.uri.split("/");
    return { ok: true, href: projectHref({ authorDid: repo, rkey }), indexed };
  } catch (err) {
    return fail(writeFailure(err, "publish project"));
  }
}
