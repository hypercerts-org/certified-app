"use client";

import { Banner, CopyableId, Skeleton, Text } from "@hypercerts-org/ui-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  confirmGroupAccountEmail,
  confirmGroupAccountPasswordReset,
  getGroupAccountStatus,
  lockGroupSession,
  readGroupAccountEmail,
  requestGroupAccountEmailConfirmation,
  requestGroupAccountEmailUpdate,
  requestGroupAccountPasswordReset,
  unlockGroupSession,
  updateGroupAccountEmail,
  updateGroupAccountHandle,
} from "@/lib/settings/account-actions";
import { EmailRow } from "./email-row";
import { HandleRow } from "./handle-row";
import { PasswordResetRow } from "./password-reset-row";
import { SettingsAction, SettingsRow } from "./settings-frame";
import { UnlockDialog, useUnlockSession } from "./unlock-session";

/**
 * Admin/owner handle + email rows for a non-self group.
 * Locked: handle is read-only, email is hidden until unlocked with the group's
 * password (short-lived Valkey session on the group's PDS).
 */
export function GroupAccountManager({
  groupDid,
  currentHandle,
  pdsDomain,
}: {
  groupDid: string;
  currentHandle: string | null;
  pdsDomain: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const relock = useCallback(() => {
    setUnlocked(false);
    setEmail(null);
    setEmailError(null);
  }, []);

  const loadEmail = useCallback(async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await readGroupAccountEmail(groupDid);
      if (!res.ok) {
        if (res.locked) {
          relock();
          return;
        }
        setEmailError(res.message);
        return;
      }
      setEmail(res.email);
      setEmailConfirmed(res.emailConfirmed);
    } finally {
      setEmailLoading(false);
    }
  }, [groupDid, relock]);

  useEffect(() => {
    let cancelled = false;
    void getGroupAccountStatus(groupDid).then((res) => {
      if (cancelled) return;
      setChecking(false);
      if (res.ok && res.unlocked) {
        setUnlocked(true);
        void loadEmail();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [groupDid, loadEmail]);

  const unlock = useUnlockSession(
    useCallback((input) => unlockGroupSession(groupDid, input), [groupDid]),
    useCallback(() => {
      setUnlockOpen(false);
      setUnlocked(true);
      void loadEmail();
    }, [loadEmail]),
  );

  const handleLock = async () => {
    setLocking(true);
    try {
      await lockGroupSession(groupDid);
      relock();
      toast("Group account locked");
    } finally {
      setLocking(false);
    }
  };

  if (checking) {
    return (
      <>
        <SettingsRow label="Handle" description="The @handle people use to find this group.">
          <Skeleton variant="line" className="skeleton-heading" />
        </SettingsRow>
        <SettingsRow
          label="Email"
          description="Used to sign in directly to this group's PDS account."
        >
          <Skeleton variant="line" className="skeleton-heading" />
        </SettingsRow>
      </>
    );
  }

  if (!unlocked) {
    return (
      <>
        <SettingsRow
          label="Handle"
          description="The @handle people use to find this group on Certified."
          actions={
            <SettingsAction onClick={() => setUnlockOpen(true)}>Unlock to edit</SettingsAction>
          }
        >
          {currentHandle ? (
            <CopyableId
              value={currentHandle}
              displayValue={`@${currentHandle}`}
              label="Handle"
              wrap
            />
          ) : (
            <Text size="body-sm" tone="muted">
              No handle verified
            </Text>
          )}
        </SettingsRow>

        <SettingsRow
          label="Email"
          description="Used to sign in directly to this group's PDS account and recover its password."
          actions={<SettingsAction onClick={() => setUnlockOpen(true)}>Unlock</SettingsAction>}
        >
          <Text size="body-sm" tone="muted">
            Locked — unlock with the group&apos;s password to view or change
          </Text>
        </SettingsRow>

        <UnlockDialog
          open={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          state={unlock}
          title="Unlock group account"
          description="Enter the group account's own password to edit its handle and sign-in email. It's used once for a short session and isn't stored."
          passwordLabel="Group password"
          passwordHint="This is the recovery password shown when the group was created, not your personal password."
          invalidMessage="That password wasn't accepted for this group. If you don't know it, reset it under Password below using the group's email."
          codeHelper="We emailed a sign-in code to the group's email address."
        />
      </>
    );
  }

  return (
    <>
      <HandleRow
        did={groupDid}
        initialHandle={currentHandle}
        pdsDomain={pdsDomain}
        description="The @handle people use to find this group on Certified."
        onSave={async (next) => {
          const res = await updateGroupAccountHandle(groupDid, next);
          if (!res.ok && res.locked) relock();
          return res;
        }}
      />

      {emailLoading ? (
        <SettingsRow
          label="Email"
          description="Used to sign in directly to this group's PDS account and recover its password."
        >
          <Skeleton variant="line" className="skeleton-heading" />
        </SettingsRow>
      ) : emailError ? (
        <SettingsRow
          label="Email"
          description="Used to sign in directly to this group's PDS account and recover its password."
          actions={<SettingsAction onClick={() => void loadEmail()}>Try again</SettingsAction>}
        >
          <Banner tone="danger">{emailError}</Banner>
        </SettingsRow>
      ) : (
        <EmailRow
          initialEmail={email}
          initialConfirmed={emailConfirmed}
          description="Used to sign in directly to this group's PDS account and recover its password."
          extraAction={
            <SettingsAction tone="muted" disabled={locking} onClick={() => void handleLock()}>
              Lock
            </SettingsAction>
          }
          callbacks={{
            requestUpdate: () => requestGroupAccountEmailUpdate(groupDid),
            updateEmail: (input) => updateGroupAccountEmail(groupDid, input),
            requestConfirmation: () => requestGroupAccountEmailConfirmation(groupDid),
            confirmEmail: (input) => confirmGroupAccountEmail(groupDid, input),
            onLocked: relock,
          }}
        />
      )}
    </>
  );
}

/** Admin/owner password reset row for a non-self group. */
export function GroupPasswordResetRow({ groupDid }: { groupDid: string }) {
  return (
    <PasswordResetRow
      email={null}
      description="Reset the group's PDS password with a code sent to its sign-in email."
      actionLabel="Reset"
      emailLabel="Group email"
      emailDescription="Enter the group's own email address, not your personal email."
      emailPlaceholder="team@example.org"
      invalidEmailMessage="Enter a valid email address for this group."
      sendCodeLabel="Send reset code"
      missingCodeMessage="Enter the code sent to the group's email."
      submitLabel="Reset password"
      doneMessage="The group's password has been reset."
      toastMessage="Group password reset"
      onRequest={(addr) => requestGroupAccountPasswordReset(groupDid, addr)}
      onConfirm={(input) => confirmGroupAccountPasswordReset(groupDid, input)}
    />
  );
}
