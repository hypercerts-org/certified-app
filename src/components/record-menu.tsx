"use client";

// The three-dot menu on a published record's page, for whoever may change it
// (the account itself, or an organization's admins and owners): Edit, which
// opens the record's form, and Delete, which asks first. One menu for every
// kind of record (projects, activities; updates and others later): each page
// passes what the record is called and where its form is.
//
// Deleting waits for the Hypercerts SDK (TECH-956): the confirmation opens,
// and its Delete is disabled. When the SDK can delete, the dialog becomes the
// toolkit's ConfirmDialog with the record's delete action.

import {
  Button,
  Menu,
  MenuButton,
  MenuContent,
  MenuItem,
  MenuTrigger,
  ResponsiveDialog,
} from "@hypercerts-org/ui-react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ComingSoonButton } from "@/components/coming-soon";

export function RecordMenu({
  what,
  title,
  editHref,
  consequence,
}: {
  /** What the record is, in lower case: "project", "activity". */
  what: string;
  /** The record's own title, for screen readers and the confirmation. */
  title: string;
  /** Its edit form. */
  editHref: string;
  /** What deleting it does beyond itself ("Its activities stay."), for the confirmation. */
  consequence?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          {/* The full name for screen readers; on hover, a short tooltip. */}
          <MenuButton label={`Actions for ${title}`} tooltip={`Edit or delete this ${what}`} />
        </MenuTrigger>
        <MenuContent label={`Actions for this ${what}`} align="end">
          <MenuItem onClick={() => router.push(editHref)}>
            <Pencil size={16} aria-hidden />
            Edit {what}
          </MenuItem>
          <MenuItem destructive onClick={() => setConfirming(true)}>
            <Trash2 size={16} aria-hidden />
            Delete {what}
          </MenuItem>
        </MenuContent>
      </Menu>
      <ResponsiveDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete this ${what}?`}
        description={
          <>
            “{title}” will be removed from its account's repository, and from the pages that show
            it. This can't be undone.{consequence ? ` ${consequence}` : ""}
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
    </>
  );
}
