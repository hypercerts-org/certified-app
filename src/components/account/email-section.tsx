"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import Banner from "@/components/ui/banner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  requestEmailUpdate,
  updateEmail,
  EmailLockedError,
} from "@/lib/atproto/account-email";
import UnlockAppPasswordsDialog from "@/components/settings/unlock-app-passwords-dialog";

interface EmailSectionProps {
  email: string;
}

type State = "idle" | "requesting" | "form" | "success";

// Authoritative validation happens on the PDS; this is just a friendly
// pre-check so an obvious typo doesn't cost a round-trip.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  // The current address — updated locally on success so the row reflects the
  // change without a full session refresh.
  const [currentEmail, setCurrentEmail] = useState(email);

  const [state, setState] = useState<State>("idle");
  const [tokenRequired, setTokenRequired] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [token, setToken] = useState("");

  const [idleError, setIdleError] = useState<string | null>(null);
  const [newEmailError, setNewEmailError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearFormState = () => {
    setNewEmail("");
    setToken("");
    setNewEmailError(null);
    setTokenError(null);
    setFormError(null);
  };

  // Start (or resume after unlocking) an email change: ask the PDS to begin,
  // which tells us whether it emailed a confirmation code.
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
        // No elevated session yet — gate behind the unlock dialog, then retry.
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

  const handleSave = async () => {
    let valid = true;
    if (!looksLikeEmail(newEmail.trim())) {
      setNewEmailError("Enter a valid email address.");
      valid = false;
    } else if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) {
      setNewEmailError("That's already your email address.");
      valid = false;
    } else {
      setNewEmailError(null);
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
      await updateEmail(
        newEmail.trim(),
        tokenRequired ? token.trim() : undefined,
      );
      setCurrentEmail(newEmail.trim());
      clearFormState();
      setState("success");
      setTimeout(() => setState("idle"), 4000);
    } catch (err) {
      if (err instanceof EmailLockedError) {
        // Session expired mid-change — drop back and re-gate.
        clearFormState();
        setState("idle");
        setUnlockOpen(true);
        return;
      }
      const msg =
        err instanceof Error ? err.message : "Couldn't update your email.";
      if (/token|code/i.test(msg)) {
        setFormError("That code looks wrong or expired. Request a new one.");
      } else {
        setFormError(msg);
      }
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
              : "Enter the email address you'd like to use."}
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
      {state === "success" && (
        <p className="password-section__status password-section__status--success">
          Email updated successfully.
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
