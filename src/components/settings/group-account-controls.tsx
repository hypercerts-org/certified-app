"use client";

import { Banner, Button, CopyableId, Field, Input, Skeleton, Text } from "@hypercerts-org/ui-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
  confirmGroupAccountEmail,
  confirmGroupAccountPasswordReset,
  getGroupAccountStatus,
  lockGroupSession,
  readGroupAccountEmail,
  requestGroupAccountEmailConfirmation,
  requestGroupAccountEmailUpdate,
  requestGroupAccountPasswordReset,
  unlockGroupSession,
  updateGroupAccountEmail,
  updateGroupAccountHandle,
} from "@/lib/settings-actions";
import { EmailCard, HandleCard } from "./account-controls";
import { SettingsCard, SettingsCardsSkeleton } from "./settings-frame";
import { UnlockDialog, useUnlockSession } from "./unlock-session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin/owner handle + email cards for a non-self group.
 * Locked: handle is read-only, email is hidden until unlocked with the group's
 * password (short-lived Valkey session on the group's PDS).
 */
export function GroupAccountManager({
  groupDid,
  currentHandle,
  pdsDomain,
}: {
  groupDid: string;
  currentHandle: string | null;
  pdsDomain: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const relock = useCallback(() => {
    setUnlocked(false);
    setEmail(null);
    setEmailError(null);
  }, []);

  const loadEmail = useCallback(async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await readGroupAccountEmail(groupDid);
      if (!res.ok) {
        if (res.locked) {
          relock();
          return;
        }
        setEmailError(res.message);
        return;
      }
      setEmail(res.email);
      setEmailConfirmed(res.emailConfirmed);
    } finally {
      setEmailLoading(false);
    }
  }, [groupDid, relock]);

  useEffect(() => {
    let cancelled = false;
    void getGroupAccountStatus(groupDid).then((res) => {
      if (cancelled) return;
      setChecking(false);
      if (res.ok && res.unlocked) {
        setUnlocked(true);
        void loadEmail();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [groupDid, loadEmail]);

  const unlock = useUnlockSession(
    useCallback((input) => unlockGroupSession(groupDid, input), [groupDid]),
    useCallback(() => {
      setUnlockOpen(false);
      setUnlocked(true);
      void loadEmail();
    }, [loadEmail]),
  );

  const handleLock = async () => {
    setLocking(true);
    try {
      await lockGroupSession(groupDid);
      relock();
      toast("Group account locked");
    } finally {
      setLocking(false);
    }
  };

  if (checking) {
    return <SettingsCardsSkeleton count={2} />;
  }

  if (!unlocked) {
    return (
      <>
        <SettingsCard
          title="Handle"
          description="The @handle people use to find this group on Certified."
          hint="Unlock with the group's password to change its handle or set a custom domain."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setUnlockOpen(true)}>
              Unlock to edit
            </Button>
          }
        >
          <div className="settings-value-box">
            {currentHandle ? (
              <CopyableId value={currentHandle} displayValue={`@${currentHandle}`} label="Handle" />
            ) : (
              <Text size="body-sm" tone="muted">
                No handle verified
              </Text>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Email"
          description="Used to sign in directly to this group's PDS account and recover its password."
          hint="Hidden until unlocked with the group's password."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setUnlockOpen(true)}>
              Unlock group account
            </Button>
          }
        />

        <UnlockDialog
          open={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          state={unlock}
          title="Unlock group account"
          description="Enter the group account's own password to edit its handle and sign-in email. It's used once for a short session and isn't stored."
          passwordLabel="Group password"
          passwordHint="This is the recovery password shown when the group was created, not your personal password."
          invalidMessage="That password wasn't accepted for this group. If you don't know it, reset it under Password below using the group's email."
          codeHelper="We emailed a sign-in code to the group's email address."
        />
      </>
    );
  }

  return (
    <>
      <HandleCard
        did={groupDid}
        initialHandle={currentHandle}
        pdsDomain={pdsDomain}
        description="The @handle people use to find this group on Certified."
        onSave={async (next) => {
          const res = await updateGroupAccountHandle(groupDid, next);
          if (!res.ok && res.locked) relock();
          return res;
        }}
      />

      {emailLoading ? (
        <SettingsCard
          title="Email"
          description="Used to sign in directly to this group's PDS account and recover its password."
        >
          <Skeleton variant="box" className="skeleton-control" />
        </SettingsCard>
      ) : emailError ? (
        <SettingsCard
          title="Email"
          description="Used to sign in directly to this group's PDS account and recover its password."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void loadEmail()}>
              Try again
            </Button>
          }
        >
          <Banner tone="danger">{emailError}</Banner>
        </SettingsCard>
      ) : (
        <EmailCard
          initialEmail={email}
          initialConfirmed={emailConfirmed}
          description="Used to sign in directly to this group's PDS account and recover its password."
          headerAction={
            <Button variant="ghost" size="sm" loading={locking} onClick={() => void handleLock()}>
              Lock account
            </Button>
          }
          callbacks={{
            requestUpdate: () => requestGroupAccountEmailUpdate(groupDid),
            updateEmail: (input) => updateGroupAccountEmail(groupDid, input),
            requestConfirmation: () => requestGroupAccountEmailConfirmation(groupDid),
            confirmEmail: (input) => confirmGroupAccountEmail(groupDid, input),
            onLocked: relock,
          }}
        />
      )}
    </>
  );
}

/**
 * Admin/owner password reset card for a non-self group.
 * The caller enters the group's own email, receives a reset code from the PDS,
 * and sets a new password (verified against `groupDid` server-side).
 */
export function GroupPasswordResetCard({ groupDid }: { groupDid: string }) {
  const requestFormId = useId();
  const confirmFormId = useId();
  const [step, setStep] = useState<"idle" | "request" | "confirm" | "done">("idle");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address for this group.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await requestGroupAccountPasswordReset(groupDid, trimmed);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!token.trim()) {
      setError("Enter the code sent to the group's email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await confirmGroupAccountPasswordReset(groupDid, {
        token: token.trim(),
        password,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setStep("done");
      setToken("");
      setPassword("");
      setConfirm("");
      toast("Group password reset");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      title="Password"
      description="Set a new password for the group with a code sent to its sign-in email. Enter the group's email, not your own."
      hint="Requires access to the group's recovery mailbox."
      actions={
        step === "request" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setStep("idle");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form={requestFormId} variant="primary" size="sm" loading={busy}>
              Send reset code
            </Button>
          </>
        ) : step === "confirm" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setStep("idle");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form={confirmFormId} variant="primary" size="sm" loading={busy}>
              Reset password
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setStep("request");
            }}
          >
            Reset password
          </Button>
        )
      }
    >
      {step === "done" && <Banner tone="success">The group&apos;s password has been reset.</Banner>}

      {step === "request" && (
        <form
          id={requestFormId}
          className="settings-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <Field
            label="Group email"
            description="Enter the group's own email address, not your personal email."
          >
            {(field) => (
              <Input
                {...field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="team@example.org"
                disabled={busy}
                required
              />
            )}
          </Field>
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
        </form>
      )}

      {step === "confirm" && (
        <form
          id={confirmFormId}
          className="settings-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void resetPassword();
          }}
        >
          <Field label="Reset code" description={`Sent to ${email}.`}>
            {(field) => (
              <Input
                {...field}
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
                autoComplete="one-time-code"
                placeholder="Code from the email"
                disabled={busy}
                required
              />
            )}
          </Field>
          <Field label="New password" description="At least 8 characters.">
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                disabled={busy}
                required
              />
            )}
          </Field>
          <Field label="Confirm new password">
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                disabled={busy}
                required
              />
            )}
          </Field>
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
        </form>
      )}
    </SettingsCard>
  );
}
