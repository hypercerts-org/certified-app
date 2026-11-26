"use server";

// Server Actions for the Profile settings sub-page (`/settings/profile` and
// `/[actor]/settings/profile`): full `app.certified.actor.profile` and
// `app.certified.actor.organization` editing, including avatar/banner/logo
// uploads via `@hypercerts-org/sdk/blob` and locations via
// `@hypercerts-org/sdk/location`.

import type { l } from "@atproto/lex";
import { uploadBlob } from "@hypercerts-org/sdk/blob";
import { createLocation } from "@hypercerts-org/sdk/location";
import { updateTag } from "next/cache";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { getIndexedProfile } from "@/lib/hypercerts/queries";
import { sdkContext, writeTo } from "@/lib/hypercerts/sdk";
import {
  editableRepository,
  type OrganizationDetails,
  type OrganizationPatch,
  type OrganizationUrlItem,
  type ProfileDetails,
  type ProfilePatch,
  patchOrganization,
  patchProfile,
  resolvePublicRecordRef,
  WriteError,
} from "@/lib/hypercerts/writes";
import { detectImageMime } from "@/lib/image-mime";
import { type LocationChoice, locationProblem, newLocationRecord } from "@/lib/location-choice";
import { logError } from "@/lib/log";
import { safeUrl } from "@/lib/safe-url";
import { isDid, isEmail } from "@/lib/validate";

const MAX_SMALL_IMAGE = 5_000_000; // 5 MB (org.hypercerts.defs#smallImage)
const MAX_LARGE_IMAGE = 10_000_000; // 10 MB (org.hypercerts.defs#largeImage)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ProfileActionFailure = {
  ok: false;
  message: string;
  reason?: WriteError["reason"] | "signed-out" | "unavailable";
};

export type ProfileActionResult<T> = { ok: true; data: T } | ProfileActionFailure;

function mapError(err: unknown, label: string): ProfileActionFailure {
  if (err instanceof WriteError) {
    switch (err.reason) {
      case "conflict":
        return {
          ok: false,
          reason: "conflict",
          message: "This profile was changed somewhere else. Reload to see the latest version.",
        };
      case "forbidden":
        return {
          ok: false,
          reason: "forbidden",
          message: "You don't have permission to edit this profile.",
        };
      case "invalid":
        return { ok: false, reason: "invalid", message: err.message };
      case "unknown":
        return {
          ok: false,
          reason: "unknown",
          message: "We couldn't confirm whether the change was saved. Reload to check.",
        };
    }
  }
  if (!(err instanceof SessionUnavailableError)) {
    logError(`[profile] ${label} failed`, err);
  }
  return {
    ok: false,
    reason: "unavailable",
    message: "Couldn't save right now. Please try again.",
  };
}

/** Updates one or more text/list fields on `app.certified.actor.profile/self`. */
export async function saveProfileField(input: {
  repo: string;
  expectedCid: string | null;
  patch: Pick<ProfilePatch, "displayName" | "description" | "pronouns" | "website" | "langs">;
}): Promise<ProfileActionResult<ProfileDetails>> {
  const { repo, expectedCid, patch } = input ?? {};
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    (expectedCid !== null && typeof expectedCid !== "string") ||
    !patch ||
    typeof patch !== "object"
  ) {
    return { ok: false, reason: "invalid", message: "Invalid profile update." };
  }

  if (patch.website !== undefined) {
    const trimmed = patch.website.trim();
    if (trimmed && !safeUrl(trimmed)) {
      return {
        ok: false,
        reason: "invalid",
        message: "Website must be a valid http(s) URL (for example, https://example.org).",
      };
    }
  }
  if (patch.langs !== undefined && patch.langs.length > 3) {
    return { ok: false, reason: "invalid", message: "Choose at most 3 languages." };
  }

  try {
    const session = await getOAuthSession();
    if (!session) {
      return { ok: false, reason: "signed-out", message: "Sign in again to edit this profile." };
    }
    const repository = await editableRepository(session, repo as l.DidString);
    if (!repository) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Only the account itself and a group's admins and owners can edit this profile.",
      };
    }

    const saved = await patchProfile(repository, patch, expectedCid);
    await waitForIndex(async () => (await getIndexedProfile(repo))?.cid === saved.cid, 5_000);
    updateTag(tags.actor(repo));
    updateTag(tags.explore());
    return { ok: true, data: saved };
  } catch (err) {
    return mapError(err, "saveProfileField");
  }
}

/**
 * Uploads or deletes a profile image (`avatar`, `banner`) or organization
 * `logo` via `@hypercerts-org/sdk/blob` and patches the corresponding record.
 */
export async function saveProfileMedia(
  formData: FormData,
): Promise<
  | { ok: true; cid: string | null; url: string | null }
  | { ok: false; message: string; reason?: WriteError["reason"] | "signed-out" | "unavailable" }
