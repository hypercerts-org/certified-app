"use server";

// Publishing a new activity, to the user's own repository or (through CGS) an
// organization's they belong to, with the Hypercerts SDK. The form checks the
// same rules as it goes (components/activity-form); they are checked again
// here, as the arguments come from the browser.

import { createActivity } from "@hypercerts-org/sdk/activity";
import { updateTag } from "next/cache";
import { activityHref } from "@/components/cards";
import {
  checkField,
  datesInOrder,
  imageLimits,
  isShare,
  looksLikeHandle,
} from "@/lib/activity-rules";
import { getOAuthSession } from "@/lib/auth/dal";
import { titleProblem } from "@/lib/form-rules";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { mayPublish } from "@/lib/hypercerts/publish-access";
import { activityIndexed } from "@/lib/hypercerts/queries";
import { sdkContext, type WriteFailure, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import { getDid } from "@/lib/identity";
import { isDid } from "@/lib/validate";

export type ContributorDraft = { identity: string; role: string; share: string };

/** The form's values. Dates are YYYY-MM-DD; empty strings are left out of the record. */
export type ActivityDraft = {
  title: string;
  shortDescription: string;
  description: string;
  startDate: string;
  endDate: string;
  workScope: string;
  contributors: ContributorDraft[];
  /** A File in the browser; it may reach the server as a plain Blob. */
  image: Blob | null;
};

/** `fields`: messages for the fields at fault, by the form's field names. */
export type PublishActivityResult =
  | { ok: true; href: string; indexed: boolean }
  | { ok: false; message: string; fields?: Record<string, string> };

const check = checkField;
const image = imageLimits;

const MESSAGES: Record<WriteFailure | "signed-out", string> = {
  "signed-out": "Your session has ended. Sign in again to publish.",
  forbidden: "You can't publish for this account. Check that you're still a member.",
  invalid: "The activity couldn't be published as entered.",
  unknown:
    "We couldn't confirm whether the activity was published. Check your workspace before trying again.",
  unavailable:
    "The activity couldn't be published right now. Your draft is still here; please try again.",
};

const fail = (reason: keyof typeof MESSAGES, fields?: Record<string, string>) => ({
  ok: false as const,
  message: MESSAGES[reason],
  fields,
});

const isText = (value: unknown): value is string => typeof value === "string";

/** What is wrong with the draft, by field, before anything is written. */
function problems(draft: ActivityDraft): Record<string, string> {
  const fields: Record<string, string> = {};
  const add = (name: string, message: string | undefined) => {
    if (message && !fields[name]) fields[name] = message;
  };
  add("title", titleProblem(draft.title, check.title));
  const summary = draft.shortDescription.trim();
  add(
    "shortDescription",
    summary ? check.shortDescription({ value: summary }) : "Add a short description.",
  );
  add("description", check.description({ value: draft.description.trim() }));
  add("workScope", check.workScope({ value: draft.workScope.trim() }));
  add(
    "endDate",
    datesInOrder(draft.startDate, draft.endDate) ? undefined : "The end can't be before the start.",
  );
  draft.contributors.forEach((row, i) => {
    const identity = row.identity.trim();
    add(
      `contributors[${i}].identity`,
      identity ? check.identity({ value: identity }) : "Name the contributor, or remove the row.",
    );
    add(`contributors[${i}].role`, check.role({ value: row.role.trim() }));
    const share = row.share.trim();
    add(
      `contributors[${i}].share`,
      share && !isShare(share) ? "Use a number above 0." : check.share({ value: share }),
    );
  });
  if (draft.image) {
    if (image.accept.length > 0 && !image.accept.includes(draft.image.type))
      add("image", "Use a JPEG, PNG or WebP image.");
    else if (image.maxSize !== null && draft.image.size > image.maxSize)
      add("image", "The image is too large.");
  }
  return fields;
}

function wellFormed(draft: unknown): draft is ActivityDraft {
  const d = draft as ActivityDraft | null;
  return (
    !!d &&
    [d.title, d.shortDescription, d.description, d.startDate, d.endDate, d.workScope].every(
      isText,
    ) &&
    Array.isArray(d.contributors) &&
    d.contributors.length <= 100 &&
    d.contributors.every((c) => c && isText(c.identity) && isText(c.role) && isText(c.share)) &&
    (d.image === null || d.image instanceof Blob) &&
    [d.startDate, d.endDate].every((date) => date === "" || /^\d{4}-\d{2}-\d{2}$/.test(date))
  );
}

/** A contributor's identity as stored: an account's DID (resolved from a handle), or a name. */
async function identityOf(text: string): Promise<string | null> {
  if (text.startsWith("did:")) return isDid(text) ? text : null;
  if (looksLikeHandle(text)) return getDid(text.replace(/^@/, ""));
  return text;
}

/**
 * Publishes `draft` as a new activity of account `repo`, waits for the index
 * to show it, and expires the pages it changes. Never retried automatically.
 */
export async function publishActivity(
  repo: string,
  draft: ActivityDraft,
): Promise<PublishActivityResult> {
  if (!isText(repo) || !isDid(repo) || !wellFormed(draft)) return fail("invalid");
  const fields = problems(draft);
  if (Object.keys(fields).length > 0) return fail("invalid", fields);

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out");
    if (!(await mayPublish(session.did, repo))) return fail("forbidden");

    const contributors = [];
    for (const [i, row] of draft.contributors.entries()) {
      const identity = await identityOf(row.identity.trim());
      if (!identity) {
        return fail("invalid", { [`contributors[${i}].identity`]: "No account has this handle." });
      }
      const role = row.role.trim();
      const share = row.share.trim();
      contributors.push({
        identity: { inline: identity },
        ...(role && { details: { inline: role } }),
        ...(share && { weight: share }),
      });
    }

    const text = (value: string) => value.trim() || undefined;
    const date = (value: string) => (value ? `${value}T00:00:00Z` : undefined);
    const created = await createActivity(
      sdkContext(session),
      {
        title: draft.title.trim(),
        shortDescription: draft.shortDescription.trim(),
        description: text(draft.description),
        workScope: text(draft.workScope),
        startDate: date(draft.startDate),
        endDate: date(draft.endDate),
        image: draft.image ?? undefined,
        contributors: contributors.length > 0 ? contributors : undefined,
      },
      writeTo(session, repo),
    );

    const indexed = await waitForIndex(() => activityIndexed(created.uri));
    // The account's activities, its profile feed, and Explore's lists.
    updateTag(tags.activities(repo));
    updateTag(tags.actor(repo));
    updateTag(tags.explore());
    return { ok: true, href: activityHref(created.uri), indexed };
  } catch (err) {
    return fail(writeFailure(err, "publish activity"));
  }
}
