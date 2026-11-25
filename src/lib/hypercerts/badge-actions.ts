"use server";

// Workspace badge actions: creating badge definitions, awarding badges to
// accounts or records, and accepting or rejecting received badge awards — all
// written with @hypercerts-org/sdk/badge (personal PDS, or CGS for an
// organization). Each waits briefly for the index, then expires affected tags.

import * as badgeDefinition from "@hypercerts-org/lexicon/app/certified/badge/definition";
import { awardBadge, createBadgeDefinition, respondToBadgeAward } from "@hypercerts-org/sdk/badge";
import { updateTag } from "next/cache";
import { getOAuthSession } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { mayPublish } from "@/lib/hypercerts/publish-access";
import {
  badgeAwardIndexed,
  badgeDefinitionIndexed,
  getIndexedBadgeAwardResponse,
} from "@/lib/hypercerts/queries";
import { resolveAwardSubject } from "@/lib/hypercerts/resolve-target";
import { sdkContext, type WriteFailure, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import { collectionOf, didOf, safeUrl } from "@/lib/hypercerts/views";
import { fieldOf, lexiconValidator } from "@/lib/lexicon-fields";
import { badgeHref } from "@/lib/routes";
import { isAtUri, isDid } from "@/lib/validate";

export type BadgeActionFailure = {
  ok: false;
  reason: WriteFailure | "signed-out";
  message: string;
};

export type RespondBadgeResult =
  | { ok: true; response: "accepted" | "rejected"; indexed: boolean }
  | BadgeActionFailure;

export type CreateBadgeResult =
  | { ok: true; uri: string; href: string; indexed: boolean }
  | BadgeActionFailure;

export type AwardBadgeActionResult =
  | { ok: true; uri: string; indexed: boolean }
  | BadgeActionFailure;

const ALLOWED_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_ICON_BYTES = 1_048_576; // 1 MiB, per app.certified.badge.definition lexicon

const checkBadge = {
  title: lexiconValidator(fieldOf(badgeDefinition.main.schema, "title")),
  badgeType: lexiconValidator(fieldOf(badgeDefinition.main.schema, "badgeType")),
  description: lexiconValidator(fieldOf(badgeDefinition.main.schema, "description")),
};

/** Sniffs PNG, JPEG, or WebP magic bytes so uploads don't trust client MIME headers alone. */
function detectImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const MESSAGES: Record<
  "respond" | "create" | "award",
  Record<WriteFailure | "signed-out", string>
> = {
  respond: {
    "signed-out": "Your session has ended. Sign in again to respond to badges.",
    forbidden: "You can't respond to badges for this account.",
    invalid: "That badge response couldn't be saved.",
    unknown: "We couldn't confirm whether your response was saved. Reload to check.",
    unavailable: "Couldn't save your response right now. Please try again.",
  },
  create: {
    "signed-out": "Your session has ended. Sign in again to create a badge.",
    forbidden: "You can't create badges for this account.",
    invalid: "Check the badge details and try again.",
    unknown: "We couldn't confirm whether the badge was created. Reload to check.",
    unavailable: "Couldn't create the badge right now. Please try again.",
  },
  award: {
    "signed-out": "Your session has ended. Sign in again to award a badge.",
    forbidden: "This account isn't allowed to award this badge.",
    invalid: "Check the recipient and award details, then try again.",
    unknown: "We couldn't confirm whether the badge was awarded. Reload to check.",
    unavailable: "Couldn't award the badge right now. Please try again.",
  },
};

function fail(
  kind: keyof typeof MESSAGES,
  reason: WriteFailure | "signed-out",
  message = MESSAGES[kind][reason],
): BadgeActionFailure {
  return { ok: false, reason, message };
}

/** Accepts or rejects a received badge award for `repo`. */
export async function respondToBadge(
  repo: string,
  input: {
    awardUri: string;
    badgeUri?: string;
    response: "accepted" | "rejected";
  },
): Promise<RespondBadgeResult> {
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    typeof input?.awardUri !== "string" ||
    !isAtUri(input.awardUri) ||
    collectionOf(input.awardUri) !== "app.certified.badge.award" ||
    (input.response !== "accepted" && input.response !== "rejected")
  ) {
    return fail("respond", "invalid");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("respond", "signed-out");
    if (!(await mayPublish(session, repo))) return fail("respond", "forbidden");

    await respondToBadgeAward(
      await sdkContext(session),
      { award: { uri: input.awardUri }, response: input.response },
      writeTo(session, repo),
    );
    const indexed = await waitForIndex(
      async () => (await getIndexedBadgeAwardResponse(input.awardUri)) === input.response,
    );
    updateTag(tags.badges(repo));
    updateTag(tags.endorsements(repo));
    updateTag(tags.actor(repo));
    if (input.badgeUri && isAtUri(input.badgeUri)) {
      updateTag(tags.badge(input.badgeUri));
      const owner = didOf(input.badgeUri);
      if (owner && owner !== repo) updateTag(tags.badges(owner));
    }
    return { ok: true, response: input.response, indexed };
  } catch (err) {
    return fail("respond", writeFailure(err, "respond to badge"));
  }
}

