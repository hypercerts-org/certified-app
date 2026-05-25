"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import {
  usePageTitle,
  usePageTitleBreadcrumb,
} from "@/lib/navbar-context";
import { putProfile, uploadAvatar, uploadBanner } from "@/lib/atproto/profile";
import { authFetch } from "@/lib/auth/fetch";
import { extractError } from "@/lib/utils/api";
import { getInitials } from "@/lib/utils/initials";
import { ORG_MARKER_COLLECTION } from "@/lib/groups/constants";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ProfileEditForm from "@/components/profile/profile-edit-form";
import type { CertifiedProfile } from "@/lib/atproto/types";
import type { GroupMetadata, OrgUrlItem } from "@/lib/groups/types";

/**
 * Fetch the current user's `app.certified.actor.organization` record
 * directly from their PDS via the xrpc proxy. Returns null when the
 * record doesn't exist — that's the "this account is not an org" case.
 *
 * TODO(org-urls): editing an org's URLs from the *personal* edit-profile
 * page only works for accounts whose own DID carries the org marker.
 * Group accounts whose DID is owned by the group service have their
 * metadata edited at /groups/[groupDid]/edit-profile and persisted via
 * the group-service-proxied PUT — both paths should converge once we
 * unify the org marker model.
 */
async function fetchOwnOrgMarker(
  did: string,
  signal?: AbortSignal,
): Promise<GroupMetadata | null> {
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?repo=${encodeURIComponent(
      did,
    )}&collection=${encodeURIComponent(ORG_MARKER_COLLECTION)}&rkey=self`,
    { signal },
  );
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null;
    return null;
  }
  const data = (await res.json()) as { value?: GroupMetadata };
  return data.value ?? null;
}

async function putOwnOrgMarker(
  did: string,
  record: GroupMetadata,
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: ORG_MARKER_COLLECTION,
      rkey: "self",
      record: {
        ...record,
        $type: ORG_MARKER_COLLECTION,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to save organization URLs"));
  }
}

export default function EditProfilePage() {
  const { isAuthenticated, did } = useAuth();
  const { handle } = useSession();
  const { profile, isLoading, avatarUrl, bannerUrl } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [orgMarker, setOrgMarker] = useState<GroupMetadata | null>(null);
  const [isOrg, setIsOrg] = useState(false);
  const [orgLoaded, setOrgLoaded] = useState(false);

  // Drive the navbar breadcrumb. When we know the handle, render
  // `@handle / Edit profile`; otherwise fall through to a plain title.
  // The right segment's href is the current page itself so the breadcrumb
  // text is a clickable no-op (matches the GitHub `owner / repo` pattern).
  usePageTitle("Edit profile");
  usePageTitleBreadcrumb(
    handle
      ? {
          left: { text: handle, href: `/profile/${handle}` },
          right: {
            text: "Edit profile",
            href: "/settings/edit-profile",
          },
        }
      : null,
  );

  useEffect(() => {
    if (!did) {
      setOrgMarker(null);
      setIsOrg(false);
      setOrgLoaded(true);
      return;
    }
    const controller = new AbortController();
    fetchOwnOrgMarker(did, controller.signal)
      .then((record) => {
        if (controller.signal.aborted) return;
        setOrgMarker(record);
        setIsOrg(record !== null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setOrgLoaded(true);
      });
    return () => controller.abort();
  }, [did]);

  const handleSave = async ({
    profile: updatedProfile,
    orgUrls,
  }: {
    profile: CertifiedProfile;
    orgUrls: OrgUrlItem[] | null;
  }) => {
    if (!isAuthenticated || !did) {
      setSaveError("Not authenticated");
      return;
    }
    try {
      setIsSaving(true);
      setSaveError(null);

      // Save profile first (text + images). Org URLs are written to a
      // separate record (`app.certified.actor.organization`) and only
      // when the account already carries the org marker.
      await putProfile(did, updatedProfile);

      if (isOrg && orgUrls !== null) {
        const nextMarker: GroupMetadata = {
          ...(orgMarker ?? { createdAt: new Date().toISOString() }),
          urls: orgUrls.length > 0 ? orgUrls : undefined,
        };
        await putOwnOrgMarker(did, nextMarker);
      }

      // Defensive: evict any browser-cached resolve-did response for
      // this DID so the next page load sees the fresh record even if
      // a stale response is sitting in the disk cache from before we
      // switched same-DID responses to no-store.
      await fetch(`/api/resolve-did?did=${encodeURIComponent(did)}`, {
        cache: "reload",
        credentials: "include",
      }).catch(() => undefined);

      // Hard reload to /profile so every component (profile context,
      // navbar avatar, useUserProfile on the destination page, blob
      // URLs) remounts with fresh data. A client-side push here used
      // to leave the navbar showing the old avatar for ~30s.
      window.location.assign("/profile");
      return;
    } catch (error) {
      console.error("Failed to save profile:", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save profile",
      );
      setIsSaving(false);
    }
  };

  const fallbackInitials = getInitials(profile?.displayName, did);

  const initialOrgUrls = orgMarker?.urls ?? [];

  // Render directly into `.app-shell__content` (the 600px reading
  // column). The form supplies all its own structure — no surrounding
  // dashboard chrome is needed.
  if (isLoading || !orgLoaded) {
    return (
      <div className="pe__loading">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <ProfileEditForm
      initialProfile={profile}
      isOrg={isOrg}
      initialOrgUrls={initialOrgUrls}
      handle={handle}
      onSave={handleSave}
      isSaving={isSaving}
      saveError={saveError}
      onAvatarUpload={(file) => uploadAvatar(file)}
      onBannerUpload={(file) => uploadBanner(file)}
      currentAvatarUrl={avatarUrl}
      currentBannerUrl={bannerUrl}
      fallbackInitials={fallbackInitials}
    />
  );
}
