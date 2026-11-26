"use client";

// Workspace → Badges interactive controls: accepting/rejecting received badges,
// creating a badge (a definition, with optional icon upload), and awarding one
// of the account's badges to an account or record. Creating opens Your
// badges, and awarding opens Awarded, where the result shows.

import {
  Banner,
  Button,
  CharacterCount,
  DatePicker,
  Field,
  FileDropzone,
  formatFileSize,
  fromISODate,
  Input,
  ResponsiveDialog,
  SegmentedControl,
  Select,
  Text,
  Textarea,
  toISODate,
} from "@hypercerts-org/ui-react";
import { Award, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import * as badgeActions from "@/lib/hypercerts/badge-actions";
import { workspaceHref } from "@/lib/routes";

const BADGE_TYPES = [
  { value: "certification", label: "Certification" },
  { value: "verification", label: "Verification" },
  { value: "recognition", label: "Recognition" },
  { value: "participation", label: "Participation" },
  { value: "affiliation", label: "Affiliation" },
  { value: "endorsement", label: "Endorsement" },
  { value: "custom", label: "Other…" },
] as const;

const MAX_ICON_BYTES = 1_048_576;

/** Accept / Reject buttons on a received badge row in Workspace → Badges. */
export function BadgeResponseButtons({
  repo,
  awardUri,
  badgeUri,
  kind,
}: {
  repo: string;
  awardUri: string;
  badgeUri: string;
  kind: "awaiting" | "accepted" | "rejected";
}) {
  const [acting, setActing] = useState<"accepted" | "rejected" | null>(null);
  const [pending, startTransition] = useTransition();

  const respond = (response: "accepted" | "rejected") => {
    if (pending) return;
    setActing(response);
    startTransition(async () => {
      try {
        const result = await badgeActions
          .respondToBadge(repo, { awardUri, badgeUri, response })
          .catch(() => ({
            ok: false as const,
            message: "We couldn't confirm whether your response was saved. Reload to check.",
          }));
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast(response === "accepted" ? "Badge accepted" : "Badge rejected");
      } finally {
        setActing(null);
      }
    });
  };

  return (
    <>
      {kind !== "accepted" && (
        <Button
          variant="primary"
          size="sm"
          loading={pending && acting === "accepted"}
          disabled={pending}
          onClick={() => respond("accepted")}
        >
          Accept
        </Button>
      )}
      {kind !== "rejected" && (
        <Button
          variant="secondary"
          size="sm"
          loading={pending && acting === "rejected"}
          disabled={pending}
          onClick={() => respond("rejected")}
        >
          Reject
        </Button>
      )}
    </>
  );
}

/** "Create badge": creates an `app.certified.badge.definition` via the Hypercerts SDK. */
export function NewBadgeDialog({ repo }: { repo: string }) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [preset, setPreset] = useState<string>("certification");
  const [customType, setCustomType] = useState("");
  const [description, setDescription] = useState("");
  const [issuerPolicy, setIssuerPolicy] = useState<"self" | "anyone">("self");
  const [icon, setIcon] = useState<File | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle("");
    setPreset("certification");
    setCustomType("");
    setDescription("");
    setIssuerPolicy("self");
    setIcon(null);
    setIconError(null);
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async () => {
    if (submitting) return;
    const badgeType = preset === "custom" ? customType.trim() : preset;
    if (!title.trim()) {
      setError("Add a title for the badge.");
      return;
    }
    if (!badgeType) {
      setError("Enter a badge type.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("title", title.trim());
      data.set("badgeType", badgeType);
      if (description.trim()) data.set("description", description.trim());
      data.set("issuerPolicy", issuerPolicy);
      if (icon) data.set("icon", icon);

      const result = await badgeActions.createBadge(repo, data).catch(() => ({
        ok: false as const,
        message: "We couldn't confirm whether the badge was created. Reload to check.",
      }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
      toast("Badge created");
      router.push(`${workspaceHref(repo)}/badges/yours`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setIconError(null);
          setOpen(true);
        }}
      >
        <Plus size={16} aria-hidden />
        Create badge
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Create badge"
        description="A badge you can award to accounts, projects, or activities. Each recipient chooses whether to accept it."
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={submitting}>
              Create badge
            </Button>
          </>
        }
      >
        <form
          id={formId}
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          <Field label="Title">
            {(field) => (
              <Input
                {...field}
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                placeholder="e.g. Verified Steward"
                maxLength={256}
                required
              />
            )}
          </Field>
          <Field label="Type">
            {(field) => (
              <Select {...field} value={preset} onChange={(e) => setPreset(e.currentTarget.value)}>
                {BADGE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {preset === "custom" && (
            <Field label="Custom type">
              {(field) => (
                <Input
                  {...field}
                  value={customType}
                  onChange={(e) => setCustomType(e.currentTarget.value)}
                  placeholder="e.g. grantee"
                  maxLength={100}
                  required
                />
              )}
            </Field>
          )}
          <Field label="Description" description="Optional. What earning this badge represents.">
            {(field) => (
              <>
                <Textarea
                  {...field}
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                  rows={3}
                />
                <CharacterCount value={description} max={500} />
              </>
            )}
          </Field>
          <Field
            label="Icon"
            description="Optional. PNG, JPEG, WebP, or SVG up to 1 MB."
            error={iconError ?? undefined}
          >
            {() =>
              icon ? (
                <div className="manage-list-bar">
                  <Text size="body-sm">
                    {icon.name} ({formatFileSize(icon.size)})
                  </Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIcon(null);
                      setIconError(null);
                    }}
                  >
                    <X size={16} aria-hidden />
                    Remove
                  </Button>
                </div>
              ) : (
                <FileDropzone
                  accept="image/png,image/jpeg,image/webp"
                  maxSize={MAX_ICON_BYTES}
                  label="Choose an icon or drop one here"
                  hint="PNG, JPEG, or WebP · up to 1 MB"
                  onSelect={(files) => {
                    setIconError(null);
                    setIcon(files[0] ?? null);
                  }}
                  onReject={(rejections) => {
                    const reason = rejections[0]?.reason;
                    setIconError(
                      reason === "size"
                        ? "Icon must be 1 MB or smaller."
                        : "Icon must be a PNG, JPEG, or WebP image.",
                    );
                  }}
                />
              )
            }
          </Field>
          <SegmentedControl
            label="Who can award this badge"
            options={[
              { value: "self", label: "Only this account" },
              { value: "anyone", label: "Anyone" },
            ]}
            value={issuerPolicy}
            onChange={(next) => setIssuerPolicy(next as "self" | "anyone")}
          />
        </form>
      </ResponsiveDialog>
    </>
  );
}

/** "Award": awards an issued badge definition to an account, project, or activity. */
export function AwardBadgeDialog({
  repo,
  definitionUri,
  badgeTitle,
}: {
  repo: string;
  definitionUri: string;
  badgeTitle: string;
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSubject("");
    setNote("");
    setUrl("");
    setValidUntil("");
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async () => {
    if (submitting) return;
    if (!subject.trim()) {
      setError("Enter a recipient handle, DID, Certified link, or record address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await badgeActions
        .awardBadgeToSubject(repo, {
          definitionUri,
          subject: subject.trim(),
          note: note.trim() || undefined,
          url: url.trim() || undefined,
          validUntil: validUntil || undefined,
        })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the badge was awarded. Reload to check.",
        }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
      toast(`Awarded "${badgeTitle}"`);
      router.push(`${workspaceHref(repo)}/badges/awarded`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Award size={16} aria-hidden />
        Award
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={close}
        title={`Award "${badgeTitle}"`}
        description="Award this badge to an account, project, or activity. The recipient decides whether to accept it."
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={submitting}>
              Award badge
            </Button>
          </>
        }
      >
        <form
          id={formId}
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          <Field
            label="Recipient"
            description="A handle (@name.bsky.social), DID, Certified link, or AT-URI."
          >
            {(field) => (
              <Input
                {...field}
                value={subject}
                onChange={(e) => setSubject(e.currentTarget.value)}
                placeholder="@hypercerts.org or https://certified.app/…"
                required
              />
            )}
          </Field>
          <Field label="Note" description="Optional. Why this badge is being awarded.">
            {(field) => (
              <>
                <Textarea
                  {...field}
                  value={note}
                  onChange={(e) => setNote(e.currentTarget.value)}
                  rows={3}
                  maxLength={500}
                />
                <CharacterCount value={note} max={500} />
              </>
            )}
          </Field>
          <Field label="Reference link" description="Optional URL with supporting context.">
            {(field) => (
              <Input
                {...field}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                placeholder="https://…"
              />
            )}
          </Field>
          <Field label="Valid until" description="Optional expiration date.">
            {(wiring) => (
              <div className="date-field">
                <DatePicker
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  invalid={wiring.invalid}
                  label="Valid until"
                  value={fromISODate(validUntil)}
                  onChange={(date) => setValidUntil(toISODate(date))}
                />
                {validUntil && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear the expiration date"
                    onClick={() => setValidUntil("")}
                  >
                    <X size={16} aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </Field>
        </form>
      </ResponsiveDialog>
    </>
  );
}
