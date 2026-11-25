"use client";

// Workspace group controls: creating a new group on CGS (with one-time
// recovery password handoff) and managing an organization's members (add,
// remove, change role).

import {
  Banner,
  Button,
  CopyableId,
  Field,
  Input,
  ResponsiveDialog,
  SegmentedControl,
  Text,
  Textarea,
} from "@hypercerts-org/ui-react";
import { Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import * as groupActions from "@/lib/hypercerts/group-actions";

/** "New group": registers a group on CGS and initializes its organization record. */
export function NewGroupDialog({ pdsDomain }: { pdsDomain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Extract<
    groupActions.CreateGroupResult,
    { ok: true }
  > | null>(null);

  const reset = () => {
    setHandle("");
    setDisplayName("");
    setDescription("");
    setEmail("");
    setError(null);
    setCreated(null);
  };

  const close = () => {
    if (submitting) return;
    const wasCreated = created !== null;
    setOpen(false);
    reset();
    if (wasCreated) router.refresh();
  };

  const submit = async () => {
    if (submitting) return;
    if (!handle.trim()) {
      setError("Choose a handle for the group.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await groupActions
        .createGroup({
          handle: handle.trim(),
          displayName: displayName.trim() || undefined,
          description: description.trim() || undefined,
          email: email.trim() || undefined,
        })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the group was created. Reload to check.",
        }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreated(result);
      toast(`Created @${result.handle}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden />
        New group
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={close}
        title={created ? "Group created" : "New group"}
        description={
          created
            ? "Save the recovery password below before closing — it is shown only once."
            : "Create a shared organization account on Certified. You start as its owner and can invite teammates."
        }
        footer={
          created ? (
            <>
              <Button variant="secondary" onClick={close}>
                Done
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const href = created.href;
                  setOpen(false);
                  reset();
                  router.push(href);
                }}
              >
                Open workspace
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={submitting} onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" loading={submitting} onClick={submit}>
                Create group
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div className="stack">
            {created.profileNote && <Banner tone="warning">{created.profileNote}</Banner>}
            <dl className="overview-id-list divided">
              <div className="overview-id-item">
                <dt>Handle</dt>
                <dd>
                  <CopyableId
                    value={created.handle}
                    displayValue={`@${created.handle}`}
                    label="Group handle"
                    className="overview-id-field"
                  />
                </dd>
              </div>
              <div className="overview-id-item">
                <dt>Permanent ID</dt>
                <dd>
                  <CopyableId
                    value={created.groupDid}
                    truncateTo={12}
                    label="Group DID"
                    className="overview-id-field"
                  />
                </dd>
              </div>
              {created.accountPassword && (
                <div className="overview-id-item">
                  <dt>Account password</dt>
                  <dd>
                    <CopyableId
                      value={created.accountPassword}
                      label="Account password"
                      className="overview-id-field"
                    />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <div className="stack">
            {error && (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            )}
            <Field
              label="Handle"
              description={`Enter a short name (becomes name.${pdsDomain}) or a full handle.`}
            >
              {(field) => (
                <Input
                  {...field}
                  value={handle}
                  onChange={(e) => setHandle(e.currentTarget.value)}
                  placeholder={`my-org`}
                  maxLength={253}
                  required
                />
              )}
            </Field>
            <Field label="Display name" description="Optional. Shown on the group's profile.">
              {(field) => (
                <Input
                  {...field}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                  placeholder="My Organization"
                  maxLength={640}
                />
              )}
            </Field>
            <Field label="Description" description="Optional. A short bio for the group.">
              {(field) => (
                <Textarea
                  {...field}
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                  rows={3}
                  maxLength={2560}
                />
              )}
            </Field>
            <Field
              label="Recovery email"
              description="Optional. Used by the PDS for account recovery."
            >
              {(field) => (
                <Input
                  {...field}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  placeholder="team@example.org"
                  maxLength={254}
                />
              )}
            </Field>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}

/** "Add member": invites an account into a group with member or admin role. */
export function AddMemberDialog({ groupDid }: { groupDid: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTarget("");
    setRole("member");
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async () => {
    if (submitting) return;
    if (!target.trim()) {
      setError("Enter a handle, DID, or Certified profile link.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await groupActions
        .addMember(groupDid, { target: target.trim(), role })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the member was added. Reload to check.",
        }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
      toast("Member added");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <UserPlus size={16} aria-hidden />
        Add member
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Add member"
        description="Members can publish and endorse as this group. Admins can also edit the profile and manage members."
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={submit}>
              Add member
            </Button>
          </>
        }
      >
        <div className="stack">
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          <Field
            label="Account"
            description="A handle (@name.bsky.social), DID, or Certified link."
          >
            {(field) => (
              <Input
                {...field}
                value={target}
                onChange={(e) => setTarget(e.currentTarget.value)}
                placeholder="@alice.bsky.social"
                required
              />
            )}
          </Field>
          <SegmentedControl
            label="Role"
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
            value={role}
            onChange={(next) => setRole(next as "member" | "admin")}
          />
        </div>
      </ResponsiveDialog>
    </>
  );
}

/** Role switch (owner) and Remove (admin/owner) controls for a non-owner group member. */
export function MemberActions({
  groupDid,
  memberDid,
  memberName,
  role,
  canChangeRole,
  canRemove,
}: {
  groupDid: string;
  memberDid: string;
  memberName: string;
  role: string;
  canChangeRole: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canChangeRole && !canRemove) return null;

  const nextRole: "member" | "admin" = role === "admin" ? "member" : "admin";

  const toggleRole = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await groupActions
        .changeMemberRole(groupDid, { memberDid, role: nextRole })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm the role change. Reload to check.",
        }));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast(`${memberName} is now ${nextRole === "admin" ? "an admin" : "a member"}`);
      router.refresh();
    });
  };

  const confirmRemove = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await groupActions.removeMember(groupDid, memberDid).catch(() => ({
        ok: false as const,
        message: "We couldn't confirm removing the member. Reload to check.",
      }));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setConfirming(false);
      toast(`Removed ${memberName}`);
      router.refresh();
    });
  };

  return (
    <span className="endorsement-row-end">
      {canChangeRole && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={toggleRole}>
          {nextRole === "admin" ? "Make admin" : "Make member"}
        </Button>
      )}
      {canRemove && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          Remove
        </Button>
      )}
      <ResponsiveDialog
        open={confirming}
        onClose={() => !pending && setConfirming(false)}
        title={`Remove ${memberName}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={pending} onClick={confirmRemove}>
              Remove
            </Button>
          </>
        }
      >
        <Text>
          {memberName} will no longer be able to act or publish on behalf of this group. Records
          they already published stay.
        </Text>
      </ResponsiveDialog>
    </span>
  );
}
