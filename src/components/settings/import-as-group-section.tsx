"use client";

import { Banner, Button, ResponsiveDialog, Text } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NewGroupDialog } from "@/components/group-dialogs";
import { queryKeys } from "@/lib/query-keys";
import { groupSettingsHref } from "@/lib/routes";
import { promotePersonalAccountToGroup } from "@/lib/settings/group-import-action";
import { SettingsAction, SettingsGroup, SettingsRow } from "./settings-frame";
import { UnlockFields, useUnlockSession } from "./unlock-session";

/**
 * Create a new group alongside your personal account, or promote the signed-in
 * account into a CGS group (`app.certified.group.import`).
 */
export function ImportAsGroupSection({
  did,
  handle,
  pdsDomain,
}: {
  did: string;
  handle: string | null;
  pdsDomain: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [promotedError, setPromotedError] = useState<string | null>(null);

  const accountLabel = handle ? `@${handle}` : did;

  const unlock = useUnlockSession(async ({ password, authFactorToken }) => {
    setPromotedError(null);
    const res = await promotePersonalAccountToGroup({ password, authFactorToken });
    if (!res.ok) {
      setPromotedError(res.message);
      return { ok: false, message: res.message };
    }
    if (res.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations });
      toast(`@${res.handle || handle || did} is now a group`);
      router.push(groupSettingsHref(res.groupDid));
      router.refresh();
      return { ok: true, status: "ok" };
    }
    return { ok: true, status: res.status, message: res.message };
  });

  return (
    <>
      <SettingsGroup title="Groups">
        <SettingsRow
          label="Create a new group"
          description="Keep this as your personal account and start a shared group alongside it."
          actions={<SettingsAction onClick={() => setNewGroupOpen(true)}>Create</SettingsAction>}
        >
          <Text size="body-sm" tone="muted">
            You start as the group&apos;s owner and can invite teammates.
          </Text>
        </SettingsRow>

        <SettingsRow
          label="Turn this account into a group"
          description={
            <>
              Convert <strong>{accountLabel}</strong> into a group so several people can manage it.
              Its handle and records stay, and you can turn it back later.
            </>
          }
          actions={
            converting ? null : (
              <SettingsAction
                onClick={() => {
                  setPromotedError(null);
                  setConverting(true);
                }}
              >
                Convert
              </SettingsAction>
            )
          }
        >
          {converting ? (
            <form
              className="settings-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!unlock.canSubmit) return;
                if (confirmed) void unlock.submit();
                else setAsking(true);
              }}
            >
              <UnlockFields
                state={unlock}
                intro="Enter your account password to confirm. It's used once to authorize the group service and is never stored."
              />
              {promotedError && !unlock.error && (
                <Banner tone="danger" role="alert">
                  {promotedError}
                </Banner>
              )}
              <div className="settings-form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={unlock.submitting}
                  disabled={!unlock.canSubmit}
                >
                  Turn into a group
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={unlock.submitting}
                  onClick={() => {
                    unlock.reset();
                    setConverting(false);
                    setConfirmed(false);
                    setPromotedError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Text size="body-sm" tone="muted">
              Personal account
            </Text>
          )}
        </SettingsRow>
      </SettingsGroup>

      <ResponsiveDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={`Turn ${accountLabel} into a group?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAsking(false);
                setConfirmed(true);
                void unlock.submit();
              }}
            >
              Turn into a group
            </Button>
          </>
        }
      >
        <Text>
          This account becomes a group with you as its owner, and you can add people to act for it.
          Its handle, profile and records stay as they are, and you can turn it back into a regular
          account any time from its settings.
        </Text>
      </ResponsiveDialog>

      <NewGroupDialog pdsDomain={pdsDomain} open={newGroupOpen} onOpenChange={setNewGroupOpen} />
    </>
  );
}