> {
  const repo = formData.get("repo");
  const slot = formData.get("slot");
  const expectedCidRaw = formData.get("expectedCid");
  const remove = formData.get("remove") === "true";
  const file = formData.get("file");

  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    (slot !== "avatar" && slot !== "banner" && slot !== "logo")
  ) {
    return { ok: false, reason: "invalid", message: "Invalid image request." };
  }
  const expectedCid = typeof expectedCidRaw === "string" && expectedCidRaw ? expectedCidRaw : null;

  try {
    const session = await getOAuthSession();
    if (!session) {
      return { ok: false, reason: "signed-out", message: "Sign in again to update images." };
    }
    const repository = await editableRepository(session, repo as l.DidString);
    if (!repository) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Only the account itself and a group's admins and owners can edit this profile.",
      };
    }

    let uploadedRef: Awaited<ReturnType<typeof uploadBlob>> | null = null;
    if (!remove) {
      if (!(file instanceof Blob) || file.size === 0) {
        return { ok: false, reason: "invalid", message: "Choose a JPEG, PNG, or WebP image." };
      }
      const maxSize = slot === "banner" ? MAX_LARGE_IMAGE : MAX_SMALL_IMAGE;
      if (file.size > maxSize) {
        return {
          ok: false,
          reason: "invalid",
          message: `Image must be under ${maxSize === MAX_LARGE_IMAGE ? "10 MB" : "5 MB"}.`,
        };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimeType = detectImageMime(bytes);
      if (!mimeType) {
        return {
          ok: false,
          reason: "invalid",
          message: "Unsupported image format. Use a JPEG, PNG, or WebP file.",
        };
      }
      uploadedRef = await uploadBlob(await sdkContext(session), bytes, {
        mimeType,
        ...(repo !== session.did ? { repo: repo as l.DidString } : {}),
      });
    }

    if (slot === "logo") {
      const saved = await patchOrganization(
        repository,
        { logo: remove ? null : uploadedRef },
        expectedCid,
      );
      updateTag(tags.actor(repo));
      updateTag(tags.explore());
      return { ok: true, cid: saved.cid, url: saved.logoUrl };
    }

    const saved = await patchProfile(
      repository,
      slot === "avatar"
        ? { avatar: remove ? null : uploadedRef }
        : { banner: remove ? null : uploadedRef },
      expectedCid,
    );
    await waitForIndex(async () => (await getIndexedProfile(repo))?.cid === saved.cid, 5_000);
    updateTag(tags.actor(repo));
    updateTag(tags.explore());
    return {
      ok: true,
      cid: saved.cid,
      url: slot === "avatar" ? saved.avatarUrl : saved.bannerUrl,
    };
  } catch (err) {
    return mapError(err, `saveProfileMedia:${slot}`);
  }
}

/** Updates one or more fields on `app.certified.actor.organization/self`. */
export async function saveOrganizationField(input: {
  repo: string;
  expectedCid: string | null;
  patch: Pick<
    OrganizationPatch,
    | "legalName"
    | "publicEmail"
    | "organizationType"
    | "foundedDate"
    | "urls"
    | "longDescription"
    | "visibility"
    | "langs"
  > & {
    locationChoice?: LocationChoice | null;
  };
}): Promise<ProfileActionResult<OrganizationDetails>> {
  const { repo, expectedCid, patch } = input ?? {};
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    (expectedCid !== null && typeof expectedCid !== "string") ||
    !patch ||
    typeof patch !== "object"
  ) {
    return { ok: false, reason: "invalid", message: "Invalid organization update." };
  }

  if (patch.publicEmail !== undefined) {
    const trimmed = patch.publicEmail.trim();
    if (trimmed && !isEmail(trimmed)) {
      return { ok: false, reason: "invalid", message: "Enter a valid public email address." };
    }
  }
  if (patch.foundedDate !== undefined) {
    const trimmed = patch.foundedDate.trim();
    if (trimmed && !DATE_RE.test(trimmed)) {
      return { ok: false, reason: "invalid", message: "Use a valid date (YYYY-MM-DD)." };
    }
  }
  if (patch.urls !== undefined) {
    const bad = patch.urls.find(
      (item: OrganizationUrlItem) => item.url.trim() && !safeUrl(item.url.trim()),
    );
    if (bad) {
      return {
        ok: false,
        reason: "invalid",
        message: `Link "${bad.url}" must be a valid http(s) URL.`,
      };
    }
  }
  if (patch.locationChoice !== undefined) {
    const err = locationProblem(patch.locationChoice, repo);
    if (err) return { ok: false, reason: "invalid", message: err };
  }

  try {
    const session = await getOAuthSession();
    if (!session) {
      return { ok: false, reason: "signed-out", message: "Sign in again to edit this profile." };
    }
    const repository = await editableRepository(session, repo as l.DidString);
    if (!repository) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Only the account itself and a group's admins and owners can edit this profile.",
      };
    }

    const orgPatch: OrganizationPatch = {
      legalName: patch.legalName,
      publicEmail: patch.publicEmail,
      organizationType: patch.organizationType,
      foundedDate: patch.foundedDate,
      urls: patch.urls,
      longDescription: patch.longDescription,
      visibility: patch.visibility,
      langs: patch.langs,
    };

    let createdNewLocation = false;
    if (patch.locationChoice !== undefined) {
      if (patch.locationChoice === null) {
        orgPatch.location = null;
      } else if (patch.locationChoice.kind === "saved") {
        const ref = await resolvePublicRecordRef(patch.locationChoice.uri);
        if (!ref) {
          return {
            ok: false,
            reason: "invalid",
            message: "That saved location could not be found. Pick another location.",
          };
        }
        orgPatch.location = ref;
      } else {
        const created = await createLocation(
          await sdkContext(session),
          newLocationRecord(patch.locationChoice),
          writeTo(session, repo),
        );
        orgPatch.location = { uri: created.uri, cid: created.cid };
        createdNewLocation = true;
      }
    }

    const saved = await patchOrganization(repository, orgPatch, expectedCid);
    updateTag(tags.actor(repo));
    updateTag(tags.explore());
    if (createdNewLocation) updateTag(tags.locations(repo));
    return { ok: true, data: saved };
  } catch (err) {
    return mapError(err, "saveOrganizationField");
  }
}
