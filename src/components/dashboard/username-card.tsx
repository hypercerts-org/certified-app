"use client";

import React, { useId, useState, useMemo } from "react";
import { Pencil, Globe, AtSign } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { authFetch } from "@/lib/auth/fetch";
import { DEFAULT_PDS_URL } from "@/lib/utils/config";
import { clearSessionCache } from "@/hooks/use-session";
import CustomDomainModal from "@/components/dashboard/custom-domain-modal";
import CopyPill from "@/components/account/copy-pill";

interface UsernameCardProps {
  handle: string | null;
  pdsUrl?: string;
  did?: string;
  groupDid?: string;  // When set, handle changes go through the org proxy
}

function getPdsHostname(pdsUrl?: string, handle?: string | null): string {
  // Derive from PDS URL if available
  if (pdsUrl) {
    try {
      return new URL(pdsUrl).hostname;
    } catch { /* ignore */ }
  }
  // Derive from handle — everything after the first dot
  if (handle && handle.includes(".")) {
    return handle.slice(handle.indexOf(".") + 1);
  }
  // Fallback to env
  try {
    return new URL(DEFAULT_PDS_URL).hostname;
  } catch {
    return "certified.one";
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
  // If handle has a dot, it's a subdomain-style handle (not a custom domain like alice.com)
  // Consider it "ours" if it has 2+ dots (prefix.pds.host.tld)
  if (handle.split(".").length >= 3) return true;
  // Legacy fallbacks for handles that pre-date a configured pdsUrl. Includes
  // .certs.social (the old domain) so users migrating accounts retain the
  // "you can manage this" experience.
  return handle.endsWith(".certified.app") || handle.endsWith(".certs.social");
}

export default function UsernameCard({ handle, pdsUrl, did, groupDid }: UsernameCardProps) {
  const isCertifiedHandle = isOurHandle(handle, pdsUrl);
  const pdsHostname = useMemo(() => getPdsHostname(pdsUrl, handle), [pdsUrl, handle]);

  const [isEditing, setIsEditing] = useState(false);
  const [newHandle, setNewHandle] = useState(handle || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);

  // "subdomain" mode: choosing a certs username (username.pdsHostname)
  const [isChoosingCertified, setIsChoosingCerts] = useState(false);
  const [subdomainValue, setSubdomainValue] = useState("");

  const handleEdit = () => {
    // Extract just the prefix from the current handle
    const currentPrefix = handle && handle.includes(".")
      ? handle.slice(0, handle.indexOf("."))
      : handle || "";
    setNewHandle(currentPrefix);
    setError(null);
    setIsEditing(true);
    setIsChoosingCerts(false);
  };

  const handleStartCertified = () => {
    setSubdomainValue("");
    setError(null);
    setIsChoosingCerts(true);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsChoosingCerts(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = newHandle.trim().toLowerCase();
    if (!trimmed) {
      setError("Handle cannot be empty.");
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 18) {
      setError("Handle must be 3-18 characters.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(trimmed) && trimmed.length > 2) {
      setError("Only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.");
      return;
    }
    await submitHandle(`${trimmed}.${pdsHostname}`);
  };

  const handleSaveCertified = async () => {
    const sub = subdomainValue.toLowerCase().trim();
    if (!sub) {
      setError("Handle cannot be empty.");
      return;
    }
    if (sub.length < 3 || sub.length > 18) {
      setError("Handle must be 3-18 characters.");
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
      let res: Response;
      if (groupDid) {
        // Route through the org handle API
        res = await authFetch(
          `/api/groups/${encodeURIComponent(groupDid)}/handle`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: newHandleValue }),
          }
        );
      } else {
        // Route through the standard XRPC proxy
        res = await authFetch("/api/xrpc/com/atproto/identity/updateHandle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: newHandleValue }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string; message?: string }).message
          || (data as { error?: string }).error
          || "Couldn't change your handle. Try again.";
        if (msg.includes("already") || msg.includes("taken")) {
          throw new Error("This handle is already taken. Try another one.");
        }
        if (msg.includes("slur") || msg.includes("reserved")) {
          throw new Error("This handle is not available.");
        }
        throw new Error(msg);
      }

      clearSessionCache();
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't change your handle. Try again.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const showingForm = isEditing || isChoosingCertified;

  // The ways to change the handle from here, in order. One opens straight
  // from Edit; several are shown as buttons when Edit is pressed.
  const [isChoosing, setIsChoosing] = useState(false);
  const optionsId = useId();
  const options: { key: string; label: string; icon: typeof Pencil; onSelect: () => void }[] = [];
  if (isCertifiedHandle) {
    options.push({ key: "certified", label: "Change Certified handle", icon: AtSign, onSelect: handleEdit });
    if (did && !groupDid) {
      options.push({ key: "domain", label: "Use my own domain", icon: Globe, onSelect: () => setIsDomainModalOpen(true) });
    }
  } else if (did) {
    if (!groupDid) {
      options.push({ key: "domain", label: "Use a different domain", icon: Globe, onSelect: () => setIsDomainModalOpen(true) });
    }
    options.push({ key: "certified", label: "Use a Certified handle", icon: AtSign, onSelect: handleStartCertified });
  }

  return (
    <>
      <div className="dash-card mt-4">
        <div className="username-card">
          {/* Inline edit for certs handle */}
          {isEditing && (
            <div className="username-card__form">
              <label className="username-card__form-label" htmlFor="username-input">Handle</label>
              <div className="username-card__subdomain-row">
                <input
                  id="username-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-describedby={error ? "username-hint username-error" : "username-hint"}
                  aria-invalid={error ? true : undefined}
                  className="username-card__subdomain-input"
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder="yourname"
                  disabled={isSaving}
                />
                <span className="username-card__subdomain-suffix">.{pdsHostname}</span>
              </div>
              <p id="username-hint" className="username-card__subdomain-hint">3-18 characters. Letters, numbers, and hyphens only.</p>
              {error && (
                <p id="username-error" className="username-card__error" role="alert">{error}</p>
              )}
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

          {/* Subdomain picker for switching back to certs */}
          {isChoosingCertified && (
            <div className="username-card__form">
              <label className="username-card__form-label" htmlFor="certs-username-input">Choose a Certified handle</label>
              <div className="username-card__subdomain-row">
                <input
                  id="certs-username-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-describedby={error ? "certs-username-hint certs-username-error" : "certs-username-hint"}
                  aria-invalid={error ? true : undefined}
                  className="username-card__subdomain-input"
                  value={subdomainValue}
                  onChange={(e) => setSubdomainValue(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder="yourname"
                  disabled={isSaving}
                />
                <span className="username-card__subdomain-suffix">.{pdsHostname}</span>
              </div>
              <p id="certs-username-hint" className="username-card__subdomain-hint">3-18 characters. Letters, numbers, and hyphens only.</p>
              {error && (
                <p id="certs-username-error" className="username-card__error" role="alert">{error}</p>
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

          {/* Read-only display: the value, then Edit in the same action
              column as the email and password rows, so the value boxes share
              one width and one right edge. When there is more than one way
              to change the handle, Edit opens them as a row of secondary
              buttons below. The custom-domain options are gated OFF in group
              context (groupDid set): that flow writes the handle via the
              personal XRPC updateHandle endpoint, which is wrong for a group
              repo. "Use a Certified handle" goes through the group-aware
              path. */}
          {!showingForm && (
            <div className="settings-field">
              {/* Click-to-copy the bare handle (no @), mirroring the DID pill —
                  `display` keeps the familiar @handle on screen. */}
              <span className="flex-1 min-w-0" data-tour="settings-handle">
                {handle ? (
                  <CopyPill value={handle} display={`@${handle}`} label="handle" />
                ) : (
                  <span className="settings-field__value">@…</span>
                )}
              </span>
              {options.length === 1 ? (
                <Button variant="ghost" size="sm" onClick={options[0].onSelect}>
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                  Edit{" "}<span className="sr-only">handle</span>
                </Button>
              ) : options.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={isChoosing}
                  aria-controls={optionsId}
                  onClick={() => setIsChoosing((v) => !v)}
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                  Edit{" "}<span className="sr-only">handle</span>
                </Button>
              ) : null}
              {options.length > 1 && isChoosing ? (
                <div id={optionsId} className="basis-full flex flex-wrap gap-2">
                  {options.map(({ key, label, icon: Icon, onSelect }) => (
                    <Button key={key} variant="secondary" size="sm" onClick={onSelect}>
                      <Icon size={16} strokeWidth={1.75} aria-hidden />
                      {label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Custom domain modal — not mounted in group context (groupDid set),
          since the modal writes the handle via the personal XRPC endpoint. */}
      {did && !groupDid && (
        <CustomDomainModal
          isOpen={isDomainModalOpen}
          onClose={() => setIsDomainModalOpen(false)}
          did={did}
        />
      )}
    </>
  );
}
