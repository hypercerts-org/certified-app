"use client";

import { useState, useEffect } from "react";
import { Agent } from "@atproto/api";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";

interface AccountSettingsProps {
  agent: Agent;
  did: string;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ agent, did }) => {
  const [handle, setHandle] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loadingSession, setLoadingSession] = useState(true);

  // Handle editing state
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuccess, setHandleSuccess] = useState(false);

  // Email editing state
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailToken, setEmailToken] = useState("");
  const [tokenRequired, setTokenRequired] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Password state
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await agent.com.atproto.server.getSession();
        setHandle(res.data.handle);
        setEmail(res.data.email ?? "");
      } catch {
        // Silently fail — the handle just won't show
      } finally {
        setLoadingSession(false);
      }
    };
    fetchSession();
  }, [agent]);

  // Handle editing handlers
  const handleStartEdit = () => {
    setNewHandle(handle);
    setHandleError(null);
    setHandleSuccess(false);
    setEditingHandle(true);
  };

  const handleCancel = () => {
    setEditingHandle(false);
    setNewHandle("");
    setHandleError(null);
  };

  const handleSave = async () => {
    setHandleSaving(true);
    setHandleError(null);
    try {
      await agent.com.atproto.identity.updateHandle({ handle: newHandle });
      setHandle(newHandle);
      setEditingHandle(false);
      setHandleSuccess(true);
      setTimeout(() => setHandleSuccess(false), 3000);
    } catch (err) {
      setHandleError(err instanceof Error ? err.message : "Failed to update handle");
    } finally {
      setHandleSaving(false);
    }
  };

  // Email editing handlers
  const startEmailEdit = () => {
    setNewEmail(email);
    setEmailToken("");
    setTokenRequired(false);
    setEmailError(null);
    setEmailSuccess(false);
    setEditingEmail(true);
  };

  const cancelEmailEdit = () => {
    setEditingEmail(false);
    setNewEmail("");
    setEmailToken("");
    setTokenRequired(false);
    setEmailError(null);
  };

  const saveEmail = async () => {
    setEmailSaving(true);
    setEmailError(null);
    try {
      if (email) {
        // Existing email — request update token first
        if (!tokenRequired) {
          const res = await agent.com.atproto.server.requestEmailUpdate();
          if (res.data.tokenRequired) {
            setTokenRequired(true);
            setEmailSaving(false);
            return;
          }
        }
        // Token not required or already have it
        await agent.com.atproto.server.updateEmail({
          email: newEmail,
          ...(tokenRequired && emailToken ? { token: emailToken } : {}),
        });
      } else {
        // No current email — add directly
        await agent.com.atproto.server.updateEmail({ email: newEmail });
      }
      setEmail(newEmail);
      setEditingEmail(false);
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setEmailSaving(false);
    }
  };

  // Password reset handler
  const handlePasswordReset = async () => {
    if (!email) {
      setPasswordError(
        "No email associated with this account. Set an email first to enable password reset."
      );
      return;
    }
    setPasswordLoading(true);
    setPasswordError(null);
    try {
      await agent.com.atproto.server.requestPasswordReset({ email });
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to send password reset email");
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loadingSession || !handle) return null;

  return (
    <Card>
      <h3 className="text-caption text-gray-400 uppercase tracking-wider mb-4">
        Account
      </h3>

      {/* Row 1: USERNAME */}
      <div>
        {!editingHandle ? (
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">USERNAME</h4>
              <p className="text-body text-gray-700">{handle}</p>
              {handleError && (
                <p className="text-body-sm text-error mt-1">{handleError}</p>
              )}
              {handleSuccess && (
                <p className="text-body-sm text-success mt-1">Handle updated successfully.</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleStartEdit}>
              Change
            </Button>
          </div>
        ) : (
          <div>
            <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">USERNAME</h4>
            <Input
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="Enter new handle"
            />
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

      {/* Row 2: DID */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">DID</h4>
        <p className="text-body-sm text-gray-400 font-mono break-all">{did}</p>
      </div>

      {/* Row 3: EMAIL */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        {!editingEmail ? (
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">EMAIL</h4>
              <p className="text-body text-gray-700">
                {email || <span className="text-gray-400 italic">No email set</span>}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={startEmailEdit}>
              {email ? "Change" : "Add"}
            </Button>
          </div>
        ) : (
          <div>
            <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">EMAIL</h4>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Enter new email"
            />
            {tokenRequired && (
              <div className="mt-3">
                <p className="text-body-sm text-gray-500 mb-2">
                  A confirmation code was sent to your current email. Enter it below to confirm the change.
                </p>
                <Input
                  type="text"
                  value={emailToken}
                  onChange={(e) => setEmailToken(e.target.value)}
                  placeholder="Confirmation code"
                />
              </div>
            )}
            {emailError && (
              <p className="text-body-sm text-red-600 mt-2">{emailError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={saveEmail} disabled={emailSaving}>
                {emailSaving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEmailEdit} disabled={emailSaving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {emailSuccess && (
          <p className="text-body-sm text-green-600 mt-2">Email updated successfully.</p>
        )}
      </div>

      {/* Row 4: PASSWORD */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">
              PASSWORD
            </h4>
            <p className="text-body text-gray-700">••••••••</p>
            {passwordError && (
              <p className="text-body-sm text-error mt-1">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-body-sm text-success mt-1">
                Reset email sent — check your inbox
              </p>
            )}
          </div>
          {!passwordSuccess && (
            <Button
              variant="ghost"
              size="sm"
              loading={passwordLoading}
              onClick={handlePasswordReset}
            >
              Change password
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default AccountSettings;
