"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { authFetch } from "@/lib/auth/fetch";
import { clearSessionCache } from "@/hooks/use-session";

interface EmailSectionProps {
  email: string;
}

type State = "idle" | "requesting" | "form" | "success";

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  const [state, setState] = useState<State>("idle");

  // Form fields
  const [token, setToken] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  // Error states
  const [idleError, setIdleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Saving state
  const [saving, setSaving] = useState(false);

  const clearFormState = () => {
    setToken("");
    setNewEmail("");
    setConfirmEmail("");
    setFormError(null);
  };

  const handleRequestUpdate = async () => {
    setState("requesting");
    setIdleError(null);
    try {
      const res = await authFetch("/api/xrpc/com/atproto/server/requestEmailUpdate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || res.statusText);
      }
      // Whether tokenRequired is true or false, show the form
      setState("form");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg || msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setIdleError("Failed to send confirmation email. Please try again.");
      } else {
        setIdleError(msg);
      }
      setState("idle");
    }
  };

  const handleSubmit = async () => {
    // Client-side validation
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (newEmail.trim() !== confirmEmail.trim()) {
      setFormError("Email addresses do not match.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await authFetch("/api/xrpc/com/atproto/server/updateEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), token: token.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || res.statusText);
      }
      clearFormState();
      setState("success");
      clearSessionCache();
      setTimeout(() => {
        window.location.reload();
      }, 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred. Please try again.";
      setFormError(msg);
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
      <div className="dash-card mt-4">
        <div className="email-section__header">
          <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Email address</h2>
        </div>
        <div className="email-section--form">
          <p className="email-section__hint">
            We sent a confirmation code to your current email. Enter it below with your new email address.
          </p>
          <div className="email-section__fields">
            <Input
              label="Confirmation code"
              type="text"
              placeholder="Enter code from email"
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Input
              label="New email"
              type="email"
              placeholder="Enter new email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <Input
              label="Confirm new email"
              type="email"
              placeholder="Confirm new email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
          </div>
          {formError && <p className="email-section__error" role="alert">{formError}</p>}
          <div className="email-section__actions">
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-card mt-4">
      <div className="email-section__header">
        <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Email address</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRequestUpdate}
          disabled={state === "requesting"}
        >
          <Pencil size={14} />
          {state === "requesting" ? "Sending…" : "Edit"}
        </Button>
      </div>
      {state === "success" ? (
        <p className="email-section__status email-section__status--success">Email updated successfully.</p>
      ) : (
        <p className="personal-info__field">{email || "—"}</p>
      )}
      {state === "idle" && (
        <p className="email-section__hint">
          This is the email address used to sign in to your account.
        </p>
      )}
      {idleError && <p className="email-section__error" role="alert">{idleError}</p>}
    </div>
  );
};

export default EmailSection;
