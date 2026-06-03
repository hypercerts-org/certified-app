"use client";

import React, { useState, useEffect, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronLeft } from "lucide-react";
import ErrorMessage from "@/components/ui/error-message";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import AvatarUpload from "@/components/profile/avatar-upload";
import BannerUpload from "@/components/profile/banner-upload";
import type {
  CertifiedProfile,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "@/lib/atproto/types";
import type { UploadedBlob } from "@/lib/atproto/profile";
import type { BlobRef } from "@atproto/api";
import type { OrgUrlItem } from "@/lib/groups/types";

/**
 * Org URL list passed in/out as a plain array. The parent owns whether
 * the underlying record is fetched and saved; the form just edits the
 * list. When `isOrg` is false the form hides the URL list entirely.
 */
export interface ProfileEditFormProps {
  initialProfile: CertifiedProfile | null;
  isOrg: boolean;
  initialOrgUrls: OrgUrlItem[];
  /** Handle of the account being edited — used for the in-form back link
   *  and the Cancel button's destination. The navbar breadcrumb is the
   *  parent page's responsibility; this prop only drives in-page nav. */
  handle: string | null;
  onSave: (payload: {
    profile: CertifiedProfile;
    orgUrls: OrgUrlItem[] | null;
  }) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  onAvatarUpload: (file: File) => Promise<UploadedBlob>;
  onBannerUpload: (file: File) => Promise<UploadedBlob>;
  currentAvatarUrl: string | null;
  currentBannerUrl: string | null;
  fallbackInitials: string;
}

interface UrlRowState {
  id: string;
  url: string;
  label: string;
  error?: string;
}

let urlRowSeq = 0;
const newUrlRow = (init?: Partial<UrlRowState>): UrlRowState => ({
  id: `row-${++urlRowSeq}`,
  url: init?.url ?? "",
  label: init?.label ?? "",
  error: init?.error,
});

const ProfileEditForm: React.FC<ProfileEditFormProps> = ({
  initialProfile,
  isOrg,
  initialOrgUrls,
  handle,
  onSave,
  isSaving,
  saveError,
  onAvatarUpload,
  onBannerUpload,
  currentAvatarUrl,
  currentBannerUrl,
  fallbackInitials,
}) => {
  const router = useRouter();
  const displayNameId = useId();
  const pronounsId = useId();
  const descriptionId = useId();
  const websiteId = useId();

  const [displayName, setDisplayName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [urlRows, setUrlRows] = useState<UrlRowState[]>([]);

  const [avatarBlob, setAvatarBlob] = useState<UploadedBlob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<UploadedBlob | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const [displayNameError, setDisplayNameError] = useState("");
  const [pronounsError, setPronounsError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [websiteError, setWebsiteError] = useState("");

  // Initialize once per initialProfile identity.
  useEffect(() => {
    if (initialProfile) {
      setDisplayName(initialProfile.displayName || "");
      setPronouns(initialProfile.pronouns || "");
      setDescription(initialProfile.description || "");
      setWebsite(initialProfile.website || "");
    }
  }, [initialProfile]);

  useEffect(() => {
    setUrlRows(
      initialOrgUrls.length > 0
        ? initialOrgUrls.map((u) => newUrlRow({ url: u.url, label: u.label }))
        : [],
    );
  }, [initialOrgUrls]);

  const validateDisplayName = (value: string) => {
    if (value.length > 64) {
      setDisplayNameError("Display name must be 64 characters or fewer");
      return false;
    }
    setDisplayNameError("");
    return true;
  };

  const validatePronouns = (value: string) => {
    // Lexicon allows up to 20 graphemes / 200 bytes. We approximate with a
    // character-count limit — the server is the source of truth.
    if (value.length > 20) {
      setPronounsError("Pronouns must be 20 characters or fewer");
      return false;
    }
    setPronounsError("");
    return true;
  };

  const validateDescription = (value: string) => {
    if (value.length > 256) {
      setDescriptionError("Bio must be 256 characters or fewer");
      return false;
    }
    setDescriptionError("");
    return true;
  };

  // Only http/https — `javascript:` parses fine via `new URL()` and would
  // otherwise be planted as XSS on any visitor who clicks the link.
  const isValidUrl = (value: string): boolean => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const validateWebsite = (value: string) => {
    const v = value.trim();
    if (v === "") {
      setWebsiteError("");
      return true;
    }
    if (!isValidUrl(v)) {
      setWebsiteError("Use a full URL starting with http:// or https://");
      return false;
    }
    setWebsiteError("");
    return true;
  };

  const validateOrgUrls = (
    rows: UrlRowState[],
  ): { ok: boolean; rows: UrlRowState[] } => {
    let ok = true;
    const next = rows.map((row) => {
      const v = row.url.trim();
      if (v === "") {
        if (row.label.trim() !== "") {
          ok = false;
          return { ...row, error: "URL required" };
        }
        return { ...row, error: undefined };
      }
      if (!isValidUrl(v)) {
        ok = false;
        return { ...row, error: "Invalid URL" };
      }
      return { ...row, error: undefined };
    });
    return { ok, rows: next };
  };

  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      const blobRef = await onAvatarUpload(file);
      setAvatarBlob(blobRef);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true);
    try {
      const blobRef = await onBannerUpload(file);
      setBannerBlob(blobRef);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const updateUrlRow = (id: string, patch: Partial<UrlRowState>) => {
    setUrlRows((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, ...patch, error: undefined } : row,
      ),
    );
  };

  const removeUrlRow = (id: string) => {
    setUrlRows((rows) => rows.filter((row) => row.id !== id));
  };

  const addUrlRow = () => {
    setUrlRows((rows) => [...rows, newUrlRow()]);
  };

  const hasChanges = (() => {
    const baseDisplay = initialProfile?.displayName || "";
    const basePronouns = initialProfile?.pronouns || "";
    const baseDesc = initialProfile?.description || "";
    const baseWeb = initialProfile?.website || "";
    if (displayName !== baseDisplay) return true;
    if (pronouns !== basePronouns) return true;
    if (description !== baseDesc) return true;
    if (website !== baseWeb) return true;
    if (avatarBlob || bannerBlob) return true;
    if (isOrg) {
      const initSig = JSON.stringify(
        initialOrgUrls.map((u) => [u.url, u.label ?? ""]),
      );
      const currSig = JSON.stringify(
        urlRows.map((r) => [r.url.trim(), r.label.trim()]),
      );
      if (initSig !== currSig) return true;
    }
    return false;
  })();

  const isValid =
    !displayNameError &&
    !pronounsError &&
    !descriptionError &&
    !websiteError &&
    urlRows.every((r) => !r.error);

  const handleSave = async () => {
    const displayNameValid = validateDisplayName(displayName);
    const pronounsValid = validatePronouns(pronouns);
    const descriptionValid = validateDescription(description);
    const websiteValid = validateWebsite(website);
    const { ok: urlsValid, rows: validatedRows } = validateOrgUrls(urlRows);
    setUrlRows(validatedRows);

    if (
      !displayNameValid ||
      !pronounsValid ||
      !descriptionValid ||
      !websiteValid ||
      !urlsValid
    ) {
      return;
    }

    const profile: CertifiedProfile = {
      createdAt: initialProfile?.createdAt || new Date().toISOString(),
      ...(displayName.trim() && { displayName: displayName.trim() }),
      ...(pronouns.trim() && { pronouns: pronouns.trim() }),
      ...(description.trim() && { description: description.trim() }),
      ...(website.trim() && { website: website.trim() }),
    };

    if (avatarBlob) {
      const avatarImage: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        // UploadedBlob is structurally compatible with the lexicon's BlobRef
        // shape — narrow with a single cast at this seam.
        image: avatarBlob as unknown as BlobRef,
      };
      profile.avatar = avatarImage;
    } else if (initialProfile?.avatar) {
      profile.avatar = initialProfile.avatar;
    }

    if (bannerBlob) {
      const bannerImage: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        image: bannerBlob as unknown as BlobRef,
      };
      profile.banner = bannerImage;
    } else if (initialProfile?.banner) {
      profile.banner = initialProfile.banner;
    }

    const orgUrls: OrgUrlItem[] | null = isOrg
      ? validatedRows
          .map((row) => {
            const url = row.url.trim();
            const label = row.label.trim();
            if (!url) return null;
            return label ? { url, label } : { url };
          })
          .filter((u): u is OrgUrlItem => u !== null)
      : null;

    await onSave({ profile, orgUrls });
  };

  // Cancel and back-link destinations. When we know the user's handle we
  // route back to their public profile by handle (canonical URL); otherwise
  // fall back to `/profile` which redirects to the current user's profile.
  const profileHref = handle ? `/profile/${handle}` : "/profile";

  const handleCancel = () => {
    router.push(profileHref);
  };

  return (
    <div className="pe">
      {/* Subtle textual back affordance above the hero. Mirrors GitHub's
          "Back to <owner>" pattern — repeats the navbar breadcrumb in a
          way that's visible in the content area itself. */}
      <div className="pe__back">
        <Link href={profileHref} className="pe__back-link">
          <ChevronLeft size={14} strokeWidth={2} aria-hidden />
          <span>
            Back to{" "}
            <span className="pe__back-handle">@{handle ?? "profile"}</span>
          </span>
        </Link>
      </div>

      {/* Banner + avatar preview. Acts as a compact hero that visually
          ties this page to the profile the user came from. */}
      <div className="pe__media">
        <BannerUpload
          currentBannerUrl={currentBannerUrl}
          onUpload={handleBannerUpload}
          isUploading={isUploadingBanner}
        />
        <div className="pe__avatar-slot">
          <AvatarUpload
            currentAvatarUrl={currentAvatarUrl}
            fallbackInitials={fallbackInitials}
            onUpload={handleAvatarUpload}
            isUploading={isUploadingAvatar}
          />
        </div>
      </div>

      <div className="pe__section">
        <div className="pe__section-head">
          <h2 className="pe__section-title">Identity</h2>
          <p className="pe__hint">How others see you across Certified.</p>
        </div>

        <div className="pe__fields">
          <div className="pe__row pe__row--split">
            <div className="pe__field">
              <label className="pe__label" htmlFor={displayNameId}>
                <span>Display name</span>
                <span className="pe__label-count">{displayName.length}/64</span>
              </label>
              <Input
                id={displayNameId}
                type="text"
                value={displayName}
                maxLength={64}
                placeholder={isOrg ? "Organization name" : "Your name"}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  validateDisplayName(e.target.value);
                }}
                error={displayNameError || undefined}
              />
            </div>

            {!isOrg ? (
              <div className="pe__field">
                <label className="pe__label" htmlFor={pronounsId}>
                  <span>Pronouns</span>
                  <span className="pe__label-count">{pronouns.length}/20</span>
                </label>
                <Input
                  id={pronounsId}
                  type="text"
                  value={pronouns}
                  maxLength={20}
                  placeholder="they/them"
                  onChange={(e) => {
                    setPronouns(e.target.value);
                    validatePronouns(e.target.value);
                  }}
                  error={pronounsError || undefined}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pe__section">
        <div className="pe__section-head">
          <h2 className="pe__section-title">Bio</h2>
          <p className="pe__hint">
            {isOrg
              ? "A short description of this organization."
              : "A short description of you and your work."}
          </p>
        </div>

        <div className="pe__fields">
          <div className="pe__field">
            <label className="pe__label" htmlFor={descriptionId}>
              <span>About</span>
            </label>
            <Textarea
              id={descriptionId}
              rows={4}
              maxLength={256}
              showCount
              value={description}
              placeholder={
                isOrg
                  ? "What is this organization about?"
                  : "A short description of you and your work."
              }
              onChange={(e) => {
                setDescription(e.target.value);
                validateDescription(e.target.value);
              }}
              error={descriptionError || undefined}
            />
          </div>
        </div>
      </div>

      <div className="pe__section">
        <div className="pe__section-head">
          <h2 className="pe__section-title">Links</h2>
          <p className="pe__hint">
            {isOrg
              ? "Your primary website appears next to your name. Additional URLs show as a list on your profile."
              : "Your primary website. Shown next to your name on your profile."}
          </p>
        </div>

        <div className="pe__fields">
          <div className="pe__field">
            <label className="pe__label" htmlFor={websiteId}>
              <span>Website</span>
            </label>
            <Input
              id={websiteId}
              type="url"
              inputMode="url"
              value={website}
              maxLength={256}
              placeholder="https://example.com"
              onChange={(e) => {
                setWebsite(e.target.value);
                validateWebsite(e.target.value);
              }}
              error={websiteError || undefined}
              helperText="Include https://."
            />
          </div>
        </div>
      </div>

      {isOrg ? (
        <div className="pe__section">
          <div className="pe__section-head">
            <h2 className="pe__section-title">Organization</h2>
            <p className="pe__hint">
              Extra links displayed on this organization&apos;s profile.
            </p>
          </div>

          <div className="pe__fields">
            <div className="pe__field">
              <label className="pe__label">
                <span>Additional URLs</span>
              </label>

              {urlRows.length === 0 ? (
                <p className="pe__url-empty">No additional links yet.</p>
              ) : (
                <div className="pe__url-list">
                  {urlRows.map((row) => (
                    <div key={row.id} className="pe__url-item">
                      <div className="pe__url-row">
                        <input
                          type="url"
                          inputMode="url"
                          className={`pe__input${
                            row.error ? " pe__input--invalid" : ""
                          }`}
                          value={row.url}
                          placeholder="https://example.com"
                          aria-label="URL"
                          aria-invalid={row.error ? true : undefined}
                          aria-describedby={
                            row.error ? `${row.id}-error` : undefined
                          }
                          onChange={(e) =>
                            updateUrlRow(row.id, { url: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="pe__input"
                          value={row.label}
                          maxLength={48}
                          placeholder="Label"
                          aria-label="Link label"
                          onChange={(e) =>
                            updateUrlRow(row.id, { label: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="pe__url-remove"
                          aria-label="Remove URL"
                          onClick={() => removeUrlRow(row.id)}
                        >
                          <X size={16} strokeWidth={1.75} aria-hidden />
                        </button>
                      </div>
                      {row.error ? (
                        <p
                          id={`${row.id}-error`}
                          className="pe__field-error"
                          role="alert"
                        >
                          {row.error}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="pe__url-add"
                onClick={addUrlRow}
              >
                <Plus size={14} strokeWidth={2} aria-hidden />
                Add URL
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveError ? (
        <div className="pe__error">
          <ErrorMessage message={saveError} />
        </div>
      ) : null}

      {/* Sticky footer. Stays pinned to the bottom of the viewport while
          the user scrolls long forms so Save is always one click away. */}
      <div className="pe__footer">
        <div className="pe__footer-inner">
          <button
            type="button"
            className="pe__action-btn pe__action-btn--ghost"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pe__action-btn pe__action-btn--primary"
            onClick={handleSave}
            disabled={!hasChanges || !isValid || isSaving}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditForm;
