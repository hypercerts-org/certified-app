"use client";

import React, { useState, useMemo } from "react";
import { Pencil, Globe, AtSign } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { authFetch } from "@/lib/auth/fetch";
import { clearSessionCache } from "@/hooks/use-session";
import CustomDomainModal from "@/components/dashboard/custom-domain-modal";

interface UsernameCardProps {
  handle: string | null;
  pdsUrl?: string;
  did?: string;
}

function getPdsHostname(pdsUrl?: string): string {
  if (pdsUrl) {
    try {
      return new URL(pdsUrl).hostname;
    } catch { /* ignore */ }
  }
  const url = process.env.NEXT_PUBLIC_PDS_URL || "https://epds1.test.certified.app";
  try {
    return new URL(url).hostname;
  } catch {
    return "epds1.test.certified.app";
  }
}

function isOurHandle(handle: string | null, pdsUrl?: string): boolean {
  if (!handle) return false;
  if (pdsUrl) {
    try {
      const pdsHostname = new URL(pdsUrl).hostname;
      if (handle.endsWith(`.${pdsHostname}`)) return true;
    } catch { /* ignore invalid URL */ }
  }
  return handle.endsWith(".certified.app");
}

export default function UsernameCard({ handle, pdsUrl, did }: UsernameCardProps) {
  const isCertifiedHandle = isOurHandle(handle, pdsUrl);
  const pdsHostname = useMemo(() => getPdsHostname(pdsUrl), [pdsUrl]);

  const [isEditing, setIsEditing] = useState(false);
  const [newHandle, setNewHandle] = useState(handle || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);

  // "subdomain" mode: choosing a certified username (username.pdsHostname)
  const [isChoosingCertified, setIsChoosingCertified] = useState(false);
  const [subdomainValue, setSubdomainValue] = useState("");

  const handleEdit = () => {
    setNewHandle(handle || "");
    setError(null);
    setIsEditing(true);
    setIsChoosingCertified(false);
  };

  const handleStartCertified = () => {
    setSubdomainValue("");
    setError(null);
    setIsChoosingCertified(true);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsChoosingCertified(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = newHandle.trim();
    if (!trimmed) {
      setError("Username cannot be empty.");
      return;
    }
    await submitHandle(trimmed);
  };

  const handleSaveCertified = async () => {
    const sub = subdomainValue.toLowerCase().trim();
    if (!sub) {
      setError("Username cannot be empty.");
      return;
    }
    if (sub.length < 3 || sub.length > 18) {
      setError("Username must be 3-18 characters.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(sub) && sub.length > 2) {
      setError("Only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.");
      return;
    }
    await submitHandle(`${sub}.${pdsHostname}`);
  };

  const submitHandle = async (newHandleValue: string) => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await authFetch("/api/xrpc/com/atproto/identity/updateHandle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: newHandleValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string; message?: string }).message
          || (data as { error?: string }).error
          || res.statusText;
        if (msg.includes("already") || msg.includes("taken")) {
          throw new Error("This username is already taken. Try another one.");
        }
        if (msg.includes("slur") || msg.includes("reserved")) {
          throw new Error("This username is not available.");
        }
        throw new Error(msg);
      }

      clearSessionCache();
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update username.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const showingForm = isEditing || isChoosingCertified;

  return (
    <>
      <div className="dash-card mt-4">
        <div className="username-card">
          <div className="username-card__header">
            <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Username</h2>
            {isCertifiedHandle && !showingForm && (
              <Button variant="ghost" size="sm" onClick={handleEdit}>
                <Pencil size={14} />
                Edit
              </Button>
            )}
          </div>

          {/* Inline edit for certified handle */}
          {isEditing && (
            <div className="username-card__form">
              <Input
                label="New username"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                placeholder="your-username.certified.app"
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
          )}

          {/* Subdomain picker for switching back to certified */}
          {isChoosingCertified && (
            <div className="username-card__form">
              <label className="username-card__form-label">Choose a Certified username</label>
              <div className="username-card__subdomain-row">
                <input
                  type="text"
                  className="username-card__subdomain-input"
                  value={subdomainValue}
                  onChange={(e) => setSubdomainValue(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder="yourname"
                  disabled={isSaving}
                />
                <span className="username-card__subdomain-suffix">.{pdsHostname}</span>
              </div>
              <p className="username-card__subdomain-hint">3-18 characters. Letters, numbers, and hyphens only.</p>
              {error && (
                <p className="username-card__error" role="alert">{error}</p>
              )}
              <div className="username-card__actions">
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSaveCertified} loading={isSaving} disabled={isSaving}>
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Handle display */}
          {!showingForm && (
            <p className="username-card__value">@{handle || "..."}</p>
          )}

          {/* Action buttons — shown when not in any editing mode */}
          {!showingForm && did && (
            <div className="username-card__switch-btns">
              {isCertifiedHandle ? (
                <button
                  className="username-card__domain-btn"
                  onClick={() => setIsDomainModalOpen(true)}
                  type="button"
                >
                  <Globe size={14} aria-hidden="true" />
                  Use my own domain
                </button>
              ) : (
                <>
                  <button
                    className="username-card__domain-btn"
                    onClick={() => setIsDomainModalOpen(true)}
                    type="button"
                  >
                    <Globe size={14} aria-hidden="true" />
                    Use a different domain
                  </button>
                  <button
                    className="username-card__domain-btn"
                    onClick={handleStartCertified}
                    type="button"
                  >
                    <AtSign size={14} aria-hidden="true" />
                    Use a Certified username
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom domain modal */}
      {did && (
        <CustomDomainModal
          isOpen={isDomainModalOpen}
          onClose={() => setIsDomainModalOpen(false)}
          did={did}
        />
      )}
    </>
  );
}
