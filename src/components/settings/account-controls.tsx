"use client";

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
  Text,
} from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import type { ActionFailure, SimpleResult } from "@/lib/settings-actions";
import {
  confirmOwnPasswordReset,
  confirmPersonalEmail,
  requestOwnPasswordReset,
  requestPersonalEmailConfirmation,
  requestPersonalEmailUpdate,
  unlockPersonalSession,
  updateOwnHandle,
  updatePersonalEmail,
} from "@/lib/settings-actions";
import { SettingsAction, SettingsRow } from "./settings-frame";
import { UnlockDialog, useUnlockSession } from "./unlock-session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function isSubdomainOfPds(handle: string | null, pdsDomain: string): boolean {
  if (!handle) return false;
  return (
    handle.endsWith(`.${pdsDomain}`) ||
    handle.endsWith(".certified.app") ||
    handle.endsWith(".certs.social") ||
    handle.split(".").length >= 3
  );
}

function suffixOf(handle: string | null, pdsDomain: string): string {
  if (handle?.includes(".") && isSubdomainOfPds(handle, pdsDomain)) {
    return handle.slice(handle.indexOf(".") + 1);
  }
  return pdsDomain;
}

// ---------------------------------------------------------------------------
// Handle Row (Subdomain edit + Custom Domain DNS wizard)
// ---------------------------------------------------------------------------

export function HandleRow({
  did,
  initialHandle,
  pdsDomain,
  description = "The @handle people use to find and mention you.",
  onSave,
}: {
  did: string;
  initialHandle: string | null;
  pdsDomain: string;
  description?: string;
  onSave?: (handle: string) => Promise<SimpleResult>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainFormId = useId();
  const [handle, setHandle] = useState(initialHandle);
  const [editing, setEditing] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domainOpen, setDomainOpen] = useState(false);
  const [domainStep, setDomainStep] = useState<"enter" | "dns" | "done">("enter");
  const [domainInput, setDomainInput] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const suffix = suffixOf(handle, pdsDomain);
  const saveHandle = onSave ?? updateOwnHandle;

  const openEdit = () => {
    const currentPrefix =
      handle && isSubdomainOfPds(handle, pdsDomain) ? handle.slice(0, handle.indexOf(".")) : "";
    setPrefix(currentPrefix);
    setError(null);
    setEditing(true);
  };

  const submitSubdomain = async () => {
    const clean = prefix.trim().toLowerCase();
    if (!clean || clean.length < 3 || clean.length > 63 || !LABEL_RE.test(clean)) {
      setError(
        "Use 3–63 lowercase letters, numbers, or hyphens (cannot start or end with a hyphen).",
      );
      return;
    }
    const next = `${clean}.${suffix}`;
    setSaving(true);
    setError(null);
    try {
      const res = await saveHandle(next);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setHandle(next);
      setEditing(false);
      toast(`Handle updated to @${next}`);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const normalizedDomain = domainInput.trim().toLowerCase().replace(/^@/, "");
  const dnsHost = `_atproto.${normalizedDomain}`;
  const dnsValue = `did=${did}`;

  const advanceToDns = () => {
    if (!normalizedDomain || !DOMAIN_RE.test(normalizedDomain)) {
      setDomainError("Enter a valid domain name (for example, example.org).");
      return;
    }
    setDomainError(null);
    setDomainStep("dns");
  };

  const verifyCustomDomain = async () => {
    setVerifying(true);
    setDomainError(null);
    try {
      const res = await saveHandle(normalizedDomain);
      if (!res.ok) {
        setDomainError(res.message);
        return;
      }
      setHandle(normalizedDomain);
      setDomainStep("done");
      toast(`Handle updated to @${normalizedDomain}`);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setVerifying(false);
    }
  };

  const closeDomain = () => {
    if (verifying) return;
    setDomainOpen(false);
    setDomainStep("enter");
    setDomainInput("");
    setDomainError(null);
  };

  return (
    <>
      <SettingsRow
        label="Handle"
        description={description}
        actions={
          editing ? null : (
            <>
              <SettingsAction
                tone="muted"
                onClick={() => {
                  setDomainStep("enter");
                  setDomainInput("");
                  setDomainError(null);
                  setDomainOpen(true);
                }}
              >
                Custom domain
              </SettingsAction>
              <SettingsAction onClick={openEdit}>Edit</SettingsAction>
            </>
          )
        }
      >
        {editing ? (
          <form
            className="settings-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitSubdomain();
            }}
          >
            <Field label="New handle" error={error ?? undefined}>
              {({ invalid: _invalid, ...inputField }) => (
                <InputGroup>
                  <InputGroupInput
                    {...inputField}
                    value={prefix}
                    onChange={(e) => setPrefix(e.currentTarget.value)}
                    placeholder="your-name"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={saving}
                  />
                  <InputGroupAddon>.{suffix}</InputGroupAddon>
                </InputGroup>
              )}
            </Field>
            <div className="settings-form-actions">
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : handle ? (
          <CopyableId value={handle} displayValue={`@${handle}`} label="Handle" />
        ) : (
          <Text size="body-sm" tone="muted">
            No handle verified
          </Text>
        )}
      </SettingsRow>

      <ResponsiveDialog
        open={domainOpen}
        onClose={closeDomain}
        title="Use your own domain"
        description={
          domainStep === "enter"
            ? "Use a domain you control (such as example.org or team.example.org) as your AT Protocol handle."
            : domainStep === "dns"
              ? "Add this TXT record in your domain's DNS settings, then verify."
              : "Your custom domain is active."
        }
        footer={
          domainStep === "enter" ? (
            <>
              <Button variant="secondary" onClick={closeDomain}>
                Cancel
              </Button>
              <Button type="submit" form={domainFormId} variant="primary">
                Next
              </Button>
            </>
          ) : domainStep === "dns" ? (
            <>
              <Button
                variant="secondary"
                disabled={verifying}
                onClick={() => {
                  setDomainError(null);
                  setDomainStep("enter");
                }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                loading={verifying}
                onClick={() => void verifyCustomDomain()}
              >
                Verify DNS record
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={closeDomain}>
              Done
            </Button>
          )
        }
      >
        {domainStep === "enter" && (
          <form
            id={domainFormId}
            className="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              advanceToDns();
            }}
          >
            <Field label="Domain name" error={domainError ?? undefined}>
              {(field) => (
                <Input
                  {...field}
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.currentTarget.value)}
                  placeholder="example.org"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              )}
            </Field>
          </form>
        )}

        {domainStep === "dns" && (
          <div className="stack">
            <dl className="overview-id-list divided">
              <div className="overview-id-item">
                <dt>Type</dt>
                <dd>
                  <Text as="span" size="body-sm" tone="ink">
                    TXT
                  </Text>
                </dd>
              </div>
              <div className="overview-id-item">
                <dt>Host</dt>
                <dd>
                  <CopyableId value={dnsHost} label="DNS host" className="overview-id-field" />
                </dd>
              </div>
              <div className="overview-id-item">
                <dt>Value</dt>
                <dd>
                  <CopyableId value={dnsValue} label="DNS value" className="overview-id-field" />
                </dd>
              </div>
            </dl>
            <Text size="body-sm" tone="muted">
              DNS changes can take a few minutes to propagate. If verification fails, wait a moment
              and try again.
            </Text>
            {domainError && (
              <Banner tone="danger" role="alert">
                {domainError}
              </Banner>
            )}
          </div>
        )}

        {domainStep === "done" && (
          <Banner tone="success">
            Your handle is now <strong>@{normalizedDomain}</strong>.
          </Banner>
        )}
      </ResponsiveDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Email Row (Personal via elevated session, or Group via callbacks)
