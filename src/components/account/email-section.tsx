"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import Banner from "@/components/ui/banner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import {
  requestEmailUpdate,
  updateEmail,
  requestEmailConfirmation,
  confirmEmail,
  EmailLockedError,
} from "@/lib/atproto/account-email";
import UnlockAppPasswordsDialog from "@/components/settings/unlock-app-passwords-dialog";

interface EmailSectionProps {
  email: string;
  /** Whether the CURRENT address is confirmed (from the session). Drives the
   *  persistent "unconfirmed — verify" state after a change or reload. */
  emailConfirmed: boolean;
}

type State = "idle" | "requesting" | "form" | "confirm" | "success";

// Authoritative validation happens on the PDS; this is just a friendly
// pre-check so an obvious typo doesn't cost a round-trip.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const EmailSection: React.FC<EmailSectionProps> = ({ email, emailConfirmed }) => {
  const { did } = useAuth();
  // Where to remember the pre-change address so "Revert" survives a reload
  // while the new one is unconfirmed. Session-scoped: it's the user's own
  // email, only needed until they confirm or revert.
  const revertKey = did ? `certified:email-revert:${did}` : null;

  // The current address — updated locally on success so the row reflects the
  // change without a full session refresh.
  const [currentEmail, setCurrentEmail] = useState(email);
  // Whether `currentEmail` is confirmed. Seeded from the session, then owned
  // locally as the user changes / confirms without a full session refetch.
  const [confirmed, setConfirmed] = useState(emailConfirmed);
  // The address to offer reverting to (the last *confirmed* one before a
  // change). Loaded from session storage on mount so it survives a reload.
  const [previousEmail, setPreviousEmail] = useState<string | null>(null);

  // On a hard refresh the session loads after this mounts, so the props arrive
  // empty/false and fill in a tick later. Sync them in.
  useEffect(() => {
    setCurrentEmail(email);
  }, [email]);
  useEffect(() => {
    setConfirmed(emailConfirmed);
  }, [emailConfirmed]);
  useEffect(() => {
    if (!revertKey) return;
    try {
      setPreviousEmail(sessionStorage.getItem(revertKey));
    } catch {
      /* storage unavailable — revert just won't be offered */
    }
  }, [revertKey]);

  const rememberPrevious = (value: string | null) => {
    setPreviousEmail(value);
    if (!revertKey) return;
    try {
      if (value) sessionStorage.setItem(revertKey, value);
      else sessionStorage.removeItem(revertKey);
    } catch {
      /* ignore */
    }
  };

  const [state, setState] = useState<State>("idle");
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
        err instanceof Error
          ? err.message
          : "Couldn't start the email change. Please try again.",
      );
      setState("idle");
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
        err instanceof Error
          ? err.message
          : "Couldn't send the confirmation code.",
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
      // Only capture the revert target when leaving a *confirmed* address, so
      // repeated fixes of a typo still revert to the original good address.
      if (confirmed && currentEmail) rememberPrevious(currentEmail);
      setCurrentEmail(next);
      setConfirmed(false);
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
      const msg =
        err instanceof Error ? err.message : "Couldn't update your email.";
      setFormError(
        /token|code/i.test(msg)
          ? "That code looks wrong or expired. Request a new one."
          : msg,
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
      rememberPrevious(null);
      setCode("");
      setState("success");
      setTimeout(() => setState("idle"), 4000);
    } catch (err) {
      if (err instanceof EmailLockedError) {
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      const msg =
        err instanceof Error ? err.message : "Couldn't confirm your email.";
      setFormError(
        /token|code/i.test(msg)
          ? "That code looks wrong or expired. Resend a new one."
          : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  // Revert to the last confirmed address. Tokenless because the current
  // address is unconfirmed; the reverted address then needs confirming too.
  const handleRevert = async () => {
    if (!previousEmail) return;
    setSaving(true);
    setFormError(null);
    try {
      await updateEmail(previousEmail);
      setCurrentEmail(previousEmail);
      setConfirmed(false);
      rememberPrevious(null);
      clearFormState();
      setState("idle");
    } catch (err) {
      if (err instanceof EmailLockedError) {
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      setFormError(
        err instanceof Error ? err.message : "Couldn't revert your email.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    clearFormState();
    setState("idle");
  };

  if (state === "form") {
    return (
      <div className="dash-card">
        <div className="password-section--form">
          <p className="password-section__hint">
            {tokenRequired
              ? `We sent a confirmation code to ${currentEmail}. Enter it with your new email address.`
              : "Enter the email address you'd like to use. We'll send a code to confirm it."}
          </p>
          <div className="password-section__fields">
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
          </div>
          {formError && (
            <Banner variant="error" className="mt-2">
              {formError}
            </Banner>
          )}
          <div className="password-section__actions">
            <Button size="sm" onClick={handleSave} disabled={saving}>
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
        </div>
      </div>
    );
  }

  if (state === "confirm") {
    return (
      <div className="dash-card">
        <div className="password-section--form">
          <p className="password-section__hint">
            Your email is now <strong>{currentEmail}</strong>, but it isn&rsquo;t
            confirmed yet. Enter the code we sent there to confirm it. Until you
            do, you can change it again or revert with no code.
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
            <Button size="sm" onClick={handleConfirm} disabled={saving}>
              {saving ? "Confirming…" : "Confirm email"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void startConfirmation()}
              disabled={saving}
            >
              Resend code
            </Button>
          </div>
          <div className="password-section__actions mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void beginChange()}
              disabled={saving}
            >
              Use a different email
            </Button>
            {previousEmail && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevert}
                disabled={saving}
              >
                Revert to {previousEmail}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setState("idle")}
              disabled={saving}
            >
              Later
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="settings-field">
        <span className="settings-field__value">{currentEmail || "—"}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={beginChange}
          disabled={state === "requesting"}
        >
          {state === "requesting" ? (
            "Starting…"
          ) : (
            <>
              <Pencil size={14} />
              Edit
            </>
          )}
        </Button>
      </div>
      {state !== "success" && currentEmail && !confirmed && (
        <Banner variant="warning" className="mt-3">
          This email isn&rsquo;t confirmed yet — confirm it so sign-in and
          recovery messages reach you.
          <div className="password-section__actions mt-2">
            <Button size="sm" onClick={() => void startConfirmation()}>
              Verify email
            </Button>
            {previousEmail && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevert}
                disabled={saving}
              >
                Revert to {previousEmail}
              </Button>
            )}
          </div>
        </Banner>
      )}
      {state === "success" && (
        <p className="password-section__status password-section__status--success">
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
