"use client";

// Settings → Account → App passwords: one row under Password. Some apps that
// work with a Certified account (the Bluesky app, other AT Protocol apps,
// scripts) sign in with a handle and a password. An app password is one made
// for that app alone: the user's own password stays private, the app can't
// change the account's sign-in details, and revoking it signs out that app
// only. The row opens inline, like Email and Password; managing them asks for
// the account's password first (a short PDS session, closed again on Done).

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
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type AppPasswordInfo,
  type CreatedAppPassword,
  createPersonalAppPassword,
  listPersonalAppPasswords,
  lockPersonalSession,
  revokePersonalAppPassword,
  unlockPersonalSession,
} from "@/lib/settings-actions";
import { SettingsAction, SettingsRow } from "./settings-frame";
import { UnlockDialog, useUnlockSession } from "./unlock-session";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

const DESCRIPTION =
  "For other apps that ask for your password, like the Bluesky app. Each app gets its own, which you can revoke at any time.";

const countLabel = (n: number) =>
  n === 0 ? "None yet" : n === 1 ? "1 app password" : `${n} app passwords`;

/** The App passwords row: closed, a count when known; open, create and revoke. */
export function AppPasswordsRow() {
  // Whether the session to manage them is open (null: not checked yet).
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [items, setItems] = useState<AppPasswordInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAppPassword | null>(null);

  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [closing, setClosing] = useState(false);

  const goLocked = useCallback(() => {
    setUnlocked(false);
    setOpen(false);
    setItems(null);
    setCreated(null);
    setLoadError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await listPersonalAppPasswords();
    if (!res.ok) {
      if (res.locked) {
        goLocked();
        return;
      }
      setUnlocked(true);
      setLoadError(res.message);
      return;
    }
    setItems(res.passwords);
    setUnlocked(true);
  }, [goLocked]);

  // A session still open from before shows the count at once.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlock = useUnlockSession(unlockPersonalSession, () => {
    setUnlockOpen(false);
    setOpen(true);
    void refresh();
  });

  const manage = () => {
    if (unlocked) {
      setOpen(true);
      void refresh();
    } else {
      setUnlockOpen(true);
    }
  };

  // Done closes the row and the session it opened.
  const done = async () => {
    setClosing(true);
    try {
      await lockPersonalSession();
      setOpen(false);
      setUnlocked(false);
      setCreated(null);
      setName("");
      setCreateError(null);
    } finally {
      setClosing(false);
    }
  };

  const create = async () => {
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
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (pwName: string) => {
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

  return (
    <>
      <SettingsRow
        label="App passwords"
        description={DESCRIPTION}
        actions={
          open ? (
            <SettingsAction disabled={closing} onClick={() => void done()}>
              Done
            </SettingsAction>
          ) : (
            <SettingsAction disabled={unlocked === null} onClick={manage}>
              Manage
            </SettingsAction>
          )
        }
      >
        {!open ? (
          unlocked === null ? (
            <Skeleton variant="line" />
          ) : (
            <Text size="body-sm" tone="muted">
              {items ? countLabel(items.length) : "Confirm your password to see them."}
            </Text>
          )
        ) : (
          <div className="stack">
            <form
              className="settings-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <Field
                label="New app password"
                description="Name it after the app you'll use it in, so you know which one to revoke later."
              >
                {(field) => (
                  <Input
                    {...field}
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Bluesky on my phone"
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
                  Create password
                </Button>
              </div>
            </form>

            {created && (
              <Banner tone="warning">
                <div className="stack">
                  <Text size="body-sm" tone="ink">
                    Copy this password into <strong>{created.name}</strong> now, where it asks for
                    your password. It won&apos;t be shown again.
                  </Text>
                  <CopyableId value={created.password} label={`App password for ${created.name}`} />
                </div>
              </Banner>
            )}

            {loadError ? (
              <div className="stack">
                <Banner tone="danger">{loadError}</Banner>
                <SettingsAction onClick={() => void refresh()}>Try again</SettingsAction>
              </div>
            ) : items === null ? (
              <Skeleton variant="text" lines={2} />
            ) : (
              items.length > 0 && (
                <ul className="divided settings-list" aria-label="Your app passwords">
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
              )
            )}
          </div>
        )}
      </SettingsRow>

      <UnlockDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        state={unlock}
        title="Confirm your password"
        description="To see and change your app passwords, confirm your own Certified password first. It's used once and not stored."
      />

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
              onClick={() => confirmRevoke && void revoke(confirmRevoke)}
            >
              Revoke
            </Button>
          </>
        }
      >
        <Text>
          The app using this password is signed out at once and can&apos;t sign in with it again.
        </Text>
      </ResponsiveDialog>
    </>
  );
}
