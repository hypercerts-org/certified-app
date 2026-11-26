"use client";

import { Banner, Button, Field, Input, Text } from "@hypercerts-org/ui-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  confirmPersonalEmail,
  requestPersonalEmailConfirmation,
  requestPersonalEmailUpdate,
  unlockPersonalSession,
  updatePersonalEmail,
} from "@/lib/settings/account-actions";
import type { ActionFailure, SimpleResult } from "@/lib/settings/types";
import { isEmail } from "@/lib/validate";
import { SettingsAction, SettingsRow } from "./settings-frame";
import { UnlockDialog, useUnlockSession } from "./unlock-session";

export type EmailCallbacks = {
  requestUpdate: () => Promise<{ ok: true; tokenRequired: boolean } | ActionFailure>;
  updateEmail: (input: { email: string; token?: string }) => Promise<SimpleResult>;
  requestConfirmation: () => Promise<SimpleResult>;
  confirmEmail: (input: { email: string; token: string }) => Promise<SimpleResult>;
  onLocked?: () => void;
};

/** Sign-in email row: personal (elevated session) or group (via callbacks). */
export function EmailRow({
  initialEmail,
  initialConfirmed = true,
  description = "Used to sign in and to recover your account.",
  extraAction,
  callbacks,
}: {
  initialEmail: string | null;
  initialConfirmed?: boolean;
  description?: string;
  extraAction?: ReactNode;
  callbacks?: EmailCallbacks;
}) {
  const [currentEmail, setCurrentEmail] = useState(initialEmail ?? "");
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [step, setStep] = useState<"idle" | "asking" | "form" | "confirm" | "success">("idle");
  const [tokenRequired, setTokenRequired] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"change" | "confirm" | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [token, setToken] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ops: EmailCallbacks = callbacks ?? {
    requestUpdate: requestPersonalEmailUpdate,
    updateEmail: updatePersonalEmail,
    requestConfirmation: requestPersonalEmailConfirmation,
    confirmEmail: confirmPersonalEmail,
  };

  const handleLocked = (action: "change" | "confirm") => {
    if (ops.onLocked) {
      ops.onLocked();
      return;
    }
    setPendingAction(action);
    setUnlockOpen(true);
  };

  const beginChange = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await ops.requestUpdate();
      if (!res.ok) {
        if (res.locked) {
          handleLocked("change");
          return;
        }
        setError(res.message);
        return;
      }
      setTokenRequired(res.tokenRequired);
      setNewEmail("");
      setConfirmNewEmail("");
      setToken("");
      setStep("form");
    } finally {
      setBusy(false);
    }
  };

  const startConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await ops.requestConfirmation();
      if (!res.ok) {
        if (res.locked) {
          handleLocked("confirm");
          return;
        }
        setError(res.message);
        return;
      }
      setConfirmCode("");
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  };

  const unlock = useUnlockSession(unlockPersonalSession, () => {
    setUnlockOpen(false);
    const next = pendingAction;
    setPendingAction(null);
    if (next === "change") void beginChange();
    else if (next === "confirm") void startConfirm();
  });

  const submitNewEmail = async () => {
    const trimmed = newEmail.trim();
    if (!isEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (trimmed !== confirmNewEmail.trim()) {
      setError("Email addresses don't match.");
      return;
    }
    if (tokenRequired && !token.trim()) {
      setError("Enter the code sent to your current email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await ops.updateEmail({
        email: trimmed,
        token: tokenRequired ? token.trim() : undefined,
      });
      if (!res.ok) {
        if (res.locked) {
          handleLocked("change");
          return;
        }
        setError(res.message);
        return;
      }
      setCurrentEmail(trimmed);
      setConfirmed(false);
      setStep("success");
      toast("Email updated");
    } finally {
      setBusy(false);
    }
  };

  const submitConfirmCode = async () => {
    if (!confirmCode.trim()) {
      setError("Enter the confirmation code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await ops.confirmEmail({ email: currentEmail, token: confirmCode.trim() });
      if (!res.ok) {
        if (res.locked) {
          handleLocked("confirm");
          return;
        }
        setError(res.message);
        return;
      }
      setConfirmed(true);
      setStep("idle");
      toast("Email confirmed");
    } finally {
      setBusy(false);
    }
  };

  const editing = step === "form" || step === "confirm" || step === "asking";

  return (
    <>
      <SettingsRow
        label="Email"
        description={description}
        actions={
          editing ? null : (
            <>
              {extraAction}
              {!confirmed && currentEmail && (
                <SettingsAction tone="muted" disabled={busy} onClick={() => void startConfirm()}>
                  Verify
                </SettingsAction>
              )}
              <SettingsAction
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep("asking");
                }}
              >
                Edit
              </SettingsAction>
            </>
          )
        }
      >
        {step === "form" ? (
          <form
            className="settings-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitNewEmail();
            }}
          >
            {tokenRequired && (
              <Field
                label="Verification code"
                description={`Sent to ${currentEmail || "your current email"}.`}
              >
                {(field) => (
                  <Input
                    {...field}
                    value={token}
                    onChange={(e) => setToken(e.currentTarget.value)}
                    autoComplete="one-time-code"
                    placeholder="Code from your email"
                    disabled={busy}
                    required
                  />
                )}
              </Field>
            )}
            <Field label="New email">
              {(field) => (
                <Input
                  {...field}
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.currentTarget.value)}
                  placeholder="you@example.org"
                  disabled={busy}
                  required
                />
              )}
            </Field>
            <Field label="Confirm new email">
              {(field) => (
                <Input
                  {...field}
                  type="email"
                  value={confirmNewEmail}
                  onChange={(e) => setConfirmNewEmail(e.currentTarget.value)}
                  placeholder="you@example.org"
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
            <div className="settings-form-actions">
              <Button type="submit" variant="primary" size="sm" loading={busy}>
                Save
              </Button>
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
            </div>
          </form>
        ) : step === "confirm" ? (
          <form
            className="settings-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitConfirmCode();
            }}
          >
            <Field
              label="Confirmation code"
              description={`Enter the code we emailed to ${currentEmail}.`}
            >
              {(field) => (
                <Input
                  {...field}
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.currentTarget.value)}
                  autoComplete="one-time-code"
                  placeholder="Code from your email"
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
            <div className="settings-form-actions">
              <Button type="submit" variant="primary" size="sm" loading={busy}>
                Verify email
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void startConfirm()}
              >
                Resend code
              </Button>
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
            </div>
          </form>
        ) : (
          <>
            <Text as="span" tone={currentEmail ? "ink" : "muted"} className="break-anywhere">
              {currentEmail || "Not available"}
            </Text>
            {step === "asking" && (
              <div className="settings-form">
                <Text size="body-sm" tone="muted">
                  {currentEmail
                    ? `If ${currentEmail} is confirmed, we'll send a verification code there before saving the new address.`
                    : "Continue to set a new email address for this account."}
                </Text>
                <div className="settings-form-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy}
                    onClick={() => void beginChange()}
                  >
                    Continue
                  </Button>
                  <Button
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
                </div>
              </div>
            )}
            {step === "success" && (
              <Banner tone="success">
                Email updated to <strong>{currentEmail}</strong>. Verify your new address so you can
                recover your account if needed.
              </Banner>
            )}
            {error && (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            )}
          </>
        )}
      </SettingsRow>

      {!callbacks && (
        <UnlockDialog
          open={unlockOpen}
          onClose={() => {
            setUnlockOpen(false);
            setPendingAction(null);
          }}
          state={unlock}
          title="Unlock account settings"
          description="Confirm your account password to change or verify your email. It's used once to open a short session and isn't stored."
        />
      )}
    </>
  );
}
