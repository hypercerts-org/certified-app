"use client";

// Managing a list, in the workspace: create one, edit its details, add items
// (one or many, pasted), delete it. Each opens a dialog backed by
// list-actions.ts (SDK createCollection for new lists; signed writes for
// updates and deletes).

import {
  Banner,
  Button,
  Field,
  Input,
  ResponsiveDialog,
  SegmentedControl,
  Text,
  Textarea,
} from "@hypercerts-org/ui-react";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { LIST_KINDS, type ListKind } from "@/components/workspace-lists";
import * as listActions from "@/lib/hypercerts/list-actions";

/** A dialog's two buttons: Cancel, and its primary/destructive action. */
function Footer({
  onCancel,
  disabled,
  action,
}: {
  onCancel: () => void;
  disabled?: boolean;
  action: ReactNode;
}) {
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={onCancel}>
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

/** "New list": what it holds, then its name and description. */
export function NewListDialog({ repo }: { repo: string }) {
  const formId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ListKind["label"]>(LIST_KINDS[0].label);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setKind(LIST_KINDS[0].label);
    setTitle("");
    setDescription("");
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async () => {
    if (submitting) return;
    if (!title.trim()) {
      setError("Add a name for the list.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await listActions
        .createList(repo, {
          kind,
          title: title.trim(),
          description: description.trim() || undefined,
        })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the list was created. Reload to check.",
        }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
      toast("List created");
      router.push(result.href);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Opener
        icon={<Plus size={16} aria-hidden />}
        label="New list"
        onOpen={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="New list"
        description="A list gathers items to show together on the profile. Add items once it exists."
        footer={
          <Footer
            onCancel={close}
            disabled={submitting}
            action={
              <Button type="submit" form={formId} variant="primary" loading={submitting}>
                Create list
              </Button>
            }
          />
        }
      >
        <form
          id={formId}
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          <SegmentedControl
            label="What the list holds"
            options={LIST_KINDS.map((k) => ({ value: k.label, label: k.label }))}
            value={kind}
            onChange={(next) => setKind(next as ListKind["label"])}
          />
          <Field label="Name">
            {(field) => (
              <Input
                {...field}
                name="title"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                maxLength={256}
                required
              />
            )}
          </Field>
          <Field label="Description" description="Optional. Shown under the name on the profile.">
            {(field) => (
              <Textarea
                {...field}
                name="description"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                rows={4}
              />
            )}
          </Field>
        </form>
      </ResponsiveDialog>
    </>
  );
}

/** "Edit details": the list's name and description, as they are. */
export function EditListDialog({
  repo,
  rkey,
  title: initialTitle,
  description: initialDescription,
}: {
  repo: string;
  rkey: string;
  title: string;
  description: string;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openDialog = () => {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setError(null);
    setOpen(true);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async () => {
    if (submitting) return;
    if (!title.trim()) {
      setError("Add a name for the list.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await listActions
        .editList(repo, rkey, { title: title.trim(), description: description.trim() })
        .catch(() => ({
          ok: false as const,
          message: "We couldn't confirm whether the changes were saved. Reload to check.",
        }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast("List updated");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Opener icon={<Pencil size={16} aria-hidden />} label="Edit details" onOpen={openDialog} />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Edit details"
        footer={
          <Footer
            onCancel={close}
            disabled={submitting}
            action={
              <Button type="submit" form={formId} variant="primary" loading={submitting}>
                Save
              </Button>
            }
          />
        }
      >
        <form
          id={formId}
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          <Field label="Name">
            {(field) => (
              <Input
                {...field}
                name="title"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                maxLength={256}
                required
              />
            )}
          </Field>
          <Field label="Description" description="Optional. Shown under the name on the profile.">
            {(field) => (
              <Textarea
                {...field}
                name="description"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                rows={4}
              />
            )}
          </Field>
        </form>
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
export function AddItemsDialog({ repo, rkey, noun }: { repo: string; rkey: string; noun: string }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const entries = lines(text);
  const count = entries.length;

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async () => {
    if (submitting) return;
    if (count === 0) {
      setError("Paste at least one item to add.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await listActions.addListItems(repo, rkey, entries).catch(() => ({
        ok: false as const,
        message: "We couldn't confirm whether items were added. Reload to check.",
      }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const parts: string[] = [];
      if (result.added > 0) {
        parts.push(`Added ${result.added} ${result.added === 1 ? "item" : "items"}`);
      }
      if (result.skipped > 0) parts.push(`${result.skipped} already in list`);
      if (result.unresolved.length > 0) parts.push(`${result.unresolved.length} not found`);
      toast(parts.join(" · ") || "No new items added");

      if (result.unresolved.length > 0) {
        // Keep unresolved lines so the user can fix typos without re-pasting.
        setText(result.unresolved.join("\n"));
        setError(
          `Couldn't resolve ${result.unresolved.length === 1 ? "this entry" : "these entries"}. Check and try again.`,
        );
      } else {
        setText("");
        setOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Opener
        icon={<ListPlus size={16} aria-hidden />}
        label="Add items"
        primary
        onOpen={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title="Add items"
        description={`Paste one or many, one per line: links to ${noun === "account" ? "profiles, handles or DIDs" : `${noun}s on Certified, or their record addresses (at://…)`}.`}
        footer={
          <Footer
            onCancel={close}
            disabled={submitting}
            action={
              <Button
                type="submit"
                form={formId}
                variant="primary"
                loading={submitting}
                disabled={count === 0}
              >
                {count > 1 ? `Add ${count} items` : "Add"}
              </Button>
            }
          />
        }
      >
        <form
          id={formId}
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
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
        </form>
      </ResponsiveDialog>
    </>
  );
}

/** "Delete list": says what goes, and that the items themselves stay. */
export function DeleteListDialog({
  repo,
  rkey,
  title,
  itemCount,
}: {
  repo: string;
  rkey: string;
  title: string;
  itemCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await listActions.deleteList(repo, rkey).catch(() => ({
        ok: false as const,
        message: "We couldn't confirm whether the list was deleted. Reload to check.",
      }));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast(`Deleted "${title}"`);
      router.push(result.href);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Opener
        icon={<Trash2 size={16} aria-hidden />}
        label="Delete list"
        onOpen={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ResponsiveDialog
        open={open}
        onClose={close}
        title={`Delete "${title}"?`}
        size="sm"
        footer={
          <Footer
            onCancel={close}
            disabled={submitting}
            action={
              <Button variant="destructive" loading={submitting} onClick={confirm}>
                Delete list
              </Button>
            }
          />
        }
      >
        <div className="stack">
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
          <Text>
            The list and its {itemCount === 1 ? "one item" : `${itemCount} items`} leave the
            profile. The accounts and records it lists aren't touched. This can't be undone.
          </Text>
        </div>
      </ResponsiveDialog>
    </>
  );
}
