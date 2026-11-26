"use client";

import { Badge, Button, Field, Input, Text, Textarea } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ActorAvatar } from "@/components/actor";
import { saveProfileField } from "@/lib/hypercerts/profile-actions";
import type { SavedPlace } from "@/lib/hypercerts/queries";
import type { OrganizationDetails, ProfileDetails } from "@/lib/hypercerts/writes";
import { safeUrl } from "@/lib/safe-url";
import { OrganizationProfileSection } from "./organization-profile-section";
import { NotSet, ProfileMediaRow, parseTags } from "./profile-media-row";
import { SettingsAction, SettingsGroup, SettingsRow } from "./settings-frame";

type ProfileEditableRow = "displayName" | "pronouns" | "description" | "website" | "langs";

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
  const [orgExists, setOrgExists] = useState(initialOrganization.exists);
  const [editing, setEditing] = useState<ProfileEditableRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const isOrgShape = isGroup || orgExists;

  const cancelEdit = () => {
    setEditing(null);
    setRowError(null);
  };

  const openEdit = (row: ProfileEditableRow) => {
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

  const renderEditAction = (row: ProfileEditableRow) =>
    editing === row ? (
      <SettingsAction tone="muted" onClick={cancelEdit} disabled={saving}>
        Cancel
      </SettingsAction>
    ) : (
      <SettingsAction onClick={() => openEdit(row)} disabled={saving}>
        Edit
      </SettingsAction>
    );

  const safeWebsite = profile.website ? safeUrl(profile.website) : null;

  return (
    <>
      <SettingsGroup
        title="Details"
        description="Shown on your public Certified profile and saved to your repository."
      >
        <ProfileMediaRow
          repo={repo}
          slot="avatar"
          expectedCid={profile.cid}
          label="Photo"
          description="Shown on your profile and next to your records. JPEG, PNG, or WebP up to 5 MB."
          ariaLabel="Upload profile photo"
          hasImage={Boolean(profile.avatarUrl)}
          disabled={saving}
          updatedToast="Photo updated."
          removedToast="Photo removed."
          onChange={({ cid, url }) => setProfile((prev) => ({ ...prev, cid, avatarUrl: url }))}
        >
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
        </ProfileMediaRow>

        <ProfileMediaRow
          repo={repo}
          slot="banner"
          expectedCid={profile.cid}
          label="Banner"
          description="Wide cover image at the top of your profile. Up to 10 MB."
          ariaLabel="Upload profile banner"
          hasImage={Boolean(profile.bannerUrl)}
          disabled={saving}
          updatedToast="Banner updated."
          removedToast="Banner removed."
          onChange={({ cid, url }) => setProfile((prev) => ({ ...prev, cid, bannerUrl: url }))}
        >
          {profile.bannerUrl ? (
            /* biome-ignore lint/performance/noImgElement: AT Protocol blob CDN image */
            <img src={profile.bannerUrl} alt="" className="settings-banner-preview" />
          ) : (
            <NotSet label="No banner" />
          )}
        </ProfileMediaRow>

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

      <OrganizationProfileSection
        repo={repo}
        isGroup={isGroup}
        initialOrganization={initialOrganization}
        savedLocations={savedLocations}
        initialLocationName={initialLocationName}
        onOrganizationCreated={() => setOrgExists(true)}
      />
    </>
  );
}
