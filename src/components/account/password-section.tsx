"use client";

import { useState } from "react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { authFetch } from "@/lib/auth/fetch";

interface PasswordSectionProps {
  email: string;
}

type State = "idle" | "requesting" | "form" | "success";

const PasswordSection: React.FC<PasswordSectionProps> = ({ email }) => {
  const [state, setState] = useState<State>("idle");
  const [hasSetPassword, setHasSetPassword] = useState(false);

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
        const data = await resetRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || resetRes.statusText);
      }
      setState("form");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg || msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setIdleError("Failed to send reset email. Please try again.");
      } else {
        setIdleError(msg);
      }
      setState("idle");
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
        const data = await pwRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || pwRes.statusText);
      }
      setHasSetPassword(true);
      clearFormState();
      setState("success");
      setTimeout(() => setState("idle"), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred. Please try again.";
      if (msg.includes("expired")) {
        setFormError("Reset code has expired. Please request a new one.");
      } else if (msg.includes("invalid") || msg.includes("Invalid")) {
        setFormError("Invalid reset code. Please check and try again.");
      } else if (msg.includes("length")) {
        setFormError("Password is too long (max 256 characters).");
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
      <div>
        <p className="font-sans text-overline uppercase tracking-[0.12em] text-gray-400 mb-2">Password</p>
        <p className="font-sans text-xs text-gray-500 mb-3">
          We sent a password reset code to your email. Enter it below with your new password.
        </p>
        <div className="flex flex-col gap-3">
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
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmPasswordError ?? undefined}
          />
        </div>
        {formError && (
          <p className="font-sans text-body-sm text-error mt-2">{formError}</p>
        )}
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-sans text-overline uppercase tracking-[0.12em] text-gray-400 mb-1">Password</p>
        {state === "success" ? (
          <p className="font-sans text-body-sm text-success mt-1">Password updated successfully.</p>
        ) : hasSetPassword ? (
          <p className="font-sans text-body text-gray-700">Password set</p>
        ) : (
          <p className="font-sans text-body text-gray-400 italic">Not set</p>
        )}
        {state === "idle" && !hasSetPassword && (
          <p className="font-sans text-xs text-gray-400 mt-1">
            Set a password to sign in to other AT Protocol apps (like Bluesky) with your handle.
          </p>
        )}
        {idleError && (
          <p className="font-sans text-body-sm text-error mt-2">{idleError}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRequestReset}
        disabled={state === "requesting"}
        className="ml-4 flex-shrink-0"
      >
        {state === "requesting" ? "Sending…" : hasSetPassword ? "Change Password" : "Set Password"}
      </Button>
    </div>
  );
};

export default PasswordSection;
