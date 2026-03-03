"use client";

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { authFetch } from "@/lib/auth/fetch";
import { clearSessionCache } from "@/hooks/use-session";

interface UsernameCardProps {
  handle: string | null;
}

export default function UsernameCard({ handle }: UsernameCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newHandle, setNewHandle] = useState(handle || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEdit = () => {
    setNewHandle(handle || "");
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = newHandle.trim();
    if (!trimmed) {
      setError("Username cannot be empty.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await authFetch("/api/xrpc/com/atproto/identity/updateHandle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || res.statusText);
      }

      // Clear cached session so handle refreshes
      clearSessionCache();
      // Reload to reflect new handle everywhere
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update username.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dash-card mt-4">
      <div className="username-card">
        <div className="username-card__header">
          <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Username</h2>
          {!isEditing && (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil size={14} />
              Edit
            </Button>
          )}
        </div>
        {isEditing ? (
          <div className="username-card__form">
            <Input
              label="New username"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="your-username.certified.is"
              error={error ?? undefined}
            />
            <div className="username-card__actions">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={isSaving}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="username-card__value">@{handle || "..."}</p>
        )}
      </div>
    </div>
  );
}
