"use client";

import { useState, useEffect } from "react";
import { Agent } from "@atproto/api";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import ErrorMessage from "@/components/ui/error-message";

interface AccountSettingsProps {
  agent: Agent;
  did: string;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ agent, did: _did }) => {
  const [handle, setHandle] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Handle edit state
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuccess, setHandleSuccess] = useState(false);

  // Password state
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const fetchSession = async () => {
    setLoadingSession(true);
    setSessionError(null);
    try {
      const res = await agent.com.atproto.server.getSession();
      setHandle(res.data.handle);
      setEmail(res.data.email ?? "");
    } catch (err) {
      setSessionError(
        err instanceof Error ? err.message : "Failed to load account info"
      );
    } finally {
      setLoadingSession(false);
    }
  };

  useEffect(() => {
    fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle section handlers
  const handleStartEdit = () => {
    setNewHandle(handle);
    setHandleError(null);
    setHandleSuccess(false);
    setEditingHandle(true);
  };

  const handleCancel = () => {
    setEditingHandle(false);
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
      setHandleError(
        err instanceof Error ? err.message : "Failed to update handle"
      );
    } finally {
      setHandleSaving(false);
    }
  };

  // Password handler
  const handlePasswordReset = async () => {
    if (!email) {
      setPasswordError("No email associated with this account");
      return;
    }
    setPasswordLoading(true);
    setPasswordError(null);
    try {
      await agent.com.atproto.server.requestPasswordReset({ email });
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to send password reset email"
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loadingSession) {
    return null;
  }

  if (sessionError) {
    return (
      <ErrorMessage
        title="Failed to load account info"
        message={sessionError}
        onRetry={fetchSession}
      />
    );
  }

  return (
    <Card>
      <h3 className="text-caption text-gray-400 uppercase tracking-wider mb-4">
        Account
      </h3>

      {/* Username row */}
      <div>
        {editingHandle ? (
          <div>
            <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-2">
              USERNAME
            </h4>
            <Input
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              error={handleError ?? undefined}
            />
            <div className="flex gap-2 mt-2">
              <Button
                variant="primary"
                size="sm"
                loading={handleSaving}
                onClick={handleSave}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={handleSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-caption text-gray-400 uppercase tracking-wider mb-1">
                USERNAME
              </h4>
              <p className="text-body text-gray-700">{handle}</p>
              {handleSuccess && (
                <p className="text-body-sm text-success mt-1">
                  Handle updated successfully
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleStartEdit}>
              Change
            </Button>
          </div>
        )}
      </div>

      {/* Password row */}
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
