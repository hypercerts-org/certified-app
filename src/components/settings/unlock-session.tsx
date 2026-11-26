"use client";

import { Banner, Button, Field, Input, ResponsiveDialog, Text } from "@hypercerts-org/ui-react";
import { type ReactNode, useCallback, useId, useState } from "react";
import type { UnlockActionResult } from "@/lib/settings-actions";

export type UnlockState = {
  password: string;
  setPassword: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  needsCode: boolean;
  invalid: boolean;
  invalidCode: boolean;
  error: string | null;
  submitting: boolean;
  canSubmit: boolean;
  submit: () => Promise<boolean>;
  reset: () => void;
};

/**
 * Shared state for opening an elevated password session (personal or group).
 * Handles password validation and optional email 2FA codes without ever
 * touching PDS tokens on the client.
 */
export function useUnlockSession(
  unlockFn: (input: { password: string; authFactorToken?: string }) => Promise<UnlockActionResult>,
  onUnlocked?: () => void,
): UnlockState {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [invalidCode, setInvalidCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setPassword("");
    setCode("");
    setNeedsCode(false);
    setInvalid(false);
    setInvalidCode(false);
    setError(null);
  }, []);

  const canSubmit = !submitting && password.length > 0 && (!needsCode || code.trim().length > 0);

  const submit = useCallback(async () => {
    if (!password || submitting) return false;
    setSubmitting(true);
    setInvalid(false);
    setInvalidCode(false);
    setError(null);
    try {
      const res = await unlockFn({
        password,
        authFactorToken: needsCode ? code.trim() : undefined,
      }).catch(() => ({
        ok: false as const,
        message: "Couldn't reach the server. Please try again.",
      }));

      if (!res.ok) {
        setError(res.message);
        return false;
      }

      switch (res.status) {
        case "ok":
          reset();
          onUnlocked?.();
          return true;
        case "twoFactorRequired":
          setNeedsCode(true);
          return false;
        case "invalidCode":
          setNeedsCode(true);
          setInvalidCode(true);
          return false;
        case "invalid":
          setInvalid(true);
          return false;
        case "rateLimited":
        case "unavailable":
          setError(res.message ?? "Unlock is temporarily unavailable. Please try again.");
          return false;
      }
    } finally {
      setSubmitting(false);
    }
  }, [password, code, needsCode, submitting, unlockFn, onUnlocked, reset]);

  return {
    password,
    setPassword,
    code,
    setCode,
    needsCode,
    invalid,
    invalidCode,
    error,
    submitting,
    canSubmit,
    submit,
    reset,
  };
}

/** Inline password + optional 2FA code fields, shared by dialogs and group import. */
export function UnlockFields({
  state,
  intro,
  passwordLabel = "Account password",
  passwordHint,
  invalidMessage,
  codeHelper = "We emailed a sign-in code to your account's email address.",
}: {
  state: UnlockState;
  intro?: ReactNode;
  passwordLabel?: string;
  passwordHint?: ReactNode;
  invalidMessage?: ReactNode;
  codeHelper?: string;
}) {
  return (
    <div className="stack">
      {intro && <Text size="body-sm">{intro}</Text>}
      <Field label={passwordLabel} description={!state.needsCode ? passwordHint : undefined}>
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="current-password"
            value={state.password}
            onChange={(e) => state.setPassword(e.currentTarget.value)}
            disabled={state.submitting}
            required
          />
        )}
      </Field>
      {state.needsCode && (
        <Field
          label="Email code"
          description={codeHelper}
          error={
            state.invalidCode ? "That code wasn't accepted. Check it and try again." : undefined
          }
        >
          {(field) => (
            <Input
              {...field}
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="Code from your email"
              value={state.code}
              onChange={(e) => state.setCode(e.currentTarget.value)}
              disabled={state.submitting}
              required
            />
          )}
        </Field>
      )}
      {state.invalid && (
        <Banner tone="danger" role="alert">
          {invalidMessage ??
            "That password wasn't accepted. If you normally sign in with email codes and haven't set a password yet, set one under Account first."}
        </Banner>
      )}
      {state.error && (
        <Banner tone="danger" role="alert">
          {state.error}
        </Banner>
      )}
    </div>
  );
}

/** ResponsiveDialog wrapping UnlockFields inside an accessible `<form onSubmit>`. */
export function UnlockDialog({
  open,
  onClose,
  state,
  title,
  description,
  submitLabel = "Unlock",
  passwordLabel,
  passwordHint,
  invalidMessage,
  codeHelper,
}: {
  open: boolean;
  onClose: () => void;
  state: UnlockState;
  title: string;
  description: string;
  submitLabel?: string;
  passwordLabel?: string;
  passwordHint?: ReactNode;
  invalidMessage?: ReactNode;
  codeHelper?: string;
}) {
  const formId = useId();
  return (
    <ResponsiveDialog
      open={open}
      onClose={() => {
        if (state.submitting) return;
        state.reset();
        onClose();
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={state.submitting}
            onClick={() => {
              state.reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!state.canSubmit}
            loading={state.submitting}
          >
            {state.needsCode ? "Confirm code" : submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void state.submit();
        }}
      >
        <UnlockFields
          state={state}
          passwordLabel={passwordLabel}
          passwordHint={passwordHint}
          invalidMessage={invalidMessage}
          codeHelper={codeHelper}
        />
      </form>
    </ResponsiveDialog>
  );
}
