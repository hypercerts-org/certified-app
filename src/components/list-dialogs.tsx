"use client";

// Managing a list, in the workspace: create one, edit its details, add items
// (one or many, pasted), delete it. Each opens a dialog that asks what it
// needs; saving comes with the Hypercerts SDK's writes, so until then the
// dialog's own action is a placeholder (disabled, and says so).

import {
  Button,
  Field,
  Input,
  ResponsiveDialog,
  SegmentedControl,
  Text,
  Textarea,
} from "@hypercerts-org/ui-react";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ComingSoonButton } from "@/components/coming-soon";
import { LIST_KINDS } from "@/components/workspace-lists";

/** A dialog's two buttons: Cancel, and its action (a placeholder for now). */
function Footer({ onCancel, action }: { onCancel: () => void; action: ReactNode }) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      {action}
    </>
  );
}

/** A button that opens a dialog. */
function Opener({
  icon,
  label,
  primary = false,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  primary?: boolean;
  onOpen: () => void;
}) {
  return (
    <Button variant={primary ? "primary" : "secondary"} size="sm" onClick={onOpen}>
      {icon}
      {label}
    </Button>
  );
}

/** A list's name and description, as the create and edit dialogs ask them. */
function DetailsFields({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="stack">
      <Field label="Name">
        {(field) => <Input {...field} name="title" defaultValue={title} maxLength={256} required />}
      </Field>
      <Field label="Description" description="Optional. Shown under the name on the profile.">
        {(field) => <Textarea {...field} name="description" defaultValue={description} rows={4} />}
      </Field>
    </div>
  );
}

/** "New list": what it holds, then its name and description. */
export function NewListDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(LIST_KINDS[0].label);
  const close = () => setOpen(false);
  return (
    <>
      <Opener icon={<Plus size={16} aria-hidden />} label="New list" onOpen={() => setOpen(true)} />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="New list"
        description="A list gathers items to show together on the profile. Add items once it exists."
        footer={
          <Footer
            onCancel={close}
            action={<ComingSoonButton variant="primary">Create list</ComingSoonButton>}
          />
        }
      >
        <div className="stack">
          <SegmentedControl
            label="What the list holds"
            options={LIST_KINDS.map((k) => ({ value: k.label, label: k.label }))}
            value={kind}
            onChange={(next) => setKind(next as typeof kind)}
          />
          <DetailsFields />
        </div>
      </ResponsiveDialog>
    </>
  );
}

/** "Edit details": the list's name and description, as they are. */
export function EditListDialog({ title, description }: { title: string; description: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Opener
        icon={<Pencil size={16} aria-hidden />}
        label="Edit details"
        onOpen={() => setOpen(true)}
      />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Edit details"
        footer={
          <Footer
            onCancel={close}
            action={<ComingSoonButton variant="primary">Save</ComingSoonButton>}
          />
        }
      >
        <DetailsFields title={title} description={description} />
      </ResponsiveDialog>
    </>
  );
}

/** One entry per line: what the add dialog takes. Counted as you paste. */
const lines = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean);

/** "Add items": one or many, pasted one per line. */
export function AddItemsDialog({ noun }: { noun: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const close = () => setOpen(false);
  const count = lines(text).length;
  return (
    <>
      <Opener
        icon={<ListPlus size={16} aria-hidden />}
        label="Add items"
        primary
        onOpen={() => setOpen(true)}
      />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Add items"
        description={`Paste one or many, one per line: links to ${noun === "account" ? "profiles, handles or DIDs" : `${noun}s on Certified, or their record addresses (at://…)`}.`}
        footer={
          <Footer
            onCancel={close}
            action={
              <ComingSoonButton variant="primary">
                {count > 1 ? `Add ${count} items` : "Add"}
              </ComingSoonButton>
            }
          />
        }
      >
        <div className="stack">
          <Field label="Items">
            {(field) => (
              <Textarea
                {...field}
                name="items"
                rows={8}
                value={text}
                onChange={(event) => setText(event.currentTarget.value)}
                placeholder={
                  noun === "account"
                    ? "@hypercerts.org\nhttps://certified.app/maearth.com\ndid:plc:…"
                    : "https://certified.app/…\nat://did:plc:…/…"
                }
              />
            )}
          </Field>
          <Text size="body-sm" tone="muted" aria-live="polite">
            {count === 0
              ? "Nothing pasted yet."
              : `${count} ${count === 1 ? "line" : "lines"} to add.`}
          </Text>
        </div>
      </ResponsiveDialog>
    </>
  );
}

/** "Delete list": says what goes, and that the items themselves stay. */
export function DeleteListDialog({ title, itemCount }: { title: string; itemCount: number }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Opener
        icon={<Trash2 size={16} aria-hidden />}
        label="Delete list"
        onOpen={() => setOpen(true)}
      />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title={`Delete "${title}"?`}
        size="sm"
        footer={
          <Footer
            onCancel={close}
            action={<ComingSoonButton variant="primary">Delete list</ComingSoonButton>}
          />
        }
      >
        <Text>
          The list and its {itemCount === 1 ? "one item" : `${itemCount} items`} leave the profile.
          The accounts and records it lists aren't touched. This can't be undone.
        </Text>
      </ResponsiveDialog>
    </>
  );
}
