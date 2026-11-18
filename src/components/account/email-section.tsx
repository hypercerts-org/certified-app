"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import Banner from "@/components/ui/banner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  requestEmailUpdate,
  updateEmail,
  requestEmailConfirmation,
  confirmEmail,
  EmailLockedError,
} from "@/lib/atproto/account-email";
import UnlockAppPasswordsDialog from "@/components/settings/unlock-app-passwords-dialog";
import { updateCachedSessionEmail } from "@/hooks/use-session";
import { userErrorMessage } from "@/lib/utils/user-error";

interface EmailSectionProps {
  email: string;
}

// "asking": Edit opened the step that says where the code goes; nothing
// is sent until Send code. "requesting": the change is starting.
type State = "idle" | "asking" | "requesting" | "form" | "confirm" | "success";

// Authoritative validation happens on the PDS; this is just a friendly
// pre-check so an obvious typo doesn't cost a round-trip.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  // The current address — updated locally on success so the row reflects the
  // change without a full session refresh.
  const [currentEmail, setCurrentEmail] = useState(email);
  // A signed-in user already proved control of their current email via the
  // sign-in OTP, so we treat it as confirmed — no "verify" nag just for being
  // signed in. This only flips to false when they CHANGE the email this
  // session, at which point we ask them to verify the new address directly.
  // (Resets on a fresh load, which is fine: getting back here means they
  // re-signed-in, i.e. re-OTP'd, the current address.)
  const [confirmed, setConfirmed] = useState(true);

  // On a hard refresh the session loads after this mounts, so `email` arrives
  // empty and fills in a tick later. Sync it in.
  useEffect(() => {
    setCurrentEmail(email);
  }, [email]);

  const [state, setState] = useState<State>("idle");
  const editRef = useRef<HTMLButtonElement>(null);
  const stepId = useId();
  const [tokenRequired, setTokenRequired] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");

  const [idleError, setIdleError] = useState<string | null>(null);
  const [newEmailError, setNewEmailError] = useState<string | null>(null);
  const [confirmNewEmailError, setConfirmNewEmailError] = useState<string | null>(
    null,
  );
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearFormState = () => {
    setNewEmail("");
    setConfirmNewEmail("");
    setToken("");
    setNewEmailError(null);
    setConfirmNewEmailError(null);
    setTokenError(null);
    setFormError(null);
  };

  // Start (or resume after unlocking) an email change: ask the PDS to begin,
  // which tells us whether it emailed a confirmation code to the current
  // address (only when that address is confirmed).
  const beginChange = async () => {
    setState("requesting");
    setIdleError(null);
    try {
      const { tokenRequired: needsCode } = await requestEmailUpdate();
      setTokenRequired(needsCode);
      clearFormState();
      setState("form");
    } catch (err) {
      if (err instanceof EmailLockedError) {
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      setIdleError(
        userErrorMessage(
          err instanceof Error ? err.message : undefined,
          "Couldn't start the email change. Try again in a moment",
        ),
      );
      // The step stays open, so Send code tries again.
      setState("asking");
    }
  };

  // Move into the confirm step and email a fresh code to the current address.
  const startConfirmation = async () => {
    setState("confirm");
    setCode("");
    setCodeError(null);
    setFormError(null);
    setSaving(true);
    try {
      await requestEmailConfirmation();
    } catch (err) {
      if (err instanceof EmailLockedError) {
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      setFormError(
        userErrorMessage(
          err instanceof Error ? err.message : undefined,
          "Couldn't send the confirmation code. Try again in a moment",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const next = newEmail.trim();
    let valid = true;
    if (!looksLikeEmail(next)) {
      setNewEmailError("Enter a valid email address.");
      valid = false;
    } else if (next.toLowerCase() === currentEmail.toLowerCase()) {
      setNewEmailError("That's already your email address.");
      valid = false;
    } else {
      setNewEmailError(null);
    }

    // Double entry — catch a typo before it becomes the account email.
    if (confirmNewEmail.trim().toLowerCase() !== next.toLowerCase()) {
      setConfirmNewEmailError("The two emails don't match.");
      valid = false;
    } else {
      setConfirmNewEmailError(null);
    }

    if (tokenRequired && !token.trim()) {
      setTokenError("Enter the code we sent to your current email.");
      valid = false;
    } else {
      setTokenError(null);
    }

    if (!valid) return;

    setSaving(true);
    setFormError(null);
    try {
      await updateEmail(next, tokenRequired ? token.trim() : undefined);
      setCurrentEmail(next);
      setConfirmed(false);
      // Keep the session cache in step so navigating away and back doesn't
      // resurrect the pre-change address.
      updateCachedSessionEmail(next);
      clearFormState();
      // The new address is unconfirmed — prove control of it.
      await startConfirmation();
    } catch (err) {
      if (err instanceof EmailLockedError) {
        clearFormState();
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      const msg = err instanceof Error ? err.message : "";
      setFormError(
        /token|code/i.test(msg)
          ? "That code looks wrong or expired. Request a new one."
          : userErrorMessage(msg, "Couldn't update your email"),
      );
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!code.trim()) {
      setCodeError("Enter the code we sent to your email.");
      return;
    }
    setCodeError(null);
    setSaving(true);
    setFormError(null);
    try {
      await confirmEmail(currentEmail, code.trim());
      setConfirmed(true);
      updateCachedSessionEmail(currentEmail);
      setCode("");
      setState("success");
      setTimeout(() => setState("idle"), 4000);
    } catch (err) {
      if (err instanceof EmailLockedError) {
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      const msg = err instanceof Error ? err.message : "";
      setFormError(
        /token|code/i.test(msg)
          ? "That code looks wrong or expired. Resend a new one."
          : userErrorMessage(msg, "Couldn't confirm your email"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    clearFormState();
    setState("idle");
  };

  // Close the send step without sending; focus goes back to Edit (the
  // step's buttons are about to unmount).
  const closeStep = () => {
    setState("idle");
    editRef.current?.focus();
  };

  const stepOpen = state === "asking" || state === "requesting";

  if (state === "form") {
    return (
      <div className="dash-card">
        {/* A real <form> so Enter submits; noValidate keeps our own
            validation messages in charge. */}
        <form
          className="password-section--form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <p className="password-section__hint">
            {tokenRequired
              ? `We sent a confirmation code to ${currentEmail}. Enter it with your new email address.`
              : "Enter the email address you'd like to use. We'll send a code to confirm it."}
          </p>
          <div className="password-section__fields">
            {tokenRequired && (
              <Input
                label="Confirmation code"
                type="text"
                placeholder="Enter code from email"
                autoComplete="one-time-code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                error={tokenError ?? undefined}
              />
            )}
            <Input
              label="New email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              error={newEmailError ?? undefined}
            />
            <Input
              label="Confirm new email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={confirmNewEmail}
              onChange={(e) => setConfirmNewEmail(e.target.value)}
              error={confirmNewEmailError ?? undefined}
            />
          </div>
          {formError && (
            <Banner variant="error" className="mt-2">
              {formError}
            </Banner>
          )}
          <div className="password-section__actions">
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (state === "confirm") {
    return (
      <div className="dash-card">
        <form
          className="password-section--form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirm();
          }}
        >
          <p className="password-section__hint">
            Your email is now <strong>{currentEmail}</strong>, but it isn&apos;t
            confirmed yet. Enter the code we sent there to confirm it. Until you
            do, you can change it again with no code.
          </p>
          <div className="password-section__fields">
            <Input
              label="Confirmation code"
              type="text"
              placeholder="Enter code from email"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={codeError ?? undefined}
            />
          </div>
          {formError && (
            <Banner variant="error" className="mt-2">
              {formError}
            </Banner>
          )}
          <div className="password-section__actions">
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? "Confirming…" : "Confirm email"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void startConfirmation()}
              disabled={saving}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Resend code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void beginChange()}
              disabled={saving}
            >
              Use a different email
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="settings-field">
        <span className="settings-field__value">{currentEmail || "—"}</span>
        {/* Edit only opens the step below: a code is emailed on Send
            code, never on this click. */}
        <Button
          ref={editRef}
          variant="ghost"
          size="sm"
          aria-expanded={stepOpen}
          aria-controls={stepOpen ? stepId : undefined}
          onClick={() => {
            setIdleError(null);
            if (stepOpen) closeStep();
            else setState("asking");
          }}
          disabled={state === "requesting"}
        >
          <Pencil size={16} strokeWidth={1.75} aria-hidden />
          Edit{" "}<span className="sr-only">email</span>
        </Button>
      </div>
      {stepOpen && (
        <div id={stepId}>
          <p className="password-section__hint">
            We&apos;ll email a code to{" "}
            <strong className="font-medium text-[var(--fg-primary)] [overflow-wrap:anywhere]">
              {currentEmail || "your email address"}
            </strong>{" "}
            to confirm the change.
          </p>
          <div className="password-section__actions">
            <Button
              size="sm"
              onClick={() => void beginChange()}
              loading={state === "requesting"}
              disabled={state === "requesting"}
            >
              {state === "requesting" ? "Sending…" : "Send code"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeStep}
              disabled={state === "requesting"}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {state !== "success" && currentEmail && !confirmed && (
        <Banner variant="warning" className="mt-3">
          This email isn&apos;t confirmed yet — confirm it so sign-in and
          recovery messages reach you.
          <div className="password-section__actions mt-2">
            <Button size="sm" onClick={() => void startConfirmation()}>
              Verify email
            </Button>
          </div>
        </Banner>
      )}
      {state === "success" && (
        <p className="password-section__status password-section__status--success" role="status">
          Email confirmed.
        </p>
      )}
      {idleError && (
        <Banner variant="error" className="mt-3">
          {idleError}
        </Banner>
      )}
      {unlockOpen && (
        <UnlockAppPasswordsDialog
          title="Confirm your password"
          intro="Confirm your account password to change your email. It's used once to open a short, secure session — it isn't stored."
          onUnlocked={() => {
            setUnlockOpen(false);
            void beginChange();
          }}
          onClose={() => setUnlockOpen(false)}
        />
      )}
    </div>
  );
};

export default EmailSection;
