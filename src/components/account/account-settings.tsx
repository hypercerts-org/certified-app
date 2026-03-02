"use client";

import { useState, useEffect, useMemo } from "react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import PasswordSection from "@/components/account/password-section";
import { authFetch } from "@/lib/auth/fetch";

interface AccountSettingsProps {
  did: string;
}

/**
 * Extract the PDS hostname from the environment variable.
 * e.g. "https://epds1.test.certified.app/" → "epds1.test.certified.app"
 */
function getPdsHostname(): string {
  const url = process.env.NEXT_PUBLIC_PDS_URL || "https://epds1.test.certified.app";
  try {
    return new URL(url).hostname;
  } catch {
    return "epds1.test.certified.app";
  }
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ did }) => {
  const [handle, setHandle] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loadingSession, setLoadingSession] = useState(true);

  // Handle editing state
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleMode, setHandleMode] = useState<"subdomain" | "custom">("subdomain");
  const [subdomainValue, setSubdomainValue] = useState("");
  const [customDomainValue, setCustomDomainValue] = useState("");
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuccess, setHandleSuccess] = useState(false);

  const pdsHostname = useMemo(() => getPdsHostname(), []);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await authFetch("/api/xrpc/com/atproto/server/getSession");
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setHandle(data.handle);
        setEmail(data.email ?? "");
      } catch {
        // Silently fail
      } finally {
        setLoadingSession(false);
      }
    };
    fetchSession();
  }, []);

  // Derive the current subdomain from the handle
  const currentSubdomain = useMemo(() => {
    if (handle.endsWith(`.${pdsHostname}`)) {
      return handle.slice(0, -(pdsHostname.length + 1));
    }
    return null;
  }, [handle, pdsHostname]);

  const isCustomHandle = currentSubdomain === null && handle !== "";

  // Handle editing handlers
  const handleStartEdit = () => {
    if (isCustomHandle) {
      setHandleMode("custom");
      setCustomDomainValue(handle);
      setSubdomainValue("");
    } else {
      setHandleMode("subdomain");
      setSubdomainValue(currentSubdomain || "");
      setCustomDomainValue("");
    }
    setHandleError(null);
    setHandleSuccess(false);
    setEditingHandle(true);
  };

  const handleCancel = () => {
    setEditingHandle(false);
    setSubdomainValue("");
    setCustomDomainValue("");
    setHandleError(null);
  };

  const handleSave = async () => {
    const newHandle =
      handleMode === "subdomain"
        ? `${subdomainValue.toLowerCase().trim()}.${pdsHostname}`
        : customDomainValue.toLowerCase().trim();

    if (!newHandle || newHandle === handle) {
      setHandleError("Please enter a different handle.");
      return;
    }

    // Basic validation for subdomain mode
    if (handleMode === "subdomain") {
      const sub = subdomainValue.toLowerCase().trim();
      if (sub.length < 3 || sub.length > 18) {
        setHandleError("Username must be 3–18 characters.");
        return;
      }
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(sub) && sub.length > 2) {
        setHandleError("Only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.");
        return;
      }
      if (/^[a-z0-9]$/.test(sub)) {
        // Single char — already caught by length check, but just in case
      }
    }

    setHandleSaving(true);
    setHandleError(null);
    try {
      const res = await authFetch("/api/xrpc/com/atproto/identity/updateHandle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: newHandle }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || res.statusText);
      }
      setHandle(newHandle);
      setEditingHandle(false);
      setHandleSuccess(true);
      setTimeout(() => setHandleSuccess(false), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update handle";
      if (msg.includes("already") || msg.includes("taken")) {
        setHandleError("This username is already taken. Try another one.");
      } else if (msg.includes("slur") || msg.includes("reserved")) {
        setHandleError("This username is not available.");
      } else if (msg.includes("resolve") || msg.includes("DNS")) {
        setHandleError(
          "Could not verify your domain. Make sure the DNS record is set up and has propagated."
        );
      } else {
        setHandleError(msg);
      }
    } finally {
      setHandleSaving(false);
    }
  };

  if (loadingSession || !handle) return null;

  return (
    <div className="app-card">
      <p className="app-card__label mb-6">Account</p>

      {/* ── USERNAME (HANDLE) ── */}
      <div>
        {!editingHandle ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="app-card__label">Username</p>
              <p className="text-body text-gray-700 break-all">{handle}</p>
              {handleSuccess && (
                <p className="text-body-sm text-success mt-1">Handle updated.</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleStartEdit} className="ml-4 flex-shrink-0">
              Change
            </Button>
          </div>
        ) : (
          <div>
            <p className="app-card__label mb-2">Username</p>

            {/* Mode tabs */}
            <div className="flex gap-1 mb-3 mt-1">
              <button
                type="button"
                onClick={() => { setHandleMode("subdomain"); setHandleError(null); }}
                className={`font-mono text-xs tracking-wider px-3 py-1.5 rounded transition-colors duration-200 ${
                  handleMode === "subdomain"
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                Choose a username
              </button>
              <button
                type="button"
                onClick={() => { setHandleMode("custom"); setHandleError(null); }}
                className={`font-mono text-xs tracking-wider px-3 py-1.5 rounded transition-colors duration-200 ${
                  handleMode === "custom"
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                Use my own domain
              </button>
            </div>

            {handleMode === "subdomain" ? (
              <div>
                <div className="flex items-center gap-0">
                  <Input
                    type="text"
                    value={subdomainValue}
                    onChange={(e) => setSubdomainValue(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                    placeholder="yourname"
                    className="rounded-r-none border-r-0"
                  />
                  <span className="h-11 flex items-center px-3 bg-[var(--color-off-white)] border border-[rgba(15,37,68,0.15)] rounded-r text-xs text-gray-400 font-mono whitespace-nowrap select-none">
                    .{pdsHostname}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  3–18 characters. Letters, numbers, and hyphens only.
                </p>
              </div>
            ) : (
              <div>
                <Input
                  type="text"
                  value={customDomainValue}
                  onChange={(e) => setCustomDomainValue(e.target.value)}
                  placeholder="you.example.com"
                />
                <div className="mt-3 p-4 rounded bg-[var(--color-off-white)] border border-[rgba(15,37,68,0.1)]">
                  <p className="app-card__label mb-2">
                    Setup required
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    To use your own domain as your handle, add a DNS TXT record before saving:
                  </p>
                  <div className="mt-2 p-2 rounded bg-white border border-[rgba(15,37,68,0.1)] font-mono text-xs text-gray-700 break-all">
                    <span className="text-gray-400">Host:</span> _atproto.{customDomainValue || "you.example.com"}
                    <br />
                    <span className="text-gray-400">Value:</span> did={did}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    DNS changes can take a few minutes to propagate. Save once the record is active.
                  </p>
                </div>
              </div>
            )}

            {handleError && (
              <p className="text-body-sm text-error mt-2">{handleError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleSave} disabled={handleSaving}>
                {handleSaving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={handleSaving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── DID ── */}
      <div className="border-t border-[rgba(15,37,68,0.08)] pt-6 mt-6">
        <p className="app-card__label">DID</p>
        <p className="font-mono text-body-sm text-gray-400 break-all select-all">{did}</p>
        <p className="text-xs text-gray-400 mt-1">
          Your permanent, unique identifier. This never changes.
        </p>
      </div>

      {/* ── EMAIL (read-only) ── */}
      <div className="border-t border-[rgba(15,37,68,0.08)] pt-6 mt-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="app-card__label">Email</p>
            <p className="text-body text-gray-700">
              {email || <span className="text-gray-400 italic">No email on file</span>}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Email changes are not yet supported. This will be available in a future update.
        </p>
      </div>

      {/* ── PASSWORD ── */}
      <div className="border-t border-[rgba(15,37,68,0.08)] pt-6 mt-6">
        <PasswordSection email={email} />
      </div>
    </div>
  );
};

export default AccountSettings;
