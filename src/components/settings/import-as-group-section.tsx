"use client";

import { Banner, Button, ResponsiveDialog, Text } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { NewGroupDialog } from "@/components/group-dialogs";
import { groupSettingsHref } from "@/lib/routes";
import { promotePersonalAccountToGroup } from "@/lib/settings-actions";
import { SettingsCard } from "./settings-frame";
import { UnlockFields, useUnlockSession } from "./unlock-session";

/**
 * Promotes the signed-in personal account into a CGS group (`app.certified.group.import`),
 * or opens the New group dialog to create a separate group alongside it.
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
  const formId = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
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
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      toast(`@${res.handle || handle || did} is now a group`);
      router.push(`${groupSettingsHref(res.groupDid)}/members`);
      router.refresh();
      return { ok: true, status: "ok" };
    }
    return { ok: true, status: res.status, message: res.message };
  });

  return (
    <>
      <SettingsCard
        title="Create a new group"
        description="Want a shared group alongside your personal account? Create a separate group account that teammates can help manage."
        hint="You start as the group's owner and can invite members."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setNewGroupOpen(true)}>
            Create new group
          </Button>
        }
      />

      <SettingsCard
        title="Turn this account into a group"
        description={
          <>
            <strong>{accountLabel}</strong> becomes a group with you as its owner, so teammates can
            help manage it. Its handle, profile and records stay, nothing is deleted, and you can
            turn it back into a regular account later.
          </>
        }
        hint="Your password is used once to authorize the group service and is never stored."
        actions={
          <Button
            type="submit"
            form={formId}
            variant="primary"
            size="sm"
            loading={unlock.submitting}
            disabled={!unlock.canSubmit}
          >
            Turn into a group
          </Button>
        }
      >
        <form
          id={formId}
          className="settings-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!unlock.canSubmit) return;
            if (confirmed) void unlock.submit();
            else setAsking(true);
          }}
        >
          <UnlockFields state={unlock} />
          {promotedError && !unlock.error && (
            <Banner tone="danger" role="alert">
              {promotedError}
            </Banner>
          )}
        </form>
      </SettingsCard>

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
