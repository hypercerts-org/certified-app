"use client";

import React, { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import ErrorMessage from "@/components/ui/error-message";
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
  const descriptionId = useId();
  const websiteId = useId();

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [urlRows, setUrlRows] = useState<UrlRowState[]>([]);

  const [avatarBlob, setAvatarBlob] = useState<UploadedBlob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<UploadedBlob | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const [displayNameError, setDisplayNameError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [websiteError, setWebsiteError] = useState("");

  // Initialize once per initialProfile identity.
  useEffect(() => {
    if (initialProfile) {
      setDisplayName(initialProfile.displayName || "");
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
    const baseDesc = initialProfile?.description || "";
    const baseWeb = initialProfile?.website || "";
    if (displayName !== baseDisplay) return true;
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
    !descriptionError &&
    !websiteError &&
    urlRows.every((r) => !r.error);

  const handleSave = async () => {
    const displayNameValid = validateDisplayName(displayName);
    const descriptionValid = validateDescription(description);
    const websiteValid = validateWebsite(website);
    const { ok: urlsValid, rows: validatedRows } = validateOrgUrls(urlRows);
    setUrlRows(validatedRows);

    if (!displayNameValid || !descriptionValid || !websiteValid || !urlsValid) {
      return;
    }

    const profile: CertifiedProfile = {
      createdAt: initialProfile?.createdAt || new Date().toISOString(),
      ...(displayName.trim() && { displayName: displayName.trim() }),
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

  const handleCancel = () => {
    router.push("/profile");
  };

  return (
    <div className="pe">
      {/* Banner + avatar preview. Acts as the page hero. */}
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
          <span className="pe__eyebrow">Identity</span>
          <p className="pe__hint">
            How others see you across Certified.
          </p>
        </div>

        <div className="pe__fields">
          <div className="pe__field">
            <label className="pe__label" htmlFor={displayNameId}>
              <span>Display name</span>
              <span className="pe__label-count">{displayName.length}/64</span>
            </label>
            <input
              id={displayNameId}
              type="text"
              className={`pe__input${
                displayNameError ? " pe__input--invalid" : ""
              }`}
              value={displayName}
              maxLength={64}
              placeholder="Your name"
              onChange={(e) => {
                setDisplayName(e.target.value);
                validateDisplayName(e.target.value);
              }}
              aria-invalid={displayNameError ? true : undefined}
            />
            {displayNameError ? (
              <p className="pe__field-error" role="alert">
                {displayNameError}
              </p>
            ) : null}
          </div>

          <div className="pe__field">
            <label className="pe__label" htmlFor={descriptionId}>
              <span>Bio</span>
              <span className="pe__label-count">{description.length}/256</span>
            </label>
            <textarea
              id={descriptionId}
              className={`pe__textarea${
                descriptionError ? " pe__textarea--invalid" : ""
              }`}
              rows={4}
              maxLength={256}
              value={description}
              placeholder={isOrg ? "What is this organization about?" : "A short description of you and your work."}
              onChange={(e) => {
                setDescription(e.target.value);
                validateDescription(e.target.value);
              }}
              aria-invalid={descriptionError ? true : undefined}
            />
            {descriptionError ? (
              <p className="pe__field-error" role="alert">
                {descriptionError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pe__section">
        <div className="pe__section-head">
          <span className="pe__eyebrow">Links</span>
          <p className="pe__hint">
            {isOrg
              ? "Your primary website and any additional URLs. The primary website appears next to your name; the rest show as a list on your profile."
              : "Your primary website. Shown next to your name on your profile."}
          </p>
        </div>

        <div className="pe__fields">
          <div className="pe__field">
            <label className="pe__label" htmlFor={websiteId}>
              <span>Website</span>
            </label>
            <input
              id={websiteId}
              type="url"
              inputMode="url"
              className={`pe__input${
                websiteError ? " pe__input--invalid" : ""
              }`}
              value={website}
              maxLength={256}
              placeholder="https://example.com"
              onChange={(e) => {
                setWebsite(e.target.value);
                validateWebsite(e.target.value);
              }}
              aria-invalid={websiteError ? true : undefined}
            />
            {websiteError ? (
              <p className="pe__field-error" role="alert">
                {websiteError}
              </p>
            ) : (
              <p className="pe__field-help">Include https://.</p>
            )}
          </div>

          {isOrg ? (
            <div className="pe__field">
              <label className="pe__label">
                <span>Additional URLs</span>
              </label>

              {urlRows.length === 0 ? (
                <p className="pe__url-empty">No additional links yet.</p>
              ) : (
                <div className="pe__url-list">
                  {urlRows.map((row) => (
                    <div key={row.id}>
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
                          onChange={(e) =>
                            updateUrlRow(row.id, { url: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="pe__input"
                          value={row.label}
                          maxLength={48}
                          placeholder="Label (optional)"
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
                        <p className="pe__field-error" role="alert">
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
          ) : null}
        </div>
      </div>

      <div className="pe__section pe__section--actions">
        {saveError ? (
          <div className="pe__error">
            <ErrorMessage message={saveError} />
          </div>
        ) : null}
        <div className="pe__actions">
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