// ---------------------------------------------------------------------------

type EmailCallbacks = {
  requestUpdate: () => Promise<{ ok: true; tokenRequired: boolean } | ActionFailure>;
  updateEmail: (input: { email: string; token?: string }) => Promise<SimpleResult>;
  requestConfirmation: () => Promise<SimpleResult>;
  confirmEmail: (input: { email: string; token: string }) => Promise<SimpleResult>;
  onLocked?: () => void;
};

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
  extraAction?: React.ReactNode;
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
    if (!EMAIL_RE.test(trimmed)) {
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

// ---------------------------------------------------------------------------
// Personal Password Reset Row
// ---------------------------------------------------------------------------

export function PasswordResetRow({
  email,
  description = "Your account's own password. Keep it to yourself: give other apps an app password instead.",
}: {
  email: string | null;
  description?: string;
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
    if (!EMAIL_RE.test(addr)) {
      setError("Enter your account's email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await requestOwnPasswordReset(addr);
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
      setError("Enter the code from your email.");
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
      const res = await confirmOwnPasswordReset({ token: token.trim(), password });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setStep("done");
      setPassword("");
      setConfirm("");
      setToken("");
      toast("Password updated");
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
            Edit
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
              Save password
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
            <div className="settings-form">
              {email ? (
                <Text size="body-sm" tone="muted">
                  We&apos;ll email a code to <strong className="break-anywhere">{email}</strong> so
                  you can set a new password.
                </Text>
              ) : (
                <Field label="Account email" description="Enter the email on your PDS account.">
                  {(field) => (
                    <Input
                      {...field}
                      type="email"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.currentTarget.value)}
                      placeholder="you@example.org"
                      disabled={busy}
                      required
                    />
                  )}
                </Field>
              )}
              <div className="settings-form-actions">
                <Button variant="primary" size="sm" loading={busy} onClick={() => void sendCode()}>
                  Send code
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
          {step === "done" && <Banner tone="success">Password updated successfully.</Banner>}
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
