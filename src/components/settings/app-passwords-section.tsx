"use client";

import {
  Banner,
  Button,
  CopyableId,
  Field,
  Input,
  ResponsiveDialog,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Empty } from "@/components/empty";
import {
  type AppPasswordInfo,
  type CreatedAppPassword,
  createPersonalAppPassword,
  listPersonalAppPasswords,
  lockPersonalSession,
  revokePersonalAppPassword,
  unlockPersonalSession,
} from "@/lib/settings-actions";
import { SettingsAction, SettingsGroup, SettingsRow, SettingsRowsSkeleton } from "./settings-frame";
import { UnlockDialog, useUnlockSession } from "./unlock-session";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

/**
 * Create, list and revoke AT Protocol app passwords inside a short-lived
 * elevated PDS password session.
 */
export function AppPasswordsSection() {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [items, setItems] = useState<AppPasswordInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAppPassword | null>(null);

  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [locking, setLocking] = useState(false);

  const goLocked = useCallback(() => {
    setStatus("locked");
    setItems([]);
    setCreated(null);
    setLoadError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listPersonalAppPasswords();
      if (!res.ok) {
        if (res.locked) {
          goLocked();
          return;
        }
        setStatus("unlocked");
        setLoadError(res.message);
        return;
      }
      setItems(res.passwords);
      setStatus("unlocked");
    } finally {
      setLoading(false);
    }
  }, [goLocked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlock = useUnlockSession(unlockPersonalSession, () => {
    setUnlockOpen(false);
    void refresh();
  });

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createPersonalAppPassword(trimmed);
      if (!res.ok) {
        if (res.locked) {
          goLocked();
          return;
        }
        setCreateError(res.message);
        return;
      }
      setCreated(res.created);
      setName("");
      toast(`Created app password "${res.created.name}"`);
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (pwName: string) => {
    setRevoking(true);
    try {
      const res = await revokePersonalAppPassword(pwName);
      if (!res.ok) {
        if (res.locked) {
          setConfirmRevoke(null);
          goLocked();
          return;
        }
        toast.error(res.message);
        return;
      }
      setConfirmRevoke(null);
      if (created?.name === pwName) setCreated(null);
      toast(`Revoked "${pwName}"`);
      await refresh();
    } finally {
      setRevoking(false);
    }
  };

  const handleLock = async () => {
    setLocking(true);
    try {
      await lockPersonalSession();
      goLocked();
      toast("App passwords locked");
    } finally {
      setLocking(false);
    }
  };

  if (status === "checking") {
    return <SettingsRowsSkeleton rows={2} />;
  }

  if (status === "locked") {
    return (
      <>
        <SettingsGroup title="App passwords">
          <SettingsRow
            label="Unlock app passwords"
            description="Confirm your password to view, create, or revoke app passwords."
            actions={<SettingsAction onClick={() => setUnlockOpen(true)}>Unlock</SettingsAction>}
          >
            <Text size="body-sm" tone="muted">
              Locked — sessions close automatically after 10 minutes
            </Text>
          </SettingsRow>
        </SettingsGroup>
        <UnlockDialog
          open={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          state={unlock}
          title="Unlock app passwords"
          description="Confirm your account password to manage app passwords. It's used once to open a short, secure session — it isn't stored."
        />
      </>
    );
  }

  return (
    <>
      <SettingsGroup
        title="App passwords"
        action={
          <SettingsAction tone="muted" disabled={locking} onClick={() => void handleLock()}>
            Lock session
          </SettingsAction>
        }
      >
        <SettingsRow
          label="Add app password"
          description="Give it a name so you remember which app uses it."
        >
          <form
            className="settings-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <Field label="Name">
              {(field) => (
                <Input
                  {...field}
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="e.g. Bluesky CLI"
                  maxLength={100}
                  disabled={creating}
                  required
                />
              )}
            </Field>
            {createError && (
              <Banner tone="danger" role="alert">
                {createError}
              </Banner>
            )}
            <div className="settings-form-actions">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={creating}
                disabled={!name.trim() || creating}
              >
                Create app password
              </Button>
            </div>
          </form>
          {created && (
            <Banner tone="warning">
              <div className="stack">
                <Text size="body-sm" tone="ink">
                  Copy the password for <strong>{created.name}</strong> now — it won&apos;t be shown
                  again.
                </Text>
                <CopyableId value={created.password} label={`App password for ${created.name}`} />
              </div>
            </Banner>
          )}
        </SettingsRow>

        <SettingsRow
          label="Active passwords"
          description="Revoking a password immediately signs out any app using it."
        >
          {loading && items.length === 0 ? (
            <Skeleton variant="text" lines={3} />
          ) : loadError ? (
            <div className="stack">
              <Banner tone="danger">{loadError}</Banner>
              <SettingsAction onClick={() => void refresh()}>Try again</SettingsAction>
            </div>
          ) : items.length === 0 ? (
            <Empty
              icon={KeyRound}
              title="No app passwords yet"
              description="Create one above to let another AT Protocol client sign in."
            />
          ) : (
            <ul className="divided settings-list">
              {items.map((item) => (
                <li key={item.name} className="settings-list-row">
                  <div className="settings-list-row-text">
                    <Text as="span" tone="ink">
                      {item.name}
                    </Text>
                    <Text as="span" size="body-sm" tone="muted">
                      Created {formatDate(item.createdAt)}
                    </Text>
                  </div>
                  <SettingsAction
                    tone="danger"
                    aria-label={`Revoke ${item.name}`}
                    onClick={() => setConfirmRevoke(item.name)}
                  >
                    Revoke
                  </SettingsAction>
                </li>
              ))}
            </ul>
          )}
        </SettingsRow>
      </SettingsGroup>

      <ResponsiveDialog
        open={confirmRevoke !== null}
        onClose={() => !revoking && setConfirmRevoke(null)}
        title={confirmRevoke ? `Revoke "${confirmRevoke}"?` : "Revoke app password?"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={revoking} onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={revoking}
              onClick={() => confirmRevoke && void handleRevoke(confirmRevoke)}
            >
              Revoke
            </Button>
          </>
        }
      >
        <Text>
          Any app signed in with this password will lose access immediately. This can&apos;t be
          undone.
        </Text>
      </ResponsiveDialog>
    </>
  );
}
