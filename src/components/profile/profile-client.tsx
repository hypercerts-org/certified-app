"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useOrg } from "@/lib/groups/org-context";
import { getOrgProfile, getOrgMetadata } from "@/lib/groups/api";
import { resolveHandle, resolvePdsUrl } from "@/lib/atproto/did";
import { getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile";
import type { OrgProfile, GroupMetadata } from "@/lib/groups/types";
import type { CertifiedProfile } from "@/lib/atproto/types";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";

export default function ProfileClient() {
  const params = useParams();
  const did = typeof params?.did === "string" ? decodeURIComponent(params.did) : "";
  const { did: currentUserDid } = useAuth();
  const { groups } = useOrg();

  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [metadata, setMetadata] = useState<GroupMetadata | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [pdsUrl, setPdsUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!did) {
        setError("No identifier provided");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const [p, m, h, pds] = await Promise.all([
          getOrgProfile(did, signal).catch(() => null),
          getOrgMetadata(did, signal).catch(() => null),
          resolveHandle(did).catch(() => null),
          resolvePdsUrl(did).catch(() => null),
        ]);
        if (signal?.aborted) return;
        setProfile(p);
        setMetadata(m);
        setHandle(h);
        setPdsUrl(pds);
      } catch (err) {
        if (signal?.aborted) return;
        console.error("Failed to fetch profile:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch profile");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [did]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const effectivePdsUrl = pdsUrl || "https://certified.one";
  const avatarUrl = profile
    ? getAvatarUrl(profile as CertifiedProfile, did, effectivePdsUrl)
    : null;
  const bannerUrl = profile
    ? getBannerUrl(profile as CertifiedProfile, did, effectivePdsUrl)
    : null;

  // Presence of an organization metadata record = this DID is a group
  const isOrg = !!metadata;
  const isOwnProfile = !!currentUserDid && currentUserDid === did;
  const membership = groups.find((g) => g.groupDid === did);
  const canEditGroup =
    !!membership && (membership.role === "owner" || membership.role === "admin");

  const editHref = isOwnProfile
    ? "/settings/edit-profile"
    : canEditGroup
      ? `/groups/${encodeURIComponent(did)}/edit-profile`
      : null;

  const initials = (profile?.displayName || handle || did)
    .slice(0, 2)
    .toUpperCase();

  if (isLoading) {
    return (
      <div className="dashboard">
        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            <div className="auth-guard-loading" aria-busy="true">
              <LoadingSpinner size="md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hard error: DID couldn't be resolved at all
  if (error && !pdsUrl) {
    return (
      <div className="dashboard">
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Profile unavailable</h1>
        </div>
        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            <div className="dash-card">
              <p className="dash-card__desc">{error}</p>
              <p className="personal-info__field--mono">{did}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Profile</h1>
      </div>

      <div className="dashboard__body">
        <div className="dashboard__main">
          {/* Profile header card */}
          <div className="dash-card">
            <div className="profile-card__banner">
              {bannerUrl ? <img src={bannerUrl} alt="" /> : null}
            </div>
            <div className="profile-card">
              <Avatar
                size="lg"
                src={avatarUrl || undefined}
                fallbackInitials={initials}
                bordered
              />
              <div className="profile-card__info">
                <h2 className="profile-card__name">
                  {profile?.displayName || (isOrg ? "Unnamed group" : "Anonymous")}
                </h2>
                {handle && <p className="profile-card__handle">@{handle}</p>}
              </div>
              {editHref && (
                <Link href={editHref}>
                  <Button variant="ghost" size="sm">
                    <Pencil size={14} />
                    Edit
                  </Button>
                </Link>
              )}
            </div>
            <dl className="profile-card__did">
              <dt className="personal-info__label">Identifier</dt>
              <dd className="personal-info__field personal-info__field--mono">{did}</dd>
              <dd className="personal-info__hint">
                {isOrg
                  ? "The group's decentralized identifier (DID) — this never changes, even if the handle is updated."
                  : "Stable decentralized identifier (DID) — this never changes, even if the username is updated."}
              </dd>
            </dl>
          </div>

          {/* Details card */}
          <div className="dash-card">
            <h2 className="dash-card__title">
              {isOrg ? "Group Details" : "Account Details"}
            </h2>
            <dl className="personal-info__grid">
              {!isOrg && (
                <div>
                  <dt className="personal-info__label">Display Name</dt>
                  <dd className="personal-info__field">
                    {profile?.displayName || "—"}
                  </dd>
                </div>
              )}
              <div className="personal-info__full-width">
                <dt className="personal-info__label">About</dt>
                <dd className="personal-info__field">
                  {profile?.description || "—"}
                </dd>
              </div>
              <div className="personal-info__full-width">
                <dt className="personal-info__label">Website</dt>
                <dd className="personal-info__field">
                  {profile?.website ? (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="personal-info__field--link"
                    >
                      {profile.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {isOrg && (
                <div>
                  <dt className="personal-info__label">Founded</dt>
                  <dd className="personal-info__field">
                    {metadata?.foundedDate
                      ? new Date(metadata.foundedDate).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "long", day: "numeric" }
                        )
                      : "—"}
                  </dd>
                </div>
              )}
              {isOrg &&
                metadata?.organizationType &&
                metadata.organizationType.length > 0 && (
                  <div>
                    <dt className="personal-info__label">Type</dt>
                    <dd className="personal-info__field">
                      {metadata.organizationType.join(", ")}
                    </dd>
                  </div>
                )}
              {isOrg && metadata?.urls && metadata.urls.length > 0 && (
                <div className="personal-info__full-width">
                  <dt className="personal-info__label">Links</dt>
                  <dd className="personal-info__field">
                    {metadata.urls.map((u, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        <a
                          href={u.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="personal-info__field--link"
                        >
                          {u.label || u.url}
                        </a>
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
