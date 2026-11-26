"use client";

import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  ErrorMessage,
  Field,
  fromISODate,
  Input,
  SegmentedControl,
  Text,
  Textarea,
  toISODate,
} from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { ActorAvatar } from "@/components/actor";
import { LocationField } from "@/components/location-picker";
import {
  saveOrganizationField,
  saveProfileField,
  saveProfileMedia,
} from "@/lib/hypercerts/profile-actions";
import type { SavedPlace } from "@/lib/hypercerts/queries";
import type {
  OrganizationDetails,
  OrganizationUrlItem,
  ProfileDetails,
} from "@/lib/hypercerts/writes";
import type { LocationChoice } from "@/lib/location-choice";
import { safeUrl } from "@/lib/safe-url";
import { SettingsAction, SettingsGroup, SettingsRow } from "./settings-frame";

const MAX_SMALL_IMAGE = 5_000_000;
const MAX_LARGE_IMAGE = 10_000_000;

const COMMON_ORG_TYPES = [
  { value: "nonprofit", label: "Nonprofit" },
  { value: "ngo", label: "NGO" },
  { value: "government", label: "Government" },
  { value: "social-enterprise", label: "Social enterprise" },
  { value: "cooperative", label: "Cooperative" },
  { value: "foundation", label: "Foundation" },
  { value: "research", label: "Research" },
  { value: "community", label: "Community" },
] as const;

const COMMON_ORG_TYPE_SET = new Set<string>(COMMON_ORG_TYPES.map((t) => t.value));

