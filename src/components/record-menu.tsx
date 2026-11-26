"use client";

// A published record's header actions: Share, plus the three-dot menu with
// Add to list, Copy Permanent ID, and (for whoever may change the record: the
// account itself, or an organization's admins and owners) Edit and Delete.
//
// Deleting waits for the Hypercerts SDK (TECH-956): the confirmation opens,
// and its Delete is disabled.

import {
  Button,
  Menu,
  MenuButton,
  MenuContent,
  MenuItem,
  MenuTrigger,
  ResponsiveDialog,
} from "@hypercerts-org/ui-react";
import { Copy, ListPlus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddToListDialog } from "@/components/add-to-list-dialog";
import { ComingSoonButton } from "@/components/coming-soon";
import { LikeButton } from "@/components/like-button";
import { copyToClipboard, ShareButton } from "@/components/profile-actions";
import type { ListKind } from "@/lib/lists";
import { signInHref } from "@/lib/validate";

export function RecordMenu({
  uri,
  path,
  what,
  listKind,
  title,
  actor,
  likeCount = 0,
  likeUri = null,
  editHref,
  consequence,
}: {
  /** Record AT-URI, for Like, Copy Permanent ID and Add to list. */
  uri: string;
  /** Canonical path on this site, for Share and sign-in returnTo. */
  path: string;
  /** What the record is, in lower case: "project", "activity". */
  what: string;
  /** Typed list kind this record fits into (`Projects` or `Activities`). */
  listKind: ListKind["label"];
  /** The record's own title, for screen readers and confirmations. */
  title: string;
  /** The signed-in acting account DID, or null when signed out. */
  actor: string | null;
  /** Indexed number of likes on this record. */
  likeCount?: number;
  /** Acting account's like record AT-URI if already liked, else null. */
  likeUri?: string | null;
  /** Its edit form when the viewer may edit it, else null. */
  editHref: string | null;
  /** What deleting it does beyond itself ("Its activities stay."), for the confirmation. */
  consequence?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const shareWhat = `${what.charAt(0).toUpperCase()}${what.slice(1)} link`;

  return (
    <>
      <LikeButton
        subject={uri}
        path={path}
        actor={actor}
        initialCount={likeCount}
        initialLikeUri={likeUri}
        variant="header"
      />
      <ShareButton path={path} title={title} what={shareWhat} />
      <Menu>
        <MenuTrigger asChild>
          {/* The full name for screen readers; on hover, a short tooltip. */}
          {/* Beside small buttons (Follow, Like, Share), so small too. */}
          <MenuButton label={`More actions for ${title}`} tooltip="More actions" size="sm" />
        </MenuTrigger>
        <MenuContent label={`Actions for this ${what}`} align="end">
          <MenuItem
            onClick={() => {
              if (!actor) {
                router.push(signInHref(path));
                return;
              }
              setListOpen(true);
            }}
          >
            <ListPlus size={16} aria-hidden />
            Add to list
          </MenuItem>
          <MenuItem onClick={() => void copyToClipboard(uri, "Permanent ID")}>
            <Copy size={16} aria-hidden />
            Copy Permanent ID
          </MenuItem>
          {editHref && (
            <>
              <MenuItem onClick={() => router.push(editHref)}>
                <Pencil size={16} aria-hidden />
                Edit {what}
              </MenuItem>
              <MenuItem destructive onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden />
                Delete {what}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      {actor && (
        <AddToListDialog
          open={listOpen}
          onClose={() => setListOpen(false)}
          repo={actor}
          kind={listKind}
          target={uri}
          targetLabel={title}
        />
      )}
      {editHref && (
        <ResponsiveDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title={`Delete this ${what}?`}
          description={
            <>
              “{title}” will be removed from its account&apos;s repository, and from the pages that
              show it. This can&apos;t be undone.{consequence ? ` ${consequence}` : ""}
            </>
          }
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <ComingSoonButton variant="destructive" size="md">
                Delete {what}
              </ComingSoonButton>
            </>
          }
        />
      )}
    </>
  );
}
