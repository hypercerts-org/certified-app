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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ResponsiveDialog,
  SegmentedControl,
  Text,
  Textarea,
} from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { HandleId, PermanentId } from "@/components/account-ids";
import { ActorPicker } from "@/components/actor-picker";
import { notifyActingAsChanged } from "@/components/like-button";
import { switchActingAs } from "@/lib/acting-as-actions";
import { ROW_ACTION } from "@/lib/button-roles";
import * as groupActions from "@/lib/hypercerts/group-actions";

/** "New group": registers a group on CGS and initializes its organization record. */
export function NewGroupDialog({
  pdsDomain = "certified.one",
  open: controlledOpen,
  onOpenChange,
}: {
  pdsDomain?: string;
  /** Controlled open state when triggered from a menu (hides the built-in trigger button). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const formId = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openingWorkspace, setOpeningWorkspace] = useState(false);
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
    if (submitting || openingWorkspace) return;
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
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      toast(`Created @${result.handle}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!controlled && (
        <Button
          {...ROW_ACTION}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <Plus size={16} aria-hidden />
          New group
        </Button>
      )}
      <ResponsiveDialog
        open={open}
        onClose={close}
        title={created ? "Group created" : "New group"}
        description={
          created
            ? created.accountPassword
              ? "Save the recovery password below before closing — it is shown only once."
              : "Your group is ready. You can open its workspace or invite members from group settings."
            : "Create a shared group account on Certified. You start as its owner and can invite teammates."
        }
        footer={
          created ? (
            <>
              <Button variant="secondary" disabled={openingWorkspace} onClick={close}>
                Done
              </Button>
              <Button
                variant="primary"
                loading={openingWorkspace}
                onClick={async () => {
                  const { groupDid, href } = created;
                  setOpeningWorkspace(true);
                  try {
                    const switched = await switchActingAs(groupDid);
                    if (switched.ok) notifyActingAsChanged();
                  } finally {
                    setOpeningWorkspace(false);
                  }
                  setOpen(false);
                  reset();
                  router.push(href);
                  router.refresh();
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
              <Button type="submit" form={formId} variant="primary" loading={submitting}>
                Create group
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div className="stack">
            {created.profileNote && <Banner tone="warning">{created.profileNote}</Banner>}
            <dl className="facts">
              <div className="fact">
                <dt>Handle</dt>
                <dd>
                  <HandleId handle={created.handle} label="Group handle" />
                </dd>
              </div>
              <div className="fact">
                <dt>Permanent ID</dt>
                <dd>
                  <PermanentId value={created.groupDid} label="Group permanent ID" />
                </dd>
              </div>
              {created.accountPassword && (
                <div className="fact">
                  <dt>Account password</dt>
                  <dd>
                    <CopyableId
                      value={created.accountPassword}
                      displayValue={created.accountPassword}
                      label="Account password"
                      wrap
                    />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
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
              label="Handle"
              description="Letters, numbers, and hyphens. You can connect a custom domain later in group settings."
            >
              {(field) => (
                <InputGroup>
                  <InputGroupInput
                    {...field}
                    value={handle}
                    onChange={(e) => setHandle(e.currentTarget.value)}
                    placeholder="my-group"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={63}
                    required
                  />
                  <InputGroupAddon>.{pdsDomain}</InputGroupAddon>
                </InputGroup>
              )}
            </Field>
            <Field label="Display name" description="Optional. Shown on the group's profile.">
              {(field) => (
                <Input
                  {...field}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                  placeholder="My Group"
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
          </form>
        )}
      </ResponsiveDialog>
    </>
  );
}

/** "Add member": invites an account into a group with member or admin role. */
export function AddMemberDialog({ groupDid }: { groupDid: string }) {
  const formId = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
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
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      toast("Member added");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
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
            <Button type="submit" form={formId} variant="primary" loading={submitting}>
              Add member
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
            label="Account"
            description="Search by name or handle, or paste a DID or Certified link."
          >
            {(field) => (
              <ActorPicker
                {...field}
                value={target}
                onChange={setTarget}
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
        </form>
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
  const queryClient = useQueryClient();
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
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
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
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
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
