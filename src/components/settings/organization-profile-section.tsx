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
import { useRef, useState } from "react";
import { toast } from "sonner";
import { LocationField } from "@/components/location-picker";
import { saveOrganizationField } from "@/lib/hypercerts/profile-actions";
import type { SavedPlace } from "@/lib/hypercerts/queries";
import type { OrganizationDetails, OrganizationUrlItem } from "@/lib/hypercerts/writes";
import type { LocationChoice } from "@/lib/location-choice";
import { queryKeys } from "@/lib/query-keys";
import { safeUrl } from "@/lib/safe-url";
import { NotSet, ProfileMediaRow, parseTags } from "./profile-media-row";
import { SettingsAction, SettingsGroup, SettingsRow } from "./settings-frame";

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

type OrgEditableRow =
  | "legalName"
  | "publicEmail"
  | "organizationType"
  | "foundedDate"
  | "location"
  | "urls"
  | "longDescription"
  | "visibility"
  | "orgLangs";

/** Structured `app.certified.actor.organization/self` settings section. */
export function OrganizationProfileSection({
  repo,
  isGroup,
  initialOrganization,
  savedLocations,
  initialLocationName,
  onOrganizationCreated,
}: {
  repo: string;
  isGroup: boolean;
  initialOrganization: OrganizationDetails;
  savedLocations: SavedPlace[];
  initialLocationName: string | null;
  onOrganizationCreated: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [org, setOrg] = useState(initialOrganization);
  const [expanded, setExpanded] = useState(initialOrganization.exists || isGroup);
  const [locationName, setLocationName] = useState<string | null>(() => {
    if (initialLocationName) return initialLocationName;
    if (!initialOrganization.locationUri) return null;
    return savedLocations.find((p) => p.uri === initialOrganization.locationUri)?.name ?? null;
  });

  const [editing, setEditing] = useState<OrgEditableRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const [textDraft, setTextDraft] = useState("");
  const [selectedOrgTypes, setSelectedOrgTypes] = useState<string[]>([]);
  const [customOrgTypes, setCustomOrgTypes] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState<LocationChoice | null>(null);
  const [urlsDraft, setUrlsDraft] = useState<Array<OrganizationUrlItem & { key: number }>>([]);
  const [visibilityDraft, setVisibilityDraft] = useState<"public" | "unlisted">("public");
  const nextUrlKey = useRef(1);

  const cancelEdit = () => {
    setEditing(null);
    setRowError(null);
  };

  const openEdit = (row: OrgEditableRow) => {
    setRowError(null);
    setEditing(row);
    switch (row) {
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
      if (result.data.exists) onOrganizationCreated();
      if (nextLocationName !== undefined) setLocationName(nextLocationName);
      setEditing(null);
      toast.success(successMessage);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const renderEditAction = (row: OrgEditableRow) =>
    editing === row ? (
      <SettingsAction tone="muted" onClick={cancelEdit} disabled={saving}>
        Cancel
      </SettingsAction>
    ) : (
      <SettingsAction onClick={() => openEdit(row)} disabled={saving}>
        Edit
      </SettingsAction>
    );

  const resolvedLocationLabel =
    org.locationUri &&
    (locationName ??
      savedLocations.find((p) => p.uri === org.locationUri)?.name ??
      org.locationUri);

  return (
    <SettingsGroup
      title="Organization details"
      description="Structured details for organizations, collectives, and projects."
    >
      {!expanded ? (
        <SettingsRow
          label="Organization profile"
          description="Add a logo, legal name, public email, location, links, and an extended about section."
          actions={<SettingsAction onClick={() => setExpanded(true)}>Set up</SettingsAction>}
        >
          <NotSet label="Not set up" />
        </SettingsRow>
      ) : (
        <>
          <ProfileMediaRow
            repo={repo}
            slot="logo"
            expectedCid={org.cid}
            label="Logo"
            description="Horizontal logo or wordmark. JPEG, PNG, or WebP up to 5 MB."
            ariaLabel="Upload organization logo"
            hasImage={Boolean(org.logoUrl)}
            disabled={saving}
            updatedToast="Logo updated."
            removedToast="Logo removed."
            onChange={({ cid, url }) => {
              setOrg((prev) => ({
                ...prev,
                exists: url !== null ? true : prev.exists,
                cid,
                logoUrl: url,
              }));
              if (url !== null) onOrganizationCreated();
            }}
          >
            {org.logoUrl ? (
              /* biome-ignore lint/performance/noImgElement: AT Protocol blob CDN image */
              <img src={org.logoUrl} alt="" className="settings-logo-preview" />
            ) : (
              <NotSet label="No logo" />
            )}
          </ProfileMediaRow>

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

          <SettingsRow
            label="About"
            description="Extended description shown on your profile."
            actions={org.longDescriptionReadOnly ? undefined : renderEditAction("longDescription")}
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
  );
}
