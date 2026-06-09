"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Globe, Copy, Check, AlertCircle, CheckCircle2 } from "lucide-react";
import { authFetch } from "@/lib/auth/fetch";
import { clearSessionCache } from "@/hooks/use-session";
import Button from "@/components/ui/button";
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog";
import Tooltip from "@/components/ui/tooltip";

interface CustomDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  did: string;
}

type Step = "enter-domain" | "dns-setup" | "verify";

export default function CustomDomainModal({ isOpen, onClose, did }: CustomDomainModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending reload timer if the modal unmounts before it fires
  // (e.g., user closes the success state too fast).
  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, []);

  const [step, setStep] = useState<Step>("enter-domain");
  const [domain, setDomain] = useState("");
  const [copied, setCopied] = useState<"host" | "value" | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Reset state when modal opens. AppDialog owns the Esc-to-close,
  // body-scroll-lock, focus trap, and focus save/restore; this effect
  // only resets the wizard's own state and focuses the domain input.
  useEffect(() => {
    if (isOpen) {
      setStep("enter-domain");
      setDomain("");
      setCopied(null);
      setIsVerifying(false);
      setVerifyError(null);
      setIsSuccess(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const cleanDomain = useCallback((input: string) => {
    let d = input.trim().toLowerCase();
    // Strip protocol if pasted
    d = d.replace(/^https?:\/\//, "");
    // Strip trailing slash / path
    d = d.split("/")[0];
    return d;
  }, []);

  const handleContinue = () => {
    const cleaned = cleanDomain(domain);
    if (!cleaned) return;
    setDomain(cleaned);
    setStep("dns-setup");
  };

  const handleCopy = async (text: string, which: "host" | "value") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyError(null);

    try {
      const res = await authFetch("/api/xrpc/com/atproto/identity/updateHandle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: domain }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = (data as { error?: string; message?: string }).message
          || (data as { error?: string }).error
          || res.statusText;

        if (errMsg.includes("resolve") || errMsg.includes("DNS") || errMsg.includes("not found")) {
          throw new Error(
            "DNS record not found yet. Make sure you added the TXT record and wait a few minutes for it to propagate."
          );
        }
        if (errMsg.includes("already") || errMsg.includes("taken")) {
          throw new Error("This domain is already in use by another account.");
        }
        throw new Error(errMsg);
      }

      // Success
      setIsSuccess(true);
      clearSessionCache();

      // Reload after a brief moment so the user sees the success state
      reloadTimerRef.current = setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  const dnsHost = `_atproto.${domain || "your-domain.com"}`;
  const dnsValue = `did=${did}`;

  return (
    <AppDialog
      ariaLabel="Use your own domain as your username"
      className="domain-modal"
      maxWidth={480}
      onClose={onClose}
    >
      <AppDialogHeader
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Globe size={18} className="domain-modal__header-icon" aria-hidden />
            Use your own domain
          </span>
        }
        onClose={onClose}
      />

      {/* Steps indicator */}
      <div className="domain-modal__steps">
          <div className={`domain-modal__step ${step === "enter-domain" ? "domain-modal__step--active" : ""} ${step !== "enter-domain" ? "domain-modal__step--done" : ""}`}>
            <span className="domain-modal__step-num">1</span>
            <span className="domain-modal__step-label">Enter domain</span>
          </div>
          <div className="domain-modal__step-line" />
          <div className={`domain-modal__step ${step === "dns-setup" ? "domain-modal__step--active" : ""} ${step === "verify" ? "domain-modal__step--done" : ""}`}>
            <span className="domain-modal__step-num">2</span>
            <span className="domain-modal__step-label">Add DNS record</span>
          </div>
          <div className="domain-modal__step-line" />
          <div className={`domain-modal__step ${step === "verify" ? "domain-modal__step--active" : ""}`}>
            <span className="domain-modal__step-num">3</span>
            <span className="domain-modal__step-label">Verify</span>
          </div>
        </div>

        {/* Body */}
        <div className="domain-modal__body">
          {step === "enter-domain" && (
            <>
              <p className="domain-modal__desc">
                You can use a domain you own as your username. For example, if you own <strong>alice.com</strong>, your
                username will become <strong>@alice.com</strong>.
              </p>
              <label className="domain-modal__label" htmlFor="domain-input">
                Domain
              </label>
              <input
                id="domain-input"
                ref={inputRef}
                type="text"
                className="domain-modal__input"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleContinue(); }}
              />
              <p className="domain-modal__hint">
                Enter the domain you want to use as your username. You must have access to its DNS settings.
              </p>
              <div className="domain-modal__actions">
                <Button variant="ghost" size="sm" onClick={onClose} type="button">
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleContinue}
                  disabled={!cleanDomain(domain)}
                  type="button"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === "dns-setup" && (
            <>
              <p className="domain-modal__desc">
                Add the following DNS record to <strong>{domain}</strong> using your domain registrar or DNS provider (e.g. Cloudflare, Namecheap, GoDaddy).
              </p>

              <div className="domain-modal__dns-card">
                <div className="domain-modal__dns-row">
                  <div className="domain-modal__dns-label">Type</div>
                  <div className="domain-modal__dns-val">TXT</div>
                </div>
                <div className="domain-modal__dns-row">
                  <div className="domain-modal__dns-label">Host</div>
                  <div className="domain-modal__dns-val domain-modal__dns-val--mono">
                    <span>{dnsHost}</span>
                    <Tooltip label="Copy host">
                      <button
                        className="domain-modal__copy-btn"
                        onClick={() => handleCopy(dnsHost, "host")}
                        aria-label="Copy host"
                        type="button"
                      >
                        {copied === "host" ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <div className="domain-modal__dns-row domain-modal__dns-row--last">
                  <div className="domain-modal__dns-label">Value</div>
                  <div className="domain-modal__dns-val domain-modal__dns-val--mono">
                    <span className="domain-modal__dns-val-break">{dnsValue}</span>
                    <Tooltip label="Copy value">
                      <button
                        className="domain-modal__copy-btn"
                        onClick={() => handleCopy(dnsValue, "value")}
                        aria-label="Copy value"
                        type="button"
                      >
                        {copied === "value" ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>

              <div className="domain-modal__info-box">
                <AlertCircle size={14} className="domain-modal__info-icon" />
                <p>DNS changes can take a few minutes to propagate. If verification fails, wait a moment and try again.</p>
              </div>

              <div className="domain-modal__actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("enter-domain")}
                  type="button"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => { setVerifyError(null); setStep("verify"); }}
                  type="button"
                >
                  I&apos;ve added the DNS record
                </Button>
              </div>
            </>
          )}

          {step === "verify" && (
            <>
              {isSuccess ? (
                <div className="domain-modal__success">
                  <CheckCircle2 size={40} className="domain-modal__success-icon" />
                  <h3 className="domain-modal__success-title">Domain verified!</h3>
                  <p className="domain-modal__success-desc">
                    Your username is now <strong>@{domain}</strong>. The page will reload momentarily.
                  </p>
                </div>
              ) : (
                <>
                  <p className="domain-modal__desc">
                    We&apos;ll check that <strong>{domain}</strong> has the correct DNS record pointing to your identity.
                  </p>

                  <div className="domain-modal__verify-summary">
                    <div className="domain-modal__verify-row">
                      <span className="domain-modal__verify-label">Domain</span>
                      <span className="domain-modal__verify-value">{domain}</span>
                    </div>
                    <div className="domain-modal__verify-row">
                      <span className="domain-modal__verify-label">DNS record</span>
                      <span className="domain-modal__verify-value domain-modal__verify-value--mono">{dnsHost}</span>
                    </div>
                  </div>

                  {verifyError && (
                    <div className="domain-modal__error" role="alert">
                      <AlertCircle size={14} />
                      <p>{verifyError}</p>
                    </div>
                  )}

                  <div className="domain-modal__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setVerifyError(null); setStep("dns-setup"); }}
                      type="button"
                      disabled={isVerifying}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleVerify}
                      loading={isVerifying}
                      disabled={isVerifying}
                      type="button"
                    >
                      {isVerifying ? "Verifying…" : "Verify DNS record"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
    </AppDialog>
  );
}