/** Creates a new `app.certified.badge.definition` in `repo`. */
export async function createBadge(repo: string, formData: FormData): Promise<CreateBadgeResult> {
  if (typeof repo !== "string" || !isDid(repo) || !(formData instanceof FormData)) {
    return fail("create", "invalid");
  }

  const title = String(formData.get("title") ?? "").trim();
  const badgeType = String(formData.get("badgeType") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const issuerPolicy = String(formData.get("issuerPolicy") ?? "self");
  const iconEntry = formData.get("icon");

  if (!title) return fail("create", "invalid", "Add a title for the badge.");
  const titleError = checkBadge.title({ value: title });
  if (titleError) return fail("create", "invalid", titleError);
  if (!badgeType) return fail("create", "invalid", "Choose a badge type.");
  const typeError = checkBadge.badgeType({ value: badgeType });
  if (typeError) return fail("create", "invalid", typeError);
  const descError = checkBadge.description({ value: description });
  if (descError) return fail("create", "invalid", descError);

  let icon: Blob | undefined;
  if (iconEntry instanceof File && iconEntry.size > 0) {
    if (!ALLOWED_ICON_TYPES.has(iconEntry.type)) {
      return fail("create", "invalid", "Icon must be a PNG, JPEG, or WebP image.");
    }
    if (iconEntry.size > MAX_ICON_BYTES) {
      return fail("create", "invalid", "Icon must be 1 MB or smaller.");
    }
    const bytes = new Uint8Array(await iconEntry.arrayBuffer());
    const detected = detectImageMime(bytes);
    if (!detected) {
      return fail("create", "invalid", "Icon must be a valid PNG, JPEG, or WebP image.");
    }
    icon = new Blob([bytes], { type: detected });
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("create", "signed-out");
    if (!(await mayPublish(session, repo))) return fail("create", "forbidden");

    const created = await createBadgeDefinition(
      await sdkContext(session),
      {
        title,
        badgeType,
        description: description || undefined,
        icon,
        allowedIssuers: issuerPolicy === "anyone" ? undefined : [repo],
      },
      writeTo(session, repo),
    );
    const indexed = await waitForIndex(() => badgeDefinitionIndexed(created.uri));
    updateTag(tags.badges(repo));
    updateTag(tags.actor(repo));
    const rkey = created.uri.split("/").pop() ?? "";
    return {
      ok: true,
      uri: created.uri,
      href: badgeHref({ ownerDid: repo, rkey }),
      indexed,
    };
  } catch (err) {
    return fail("create", writeFailure(err, "create badge definition"));
  }
}

/** Awards an existing badge definition to an account or record, as `repo`. */
export async function awardBadgeToSubject(
  repo: string,
  input: {
    definitionUri: string;
    subject: string;
    note?: string;
    url?: string;
    validUntil?: string;
  },
): Promise<AwardBadgeActionResult> {
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    typeof input?.definitionUri !== "string" ||
    !isAtUri(input.definitionUri) ||
    collectionOf(input.definitionUri) !== "app.certified.badge.definition" ||
    typeof input.subject !== "string"
  ) {
    return fail("award", "invalid");
  }

  const note = (input.note ?? "").trim();
  if (note.length > 500) return fail("award", "invalid", "Note must be 500 characters or fewer.");

  const rawUrl = (input.url ?? "").trim();
  if (rawUrl.length > 2048) return fail("award", "invalid", "Link is too long.");
  const checkedUrl = rawUrl ? safeUrl(rawUrl) : null;
  if (rawUrl && !checkedUrl) {
    return fail("award", "invalid", "Link must start with https:// or http://.");
  }

  const rawUntil = (input.validUntil ?? "").trim();
  if (rawUntil && !/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
    return fail("award", "invalid", "Use a valid expiration date (YYYY-MM-DD).");
  }
  const validUntil = rawUntil ? `${rawUntil}T23:59:59Z` : undefined;

  try {
    const session = await getOAuthSession();
    if (!session) return fail("award", "signed-out");
    if (!(await mayPublish(session, repo))) return fail("award", "forbidden");

    const subject = await resolveAwardSubject(input.subject);
    if (!subject) {
      return fail(
        "award",
        "invalid",
        "Couldn't find that account or record. Enter a handle, DID, Certified link, or AT-URI.",
      );
    }

    const created = await awardBadge(
      await sdkContext(session),
      {
        definition: { uri: input.definitionUri },
        subject,
        note: note || undefined,
        url: checkedUrl ?? undefined,
        validUntil,
      },
      writeTo(session, repo),
    );
    const indexed = await waitForIndex(() => badgeAwardIndexed(created.uri));

    updateTag(tags.badge(input.definitionUri));
    updateTag(tags.badges(repo));
    updateTag(tags.endorsements(repo));
    updateTag(tags.actor(repo));
    const definitionOwner = didOf(input.definitionUri);
    if (definitionOwner && definitionOwner !== repo) {
      updateTag(tags.badges(definitionOwner));
    }
    if ("did" in subject) {
      updateTag(tags.badges(subject.did));
      updateTag(tags.endorsements(subject.did));
      updateTag(tags.actor(subject.did));
    } else {
      updateTag(tags.badges(subject.uri));
      updateTag(tags.project(subject.uri));
      const owner = didOf(subject.uri);
      if (owner) {
        updateTag(tags.badges(owner));
        updateTag(tags.actor(owner));
      }
    }
    return { ok: true, uri: created.uri, indexed };
  } catch (err) {
    return fail("award", writeFailure(err, "award badge"));
  }
}
