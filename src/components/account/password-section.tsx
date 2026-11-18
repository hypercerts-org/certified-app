"use client";

import { useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import Banner from "@/components/ui/banner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { authFetch } from "@/lib/auth/fetch";
import { userErrorMessage } from "@/lib/utils/user-error";

interface PasswordSectionProps {
  email: string;
}

// "asking": Edit opened the step that says where the code goes; nothing
// is sent until Send code. "requesting": the code is on its way.
type State = "idle" | "asking" | "requesting" | "form" | "success";

const SEND_FAILED = "Couldn't send the reset code. Try again in a moment";
const SAVE_FAILED = "Couldn't change your password. Try again in a moment";

/** A failed XRPC response's error name and message, when it has them. */
async function readError(
  res: Response,
): Promise<{ name?: string; message?: string }> {
  try {
    const data = (await res.json()) as { error?: unknown; message?: unknown };
    return {
      name: typeof data.error === "string" ? data.error : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  } catch {
    return {};
  }
}

const PasswordSection: React.FC<PasswordSectionProps> = ({ email }) => {
  const [state, setState] = useState<State>("idle");
  const editRef = useRef<HTMLButtonElement>(null);
  const stepId = useId();

  // Form fields
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Error states
  const [idleError, setIdleError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Saving state
  const [saving, setSaving] = useState(false);

  const clearFormState = () => {
    setToken("");
    setPassword("");
    setConfirmPassword("");
    setTokenError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setFormError(null);
  };

  const handleRequestReset = async () => {
    setState("requesting");
    setIdleError(null);
    try {
      const resetRes = await authFetch("/api/xrpc/com/atproto/server/requestPasswordReset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!resetRes.ok) {
        // Upstream answers ("NotFound", "Not authenticated") become a
        // sentence; the status decides session and server failures.
        const { name, message } = await readError(resetRes);
        setIdleError(userErrorMessage(message ?? name, SEND_FAILED, resetRes.status));
        // The step stays open, so Send code tries again.
        setState("asking");
        return;
      }
      setState("form");
    } catch {
      // The request didn't get through (offline, blocked).
      setIdleError(`${SEND_FAILED}.`);
      setState("asking");
    }
  };

  const handleSubmit = async () => {
    // Client-side validation
    let valid = true;

    if (!token.trim()) {
      setTokenError("Please enter the reset code from your email.");
      valid = false;
    } else {
      setTokenError(null);
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    } else if (password.length > 256) {
      setPasswordError("Password is too long (max 256 characters).");
      valid = false;
    } else {
      setPasswordError(null);
    }

    if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmPasswordError(null);
    }

    if (!valid) return;

    setSaving(true);
    setFormError(null);
    try {
      const pwRes = await authFetch("/api/xrpc/com/atproto/server/resetPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      if (!pwRes.ok) {
        const { name, message } = await readError(pwRes);
        // The error name ("ExpiredToken", "InvalidToken") and the message
        // both say what went wrong with the code.
        const said = `${name ?? ""} ${message ?? ""}`;
        if (/expired/i.test(said)) {
          setFormError("That reset code has expired. Request a new one.");
        } else if (/invalid/i.test(said)) {
          setFormError("That reset code doesn't match. Check it and try again.");
        } else if (/length/i.test(said)) {
          setFormError("Password is too long (max 256 characters).");
        } else {
          setFormError(userErrorMessage(message ?? name, SAVE_FAILED, pwRes.status));
        }
        return;
      }
      clearFormState();
      setState("success");
      setTimeout(() => setState("idle"), 4000);
    } catch {
      setFormError(`${SAVE_FAILED}.`);
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
            void handleSubmit();
          }}
        >
          <p className="password-section__hint">
            We sent a password reset code to your email. Enter it below with your new password.
          </p>
          <div className="password-section__fields">
            <Input
              label="Reset code"
              type="text"
              placeholder="Enter code from email"
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              error={tokenError ?? undefined}
            />
            <Input
              label="New password"
              type="password"
              placeholder="Enter new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError ?? undefined}
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={confirmPasswordError ?? undefined}
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
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="settings-field">
        <span className="settings-field__value">••••••••••••</span>
        {/* Edit only opens the step below: the reset code is emailed on
            Send code, never on this click. */}
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
          Edit{" "}<span className="sr-only">password</span>
        </Button>
      </div>
      {stepOpen && (
        <div id={stepId}>
          <p className="password-section__hint">
            We&rsquo;ll email a code to{" "}
            <strong className="font-medium text-[var(--fg-primary)] [overflow-wrap:anywhere]">
              {email || "your email address"}
            </strong>{" "}
            so you can set a new password.
          </p>
          <div className="password-section__actions">
            <Button
              size="sm"
              onClick={() => void handleRequestReset()}
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
      {state === "success" && (
        <p className="password-section__status password-section__status--success" role="status">Password updated successfully.</p>
      )}
      {idleError && (
        <Banner variant="error" className="mt-3">
          {idleError}
        </Banner>
      )}
    </div>
  );
};

export default PasswordSection;
