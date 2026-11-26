"use client";

import { Banner, Button, Field, Input, Text } from "@hypercerts-org/ui-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirmOwnPasswordReset, requestOwnPasswordReset } from "@/lib/settings/account-actions";
import type { SimpleResult } from "@/lib/settings/types";
import { isEmail } from "@/lib/validate";
import { SettingsAction, SettingsRow } from "./settings-frame";

/**
 * Password reset row shared by personal settings and non-self group settings
 * (pass custom `onRequest` / `onConfirm` and copy overrides for groups).
 */
export function PasswordResetRow({
  email,
  description = "Your account's own password. Keep it to yourself: give other apps an app password instead.",
  actionLabel = "Edit",
  emailLabel = "Account email",
  emailDescription = "Enter the email on your PDS account.",
  emailPlaceholder = "you@example.org",
  invalidEmailMessage = "Enter your account's email address.",
  sendCodeLabel = "Send code",
  missingCodeMessage = "Enter the code from your email.",
  submitLabel = "Save password",
  doneMessage = "Password updated successfully.",
  toastMessage = "Password updated",
  onRequest = requestOwnPasswordReset,
  onConfirm = confirmOwnPasswordReset,
}: {
  email: string | null;
  description?: string;
  actionLabel?: string;
  emailLabel?: string;
  emailDescription?: string;
  emailPlaceholder?: string;
  invalidEmailMessage?: string;
  sendCodeLabel?: string;
  missingCodeMessage?: string;
  submitLabel?: string;
  doneMessage?: string;
  toastMessage?: string;
  onRequest?: (email: string) => Promise<SimpleResult>;
  onConfirm?: (input: { token: string; password: string }) => Promise<SimpleResult>;
}) {
  const [step, setStep] = useState<"idle" | "asking" | "form" | "done">("idle");
  const [targetEmail, setTargetEmail] = useState(email ?? "");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const addr = (email || targetEmail).trim();
    if (!isEmail(addr)) {
      setError(invalidEmailMessage);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onRequest(addr);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setToken("");
      setPassword("");
      setConfirm("");
      setStep("form");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!token.trim()) {
      setError(missingCodeMessage);
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
      const res = await onConfirm({ token: token.trim(), password });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setStep("done");
      setPassword("");
      setConfirm("");
      setToken("");
      toast(toastMessage);
    } finally {
      setBusy(false);
    }
  };

  const editing = step === "asking" || step === "form";

  return (
    <SettingsRow
      label="Password"
      description={description}
      actions={
        editing ? null : (
          <SettingsAction
            disabled={busy}
            onClick={() => {
              setError(null);
              setStep("asking");
            }}
          >
            {actionLabel}
          </SettingsAction>
        )
      }
    >
      {step === "form" ? (
        <form
          className="settings-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void savePassword();
          }}
        >
          <Field label="Reset code" description={`Sent to ${email || targetEmail}.`}>
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
          <div className="settings-form-actions">
            <Button type="submit" variant="primary" size="sm" loading={busy}>
              {submitLabel}
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
          <Text as="span" tone="ink">
            ••••••••••••
          </Text>
          {step === "asking" && (
            <form
              className="settings-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              {email ? (
                <Text size="body-sm" tone="muted">
                  We&apos;ll email a code to <strong className="break-anywhere">{email}</strong> so
                  you can set a new password.
                </Text>
              ) : (
                <Field label={emailLabel} description={emailDescription}>
                  {(field) => (
                    <Input
                      {...field}
                      type="email"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.currentTarget.value)}
                      placeholder={emailPlaceholder}
                      disabled={busy}
                      required
                    />
                  )}
                </Field>
              )}
              <div className="settings-form-actions">
                <Button type="submit" variant="primary" size="sm" loading={busy}>
                  {sendCodeLabel}
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
          )}
          {step === "done" && <Banner tone="success">{doneMessage}</Banner>}
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
        </>
      )}
    </SettingsRow>
  );
}