function formatOrgType(value: string): string {
  const known = COMMON_ORG_TYPES.find((t) => t.value === value);
  if (known) return known.label;
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("-", " ");
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  const date = fromISODate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function NotSet({ label = "Not set" }: { label?: string }) {
  return (
    <Text size="body-sm" tone="muted">
      {label}
    </Text>
  );
}

type EditableRow =
  | "displayName"
  | "pronouns"
  | "description"
  | "website"
  | "langs"
  | "legalName"
  | "publicEmail"
  | "organizationType"
  | "foundedDate"
  | "location"
  | "urls"
  | "longDescription"
  | "visibility"
  | "orgLangs";

export function ProfileSettings({
  repo,
  handle,
  isGroup,
  initialProfile,
  initialOrganization,
  savedLocations,
  initialLocationName,
}: {
  repo: string;
  handle: string | null;
  isGroup: boolean;
  initialProfile: ProfileDetails;
  initialOrganization: OrganizationDetails;
  savedLocations: SavedPlace[];
  initialLocationName: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(initialProfile);
  const [org, setOrg] = useState(initialOrganization);
  const [orgExpanded, setOrgExpanded] = useState(initialOrganization.exists || isGroup);
  const [locationName, setLocationName] = useState<string | null>(() => {
    if (initialLocationName) return initialLocationName;
    if (!initialOrganization.locationUri) return null;
    return savedLocations.find((p) => p.uri === initialOrganization.locationUri)?.name ?? null;
  });

  const [editing, setEditing] = useState<EditableRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Media upload states
  const [mediaBusy, setMediaBusy] = useState<"avatar" | "banner" | "logo" | null>(null);
  const [mediaError, setMediaError] = useState<{
    slot: "avatar" | "banner" | "logo";
    message: string;
  } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Inline editor drafts
  const [textDraft, setTextDraft] = useState("");
  const [selectedOrgTypes, setSelectedOrgTypes] = useState<string[]>([]);
  const [customOrgTypes, setCustomOrgTypes] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState<LocationChoice | null>(null);
  const [urlsDraft, setUrlsDraft] = useState<Array<OrganizationUrlItem & { key: number }>>([]);
  const [visibilityDraft, setVisibilityDraft] = useState<"public" | "unlisted">("public");
  const nextUrlKey = useRef(1);

  const isOrgShape = isGroup || org.exists;

  const cancelEdit = () => {
    setEditing(null);
    setRowError(null);
  };

  const openEdit = (row: EditableRow) => {
    setRowError(null);
    setEditing(row);
    switch (row) {
      case "displayName":
        setTextDraft(profile.displayName);
        break;
      case "pronouns":
        setTextDraft(profile.pronouns);
        break;
      case "description":
        setTextDraft(profile.description);
        break;
      case "website":
        setTextDraft(profile.website);
        break;
      case "langs":
        setTextDraft(profile.langs.join(", "));
        break;
      case "legalName":
        setTextDraft(org.legalName);
        break;
      case "publicEmail":
        setTextDraft(org.publicEmail);
        break;
      case "organizationType":
        setSelectedOrgTypes(org.organizationType.filter((t) => COMMON_ORG_TYPE_SET.has(t)));
        setCustomOrgTypes(
          org.organizationType.filter((t) => !COMMON_ORG_TYPE_SET.has(t)).join(", "),
        );
        break;
      case "foundedDate":
        setDateDraft(org.foundedDate);
        break;
      case "location": {
        if (!org.locationUri) {
          setLocationDraft(null);
        } else {
          const match = savedLocations.find((p) => p.uri === org.locationUri);
          setLocationDraft({
            kind: "saved",
            uri: org.locationUri,
            name: match?.name ?? locationName ?? org.locationUri,
            point: match?.point ?? null,
          });
        }
        break;
      }
      case "urls":
        setUrlsDraft(
          org.urls.length > 0
            ? org.urls.map((item) => ({ ...item, key: nextUrlKey.current++ }))
            : [{ url: "", label: "", key: nextUrlKey.current++ }],
        );
        break;
      case "longDescription":
        setTextDraft(org.longDescription);
        break;
      case "visibility":
        setVisibilityDraft(org.visibility);
        break;
      case "orgLangs":
        setTextDraft(org.langs.join(", "));
        break;
    }
  };

  const submitProfilePatch = async (
    patch: Parameters<typeof saveProfileField>[0]["patch"],
    successMessage: string,
  ) => {
    setSaving(true);
    setRowError(null);
    try {
      const result = await saveProfileField({
        repo,
        expectedCid: profile.cid,
        patch,
      });
      if (!result.ok) {
        setRowError(result.message);
        return;
      }
      setProfile(result.data);
      setEditing(null);
      toast.success(successMessage);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const submitOrgPatch = async (
    patch: Parameters<typeof saveOrganizationField>[0]["patch"],
    successMessage: string,
    nextLocationName?: string | null,
  ) => {
    setSaving(true);
    setRowError(null);
    try {
      const result = await saveOrganizationField({
        repo,
        expectedCid: org.cid,
        patch,
      });
      if (!result.ok) {
        setRowError(result.message);
        return;
      }
      setOrg(result.data);
      if (nextLocationName !== undefined) setLocationName(nextLocationName);
      setEditing(null);
      toast.success(successMessage);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleMediaUpload = async (
    slot: "avatar" | "banner" | "logo",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const maxSize = slot === "banner" ? MAX_LARGE_IMAGE : MAX_SMALL_IMAGE;
    if (file.size > maxSize) {
      setMediaError({
        slot,
        message: `Image must be under ${maxSize === MAX_LARGE_IMAGE ? "10 MB" : "5 MB"}.`,
      });
      return;
    }

    setMediaBusy(slot);
    setMediaError(null);
    try {
      const formData = new FormData();
      formData.set("repo", repo);
      formData.set("slot", slot);
      formData.set("expectedCid", (slot === "logo" ? org.cid : profile.cid) ?? "");
      formData.set("file", file);

      const result = await saveProfileMedia(formData);
      if (!result.ok) {
        setMediaError({ slot, message: result.message });
        return;
      }
      if (slot === "logo") {
        setOrg((prev) => ({ ...prev, exists: true, cid: result.cid, logoUrl: result.url }));
        toast.success("Logo updated.");
      } else if (slot === "avatar") {
        setProfile((prev) => ({ ...prev, cid: result.cid, avatarUrl: result.url }));
        toast.success("Photo updated.");
      } else {
        setProfile((prev) => ({ ...prev, cid: result.cid, bannerUrl: result.url }));
        toast.success("Banner updated.");
      }
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setMediaBusy(null);
    }
  };

  const handleMediaRemove = async (slot: "avatar" | "banner" | "logo") => {
    setMediaBusy(slot);
    setMediaError(null);
    try {
      const formData = new FormData();
      formData.set("repo", repo);
      formData.set("slot", slot);
      formData.set("expectedCid", (slot === "logo" ? org.cid : profile.cid) ?? "");
      formData.set("remove", "true");

      const result = await saveProfileMedia(formData);
      if (!result.ok) {
        setMediaError({ slot, message: result.message });
        return;
      }
      if (slot === "logo") {
        setOrg((prev) => ({ ...prev, cid: result.cid, logoUrl: null }));
        toast.success("Logo removed.");
      } else if (slot === "avatar") {
        setProfile((prev) => ({ ...prev, cid: result.cid, avatarUrl: null }));
        toast.success("Photo removed.");
      } else {
        setProfile((prev) => ({ ...prev, cid: result.cid, bannerUrl: null }));
        toast.success("Banner removed.");
      }
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setMediaBusy(null);
    }
  };

  const renderEditAction = (row: EditableRow) =>
    editing === row ? (
      <SettingsAction tone="muted" onClick={cancelEdit} disabled={saving}>
        Cancel
      </SettingsAction>
    ) : (
      <SettingsAction onClick={() => openEdit(row)} disabled={saving || mediaBusy !== null}>
        Edit
      </SettingsAction>
    );

  const safeWebsite = profile.website ? safeUrl(profile.website) : null;
  const resolvedLocationLabel =
    org.locationUri &&
    (locationName ??
      savedLocations.find((p) => p.uri === org.locationUri)?.name ??
      org.locationUri);

  return (
    <>
      <SettingsGroup
        title="Details"
        description="Shown on your public Certified profile and saved to your repository."
      >
        {/* Photo (avatar) */}
        <SettingsRow
          label="Photo"
          description="Shown on your profile and next to your records. JPEG, PNG, or WebP up to 5 MB."
          actions={
            <>
              {profile.avatarUrl && (
                <SettingsAction
                  tone="muted"
                  onClick={() => void handleMediaRemove("avatar")}
                  disabled={mediaBusy !== null || saving}
                >
                  {mediaBusy === "avatar" ? "Updating…" : "Delete"}
                </SettingsAction>
              )}
              <SettingsAction
                onClick={() => avatarInputRef.current?.click()}
                disabled={mediaBusy !== null || saving}
              >
                {mediaBusy === "avatar" ? "Uploading…" : "Upload"}
              </SettingsAction>
            </>
          }
        >
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            aria-label="Upload profile photo"
            onChange={(e) => void handleMediaUpload("avatar", e)}
          />
          {profile.avatarUrl ? (
            /* biome-ignore lint/performance/noImgElement: AT Protocol blob CDN image */
            <img
              src={profile.avatarUrl}
              alt=""
              className="settings-avatar-preview"
              data-organization={isOrgShape ? "" : undefined}
            />
          ) : (
            <ActorAvatar
              actor={{
                did: repo,
                handle,
                displayName: profile.displayName,
                avatarUrl: null,
                isOrganization: isOrgShape,
              }}
              size="lg"
            />
          )}
          {mediaError?.slot === "avatar" && <ErrorMessage live>{mediaError.message}</ErrorMessage>}
        </SettingsRow>

        {/* Banner */}
        <SettingsRow
          label="Banner"
          description="Wide cover image at the top of your profile. Up to 10 MB."
          actions={
            <>
              {profile.bannerUrl && (
                <SettingsAction
                  tone="muted"
                  onClick={() => void handleMediaRemove("banner")}
                  disabled={mediaBusy !== null || saving}
                >
                  {mediaBusy === "banner" ? "Updating…" : "Delete"}
                </SettingsAction>
              )}
              <SettingsAction
                onClick={() => bannerInputRef.current?.click()}
                disabled={mediaBusy !== null || saving}
              >
                {mediaBusy === "banner" ? "Uploading…" : "Upload"}
              </SettingsAction>
            </>
          }
        >
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            aria-label="Upload profile banner"
            onChange={(e) => void handleMediaUpload("banner", e)}
          />
          {profile.bannerUrl ? (
            /* biome-ignore lint/performance/noImgElement: AT Protocol blob CDN image */
            <img src={profile.bannerUrl} alt="" className="settings-banner-preview" />
          ) : (
            <NotSet label="No banner" />
          )}
          {mediaError?.slot === "banner" && <ErrorMessage live>{mediaError.message}</ErrorMessage>}
        </SettingsRow>

        {/* Display name */}
        <SettingsRow
          label="Display name"
          description="How your name appears across Certified."
          actions={renderEditAction("displayName")}
        >
          {editing === "displayName" ? (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitProfilePatch({ displayName: textDraft }, "Display name saved.");
              }}
            >
              <Field label="Display name" error={rowError ?? undefined}>
                {(field) => (
                  <Input
                    {...field}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.currentTarget.value)}
                    maxLength={640}
                    placeholder="Your name"
                    autoFocus
                  />
                )}
              </Field>
              <div className="settings-form-actions">
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : profile.displayName ? (
            <Text dir="auto">{profile.displayName}</Text>
          ) : (
            <NotSet />
          )}
        </SettingsRow>

        {/* Pronouns */}
        <SettingsRow
          label="Pronouns"
          description="Optional pronouns shown on your profile."
          actions={renderEditAction("pronouns")}
        >
          {editing === "pronouns" ? (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitProfilePatch({ pronouns: textDraft }, "Pronouns saved.");
              }}
            >
              <Field label="Pronouns" error={rowError ?? undefined}>
                {(field) => (
                  <Input
                    {...field}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.currentTarget.value)}
                    maxLength={200}
                    placeholder="she/her, they/them…"
                    autoFocus
                  />
                )}
              </Field>
              <div className="settings-form-actions">
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : profile.pronouns ? (
            <Text dir="auto">{profile.pronouns}</Text>
          ) : (
            <NotSet />
          )}
        </SettingsRow>

        {/* Bio */}
        <SettingsRow
          label="Bio"
          description="A short summary shown at the top of your profile."
          actions={renderEditAction("description")}
        >
          {editing === "description" ? (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitProfilePatch({ description: textDraft }, "Bio saved.");
              }}
            >
              <Field label="Bio" description="Up to 256 characters." error={rowError ?? undefined}>
                {(field) => (
                  <Textarea
                    {...field}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.currentTarget.value)}
                    rows={4}
                    placeholder="What you work on…"
                    autoFocus
                  />
                )}
              </Field>
              <div className="settings-form-actions">
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : profile.description ? (
            <Text className="settings-multiline" dir="auto">
              {profile.description}
            </Text>
          ) : (
            <NotSet />
          )}
        </SettingsRow>

        {/* Website */}
        <SettingsRow
          label="Website"
          description="Your main website or homepage."
          actions={renderEditAction("website")}
        >
          {editing === "website" ? (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitProfilePatch({ website: textDraft }, "Website saved.");
              }}
            >
              <Field label="Website URL" error={rowError ?? undefined}>
                {(field) => (
                  <Input
                    {...field}
                    type="url"
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.currentTarget.value)}
                    placeholder="https://example.org"
                    autoFocus
                  />
                )}
              </Field>
              <div className="settings-form-actions">
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : safeWebsite ? (
            <a
              href={safeWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="break-anywhere"
            >
              {profile.website}
            </a>
          ) : profile.website ? (
            <Text className="break-anywhere">{profile.website}</Text>
          ) : (
            <NotSet />
          )}
        </SettingsRow>

        {/* Languages */}
        <SettingsRow
          label="Languages"
          description="Up to 3 language codes (BCP-47, for example en, es, pt-BR)."
          actions={renderEditAction("langs")}
        >
          {editing === "langs" ? (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                const tags = parseTags(textDraft);
                if (tags.length > 3) {
                  setRowError("Choose at most 3 language codes.");
                  return;
                }
                void submitProfilePatch({ langs: tags }, "Languages saved.");
              }}
            >
              <Field
                label="Language codes"
                description="Separate codes with commas (up to 3)."
                error={rowError ?? undefined}
              >
                {(field) => (
                  <Input
                    {...field}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.currentTarget.value)}
                    placeholder="en, es, fr"
                    autoFocus
                  />
                )}
              </Field>
              <div className="settings-form-actions">
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : profile.langs.length > 0 ? (
            <div className="settings-tag-list">
              {profile.langs.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <NotSet />
          )}
        </SettingsRow>
      </SettingsGroup>

      {/* Organization details */}
      <SettingsGroup
        title="Organization details"
        description="Structured details for organizations, collectives, and projects."
      >
        {!orgExpanded ? (
          <SettingsRow
            label="Organization profile"
            description="Add a logo, legal name, public email, location, links, and an extended about section."
            actions={<SettingsAction onClick={() => setOrgExpanded(true)}>Set up</SettingsAction>}
          >
            <NotSet label="Not set up" />
          </SettingsRow>
        ) : (
          <>
            {/* Logo */}
            <SettingsRow
              label="Logo"
              description="Horizontal logo or wordmark. JPEG, PNG, or WebP up to 5 MB."
              actions={
                <>
                  {org.logoUrl && (
                    <SettingsAction
                      tone="muted"
                      onClick={() => void handleMediaRemove("logo")}
                      disabled={mediaBusy !== null || saving}
                    >
                      {mediaBusy === "logo" ? "Updating…" : "Delete"}
                    </SettingsAction>
                  )}
                  <SettingsAction
                    onClick={() => logoInputRef.current?.click()}
                    disabled={mediaBusy !== null || saving}
                  >
                    {mediaBusy === "logo" ? "Uploading…" : "Upload"}
                  </SettingsAction>
                </>
              }
            >
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="visually-hidden"
                aria-label="Upload organization logo"
                onChange={(e) => void handleMediaUpload("logo", e)}
              />
              {org.logoUrl ? (
                /* biome-ignore lint/performance/noImgElement: AT Protocol blob CDN image */
                <img src={org.logoUrl} alt="" className="settings-logo-preview" />
              ) : (
                <NotSet label="No logo" />
              )}
              {mediaError?.slot === "logo" && (
                <ErrorMessage live>{mediaError.message}</ErrorMessage>
              )}
            </SettingsRow>

            {/* Legal name */}
            <SettingsRow
              label="Legal name"
              description="Registered or formal organization name."
              actions={renderEditAction("legalName")}
            >
              {editing === "legalName" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitOrgPatch({ legalName: textDraft }, "Legal name saved.");
                  }}
                >
                  <Field label="Legal name" error={rowError ?? undefined}>
                    {(field) => (
                      <Input
                        {...field}
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.currentTarget.value)}
                        placeholder="Registered entity name"
                        autoFocus
                      />
                    )}
                  </Field>
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.legalName ? (
                <Text dir="auto">{org.legalName}</Text>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Public email */}
            <SettingsRow
              label="Public email"
              description="Shown publicly on your profile for inquiries."
              actions={renderEditAction("publicEmail")}
            >
              {editing === "publicEmail" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitOrgPatch({ publicEmail: textDraft }, "Public email saved.");
                  }}
                >
                  <Field
                    label="Public contact email"
                    description="Visible to everyone — different from your private sign-in email."
                    error={rowError ?? undefined}
                  >
                    {(field) => (
                      <Input
                        {...field}
                        type="email"
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.currentTarget.value)}
                        placeholder="hello@example.org"
                        autoFocus
                      />
                    )}
                  </Field>
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.publicEmail ? (
                <a href={`mailto:${org.publicEmail}`} className="break-anywhere">
                  {org.publicEmail}
                </a>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Organization type */}
            <SettingsRow
              label="Organization type"
              description="How this organization is structured."
              actions={renderEditAction("organizationType")}
            >
              {editing === "organizationType" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const custom = customOrgTypes
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const combined = [...new Set([...selectedOrgTypes, ...custom])];
                    void submitOrgPatch({ organizationType: combined }, "Organization type saved.");
                  }}
                >
                  <div className="settings-checkbox-grid">
                    {COMMON_ORG_TYPES.map((type) => (
                      <Checkbox
                        key={type.value}
                        label={type.label}
                        checked={selectedOrgTypes.includes(type.value)}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          setSelectedOrgTypes((prev) =>
                            checked
                              ? [...prev, type.value]
                              : prev.filter((item) => item !== type.value),
                          );
                        }}
                      />
                    ))}
                  </div>
                  <Field
                    label="Other types"
                    description="Optional comma-separated custom types."
                    error={rowError ?? undefined}
                  >
                    {(field) => (
                      <Input
                        {...field}
                        value={customOrgTypes}
                        onChange={(e) => setCustomOrgTypes(e.currentTarget.value)}
                        placeholder="e.g. dao, mutual-aid"
                      />
                    )}
                  </Field>
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.organizationType.length > 0 ? (
                <div className="settings-tag-list">
                  {org.organizationType.map((type) => (
                    <Badge key={type} variant="neutral">
                      {formatOrgType(type)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Founded date */}
            <SettingsRow
              label="Founded date"
              description="When the organization was founded."
              actions={renderEditAction("foundedDate")}
            >
              {editing === "foundedDate" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitOrgPatch({ foundedDate: dateDraft }, "Founded date saved.");
                  }}
                >
                  <Field label="Founded date" error={rowError ?? undefined}>
                    {(wiring) => (
                      <div className="date-field">
                        <DatePicker
                          id={wiring.id}
                          aria-describedby={wiring["aria-describedby"]}
                          invalid={wiring.invalid}
                          label="Founded date"
                          value={fromISODate(dateDraft)}
                          onChange={(date) => setDateDraft(toISODate(date))}
                        />
                        {dateDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Clear founded date"
                            onClick={() => setDateDraft("")}
                          >
                            <X size={16} aria-hidden />
                          </Button>
                        )}
                      </div>
                    )}
                  </Field>
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.foundedDate ? (
                <Text>{formatDateDisplay(org.foundedDate)}</Text>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Primary location */}
            <SettingsRow
              label="Primary location"
              description="Where the organization is based."
              actions={renderEditAction("location")}
            >
              {editing === "location" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitOrgPatch(
                      { locationChoice: locationDraft },
                      locationDraft ? "Primary location saved." : "Primary location removed.",
                      locationDraft ? locationDraft.name : null,
                    );
                  }}
                >
                  <LocationField
                    label="Primary location"
                    value={locationDraft}
                    onChange={setLocationDraft}
                    saved={savedLocations}
                    error={rowError ?? undefined}
                  />
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : resolvedLocationLabel ? (
                <Text dir="auto">{resolvedLocationLabel}</Text>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Reference links (urls) */}
            <SettingsRow
              label="Links"
              description="Additional websites, social profiles, or donation pages."
              actions={renderEditAction("urls")}
            >
              {editing === "urls" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleaned = urlsDraft
                      .map(({ url, label }) => ({ url: url.trim(), label: label.trim() }))
                      .filter((item) => item.url.length > 0);
                    void submitOrgPatch({ urls: cleaned }, "Links saved.");
                  }}
                >
                  {urlsDraft.map((item, idx) => (
                    <div key={item.key} className="settings-url-editor-row">
                      <Field label={idx === 0 ? "Label" : undefined}>
                        {(field) => (
                          <Input
                            {...field}
                            aria-label={`Link ${idx + 1} label`}
                            value={item.label}
                            onChange={(e) => {
                              const val = e.currentTarget.value;
                              setUrlsDraft((prev) =>
                                prev.map((row) =>
                                  row.key === item.key ? { ...row, label: val } : row,
                                ),
                              );
                            }}
                            placeholder="Donation page"
                          />
                        )}
                      </Field>
                      <Field label={idx === 0 ? "URL" : undefined}>
                        {(field) => (
                          <Input
                            {...field}
                            type="url"
                            aria-label={`Link ${idx + 1} URL`}
                            value={item.url}
                            onChange={(e) => {
                              const val = e.currentTarget.value;
                              setUrlsDraft((prev) =>
                                prev.map((row) =>
                                  row.key === item.key ? { ...row, url: val } : row,
                                ),
                              );
                            }}
                            placeholder="https://example.org"
                          />
                        )}
                      </Field>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove link ${idx + 1}`}
                        onClick={() =>
                          setUrlsDraft((prev) => prev.filter((row) => row.key !== item.key))
                        }
                      >
                        <Trash2 size={16} aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setUrlsDraft((prev) => [
                          ...prev,
                          { url: "", label: "", key: nextUrlKey.current++ },
                        ])
                      }
                    >
                      <Plus size={14} aria-hidden />
                      Add link
                    </Button>
                  </div>
                  {rowError && <ErrorMessage live>{rowError}</ErrorMessage>}
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.urls.length > 0 ? (
                <ul className="settings-url-list">
                  {org.urls.map((item) => {
                    const safe = safeUrl(item.url);
                    return (
                      <li key={`${item.url}-${item.label}`}>
                        {safe ? (
                          <a
                            href={safe}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-anywhere"
                          >
                            {item.label ? `${item.label} (${item.url})` : item.url}
                          </a>
                        ) : (
                          <Text className="break-anywhere">
                            {item.label ? `${item.label} (${item.url})` : item.url}
                          </Text>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Long description (About) */}
            <SettingsRow
              label="About"
              description="Extended description shown on your profile."
              actions={
                org.longDescriptionReadOnly ? undefined : renderEditAction("longDescription")
              }
            >
              {org.longDescriptionReadOnly ? (
                <Text size="body-sm" tone="muted">
                  Managed as a rich Leaflet document in another app; editing here is disabled to
                  preserve its formatting.
                </Text>
              ) : editing === "longDescription" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitOrgPatch({ longDescription: textDraft }, "About saved.");
                  }}
                >
                  <Field label="About" error={rowError ?? undefined}>
                    {(field) => (
                      <Textarea
                        {...field}
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.currentTarget.value)}
                        rows={6}
                        placeholder="Describe your organization's mission and work…"
                        autoFocus
                      />
                    )}
                  </Field>
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.longDescription ? (
                <Text className="settings-multiline" dir="auto">
                  {org.longDescription}
                </Text>
              ) : (
                <NotSet />
              )}
            </SettingsRow>

            {/* Visibility */}
            <SettingsRow
              label="Visibility"
              description="Whether this organization appears in public directories."
              actions={renderEditAction("visibility")}
            >
              {editing === "visibility" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitOrgPatch({ visibility: visibilityDraft }, "Visibility saved.");
                  }}
                >
                  <SegmentedControl
                    label="Directory visibility"
                    value={visibilityDraft}
                    onChange={(next) => setVisibilityDraft(next as "public" | "unlisted")}
                    options={[
                      { value: "public", label: "Public" },
                      { value: "unlisted", label: "Unlisted" },
                    ]}
                  />
                  {rowError && <ErrorMessage live>{rowError}</ErrorMessage>}
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Text>{org.visibility === "unlisted" ? "Unlisted" : "Public"}</Text>
              )}
            </SettingsRow>

            {/* Organization languages */}
            <SettingsRow
              label="Organization languages"
              description="Up to 3 language codes (BCP-47) for these organization details."
              actions={renderEditAction("orgLangs")}
            >
              {editing === "orgLangs" ? (
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const tags = parseTags(textDraft);
                    if (tags.length > 3) {
                      setRowError("Choose at most 3 language codes.");
                      return;
                    }
                    void submitOrgPatch({ langs: tags }, "Organization languages saved.");
                  }}
                >
                  <Field
                    label="Language codes"
                    description="Separate codes with commas (up to 3)."
                    error={rowError ?? undefined}
                  >
                    {(field) => (
                      <Input
                        {...field}
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.currentTarget.value)}
                        placeholder="en, es, fr"
                        autoFocus
                      />
                    )}
                  </Field>
                  <div className="settings-form-actions">
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : org.langs.length > 0 ? (
                <div className="settings-tag-list">
                  {org.langs.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <NotSet />
              )}
            </SettingsRow>
          </>
        )}
      </SettingsGroup>
    </>
  );
}
