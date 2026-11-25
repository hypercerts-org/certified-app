"use client";

// Workspace → Endorsements interactive controls: hiding/showing received
// endorsements on the profile, revoking given endorsements, and endorsing
// someone by handle, DID, or Certified profile link.

import {
  Banner,
  Button,
  CharacterCount,
  Field,
  Input,
  ResponsiveDialog,
  Textarea,
} from "@hypercerts-org/ui-react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import * as endorsementActions from "@/lib/hypercerts/endorsement-actions";

/** Optimistic Hide from profile / Show on profile toggle for a received endorsement. */
export function EndorsementVisibilityButton({
  repo,
  awardUri,
  renderedHidden,
}: {
  repo: string;
  awardUri: string;
  renderedHidden: boolean;
}) {
  const [written, setWritten] = useState<{ hidden: boolean; over: boolean } | null>(null);
  const current = written && written.over === renderedHidden ? written.hidden : renderedHidden;
  const [hidden, setHidden] = useOptimistic(current);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !hidden;
    startTransition(async () => {
      setHidden(next);
      const result = await endorsementActions
        .setEndorsementVisibility(repo, { awardUri, hidden: next })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the change was saved. Reload to check.",
        }));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!result.indexed) {
        startTransition(() => setWritten({ hidden: result.hidden, over: renderedHidden }));
      }
      toast(next ? "Endorsement hidden from profile" : "Endorsement shown on profile");
    });
  };

  return (
    <Button
      variant={hidden ? "primary" : "secondary"}
      size="sm"
      disabled={pending}
      onClick={toggle}
    >
      {hidden ? "Show on profile" : "Hide from profile"}
    </Button>
  );
}

/** Revoke button + confirmation dialog for an endorsement the workspace account gave. */
export function RevokeEndorsementButton({
  repo,
  awardUri,
  subjectDid,
  subjectName,
}: {
  repo: string;
  awardUri: string;
  subjectDid: string;
  subjectName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await endorsementActions
        .revokeEndorsement(repo, { awardUri, subjectDid })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm revoking the endorsement. Reload to check.",
        }));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setConfirming(false);
      toast("Endorsement revoked");
    });
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Revoke
      </Button>
      <ResponsiveDialog
        open={confirming}
        onClose={() => !pending && setConfirming(false)}
        title="Revoke endorsement?"
        description={`Your endorsement of ${subjectName} will be removed from their profile. You can endorse them again later.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={pending} onClick={confirm}>
              Revoke endorsement
            </Button>
          </>
        }
      />
    </>
  );
}

/** "Endorse someone": dialog to endorse an account by handle, DID, or profile link, with optional note. */
export function EndorseSomeoneDialog({ repo }: { repo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTarget("");
    setNote("");
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
      const result = await endorsementActions
        .endorseFromWorkspace(repo, {
          target: target.trim(),
          note: note.trim() || undefined,
        })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm the endorsement. Reload to check.",
        }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
      toast("Endorsement sent");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden />
        Endorse someone
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Endorse someone"
        description="Endorse an account you trust. It shows on their profile unless they hide it."
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={submit}>
              Endorse
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
                placeholder="@hypercerts.org or https://certified.app/maearth.com"
                required
              />
            )}
          </Field>
          <Field label="Note" description="Optional. Why you endorse this account.">
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
        </div>
      </ResponsiveDialog>
    </>
  );
}
