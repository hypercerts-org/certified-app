"use client";

import { useState } from "react";
import { Copy, Check, Trash2, Plus, Key } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { useAppPasswords } from "@/hooks/use-app-passwords";
import type { CreateAppPasswordResponse } from "@/lib/types/api";

export default function AppPasswordSection() {
  const { passwords, isLoading, error, createPassword, revokePassword } = useAppPasswords();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<CreateAppPasswordResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError("Please enter a name for this app password.");
      return;
    }
    if (trimmed.length > 32) {
      setNameError("Name must be 32 characters or fewer.");
      return;
    }
    // Check for duplicate names
    if (passwords.some((p) => p.name === trimmed)) {
      setNameError("An app password with this name already exists.");
      return;
    }
    setNameError(null);
    setActionError(null);
    setSaving(true);
    try {
      const result = await createPassword(trimmed);
      setCreatedPassword(result);
      setNewName("");
      setIsCreating(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create app password");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  };

  const handleDismissCreated = () => {
    setCreatedPassword(null);
    setCopied(false);
  };

  const handleRevoke = async (name: string) => {
    if (!confirm(`Revoke app password "${name}"? Any app using it will be signed out.`)) return;
    setRevoking(name);
    setActionError(null);
    try {
      await revokePassword(name);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to revoke app password");
    } finally {
      setRevoking(null);
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setNewName("");
    setNameError(null);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="security__loading" role="status">Loading app passwords…</div>
    );
  }

  return (
    <div className="app-pw">
      {/* Just-created password banner */}
      {createdPassword && (
        <div className="app-pw__created" role="alert">
          <p className="app-pw__created-heading">
            App password created for <strong>{createdPassword.name}</strong>
          </p>
          <p className="app-pw__created-warning">
            Copy this password now — you won&apos;t be able to see it again.
          </p>
          <div className="app-pw__created-row">
            <code className="app-pw__created-value">{createdPassword.password}</code>
            <button
              type="button"
              className="app-pw__copy-btn"
              onClick={handleCopy}
              aria-label={copied ? "Copied" : "Copy password"}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDismissCreated}>
            Done
          </Button>
        </div>
      )}

      {/* Error banner */}
      {(error || actionError) && (
        <p className="app-pw__error" role="alert">{actionError || error}</p>
      )}

      {/* Create form */}
      {isCreating && !createdPassword && (
        <div className="app-pw__create-form">
          <Input
            label="App password name"
            type="text"
            placeholder='e.g. "My bot" or "Feed reader"'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            error={nameError ?? undefined}
            autoFocus
            maxLength={32}
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
          />
          <div className="app-pw__create-actions">
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Password list */}
      {passwords.length > 0 && (
        <ul className="app-pw__list">
          {passwords.map((pw) => (
            <li key={pw.name} className="app-pw__item">
              <div className="app-pw__item-info">
                <Key size={14} className="app-pw__item-icon" aria-hidden="true" />
                <span className="app-pw__item-name">{pw.name}</span>
                <span className="app-pw__item-date">
                  {new Date(pw.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <button
                type="button"
                className="app-pw__revoke-btn"
                onClick={() => handleRevoke(pw.name)}
                disabled={revoking === pw.name}
                aria-label={`Revoke ${pw.name}`}
              >
                <Trash2 size={14} />
                {revoking === pw.name ? "Revoking…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {passwords.length === 0 && !isCreating && !createdPassword && (
        <p className="app-pw__empty">No app passwords yet.</p>
      )}

      {/* Add button */}
      {!isCreating && !createdPassword && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setIsCreating(true); setActionError(null); }}
          className="app-pw__add-btn"
        >
          <Plus size={14} />
          Add app password
        </Button>
      )}
    </div>
  );
}
