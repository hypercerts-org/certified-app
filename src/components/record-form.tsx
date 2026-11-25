"use client";

// What the forms that publish a record share (New activity, New project), on
// TanStack Form's composition API: field components that show a field's label,
// hint and error (once the field has been left, or after Publish, then as you
// type), and the publish flow: Cancel and Publish, a summary of what to fix,
// the server's own field errors, and a warning before a changed draft is lost.
// Publish is never disabled: a click with problems names them and moves to the
// first.

import {
  Banner,
  Button,
  CharacterCount,
  ConfirmDialog,
  DatePicker,
  ErrorMessage,
  Field,
  FileDropzone,
  formatFileSize,
  fromISODate,
  Input,
  Skeleton,
  Textarea,
  toISODate,
} from "@hypercerts-org/ui-react";
import {
  createFormHook,
  createFormHookContexts,
  revalidateLogic,
  useStore,
} from "@tanstack/react-form";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts();

/** The field's message, once it has been left or Publish was pressed. */
function useShownError(): string | undefined {
  const field = useFieldContext<unknown>();
  const form = useFormContext();
  const attempted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const meta = useStore(field.store, (state) => state.meta);
  return meta.isBlurred || attempted
    ? (meta.errors.find(Boolean) as string | undefined)
    : undefined;
}

/** A text field: one line, or several (`rows`), with a counter when it has a `limit`. */
function TextField({
  label,
  description,
  rows,
  limit,
  className,
  inputMode,
}: {
  label: string;
  description?: string;
  /** Several lines. */
  rows?: number;
  /** Characters allowed (graphemes), for the counter. */
  limit?: number;
  className?: string;
  inputMode?: "decimal";
}) {
  const field = useFieldContext<string>();
  const error = useShownError();
  const common = {
    name: field.name,
    value: field.state.value,
    onBlur: field.handleBlur,
  };
  return (
    <Field label={label} description={description} error={error} className={className}>
      {(wiring) => (
        <>
          {rows ? (
            <Textarea
              {...wiring}
              {...common}
              rows={rows}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          ) : (
            <Input
              {...wiring}
              {...common}
              inputMode={inputMode}
              autoComplete="off"
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
          {/* Red by itself when over the limit; other problems are the error's. */}
          {limit !== undefined && <CharacterCount value={field.state.value} max={limit} />}
        </>
      )}
    </Field>
  );
}

/** An image: a drop zone, or the chosen picture with Remove. */
function ImageField({
  label,
  limits,
}: {
  label: string;
  limits: { accept: string[]; maxSize: number | null };
}) {
  const field = useFieldContext<Blob | null>();
  const file = field.state.value;
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const [rejected, setRejected] = useState<string | null>(null);
  const message = useShownError() ?? rejected ?? undefined;
  const choose = (next: Blob | null) => {
    setRejected(null);
    field.handleChange(next);
    field.handleBlur();
  };
  const types = "JPEG, PNG or WebP";

  return (
    <div className="record-form-image">
      <span className="record-form-legend">{label}</span>
      {preview ? (
        <div className="record-form-image-preview">
          {/* biome-ignore lint/performance/noImgElement: a local preview (object URL) */}
          <img src={preview} alt="" />
          <Button
            variant="secondary"
            size="sm"
            className="record-form-image-remove"
            onClick={() => choose(null)}
          >
            <X size={16} aria-hidden />
            Remove
          </Button>
        </div>
      ) : (
        <FileDropzone
          label="Drop an image here, or click to choose one"
          hint={limits.maxSize ? `${types}, up to ${formatFileSize(limits.maxSize)}.` : `${types}.`}
          accept={limits.accept.join(",")}
          maxSize={limits.maxSize ?? undefined}
          onSelect={([chosen]) => chosen && choose(chosen)}
          onReject={([rejection]) =>
            setRejected(
              rejection?.reason === "size" ? "The image is too large." : `Use a ${types} image.`,
            )
          }
        />
      )}
      {message && <ErrorMessage live>{message}</ErrorMessage>}
    </div>
  );
}

/** A date (YYYY-MM-DD, or "" for none), with a way to clear it. */
function DateField({ label }: { label: string }) {
  const field = useFieldContext<string>();
  const error = useShownError();
  const set = (value: string) => {
    field.handleChange(value);
    field.handleBlur();
  };
  return (
    <Field label={label} error={error}>
      {(wiring) => (
        <div className="date-field">
          <DatePicker
            id={wiring.id}
            aria-describedby={wiring["aria-describedby"]}
            invalid={wiring.invalid}
            label={label}
            value={fromISODate(field.state.value)}
            onChange={(date) => set(toISODate(date))}
          />
          {field.state.value && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Clear the ${label.toLowerCase()} date`}
              onClick={() => set("")}
            >
              <X size={16} aria-hidden />
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}

/**
 * The form's foot: what went wrong, if anything, then Cancel and Publish.
 * Cancel asks before a changed draft is discarded, as does closing the tab.
 */
function PublishBar({
  label,
  cancelHref,
  failure,
}: {
  label: string;
  cancelHref: string;
  failure: string | null;
}) {
  const form = useFormContext();
  const router = useRouter();
  const dirty = useStore(form.store, (state) => state.isDirty);
  const submitting = useStore(form.store, (state) => state.isSubmitting);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <>
      {failure && (
        <Banner tone="danger" role="alert">
          {failure}
        </Banner>
      )}
      <div className="form-action-bar">
        <Button
          variant="ghost"
          onClick={() => (dirty ? setConfirmLeave(true) : router.push(cancelHref))}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {label}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmLeave}
        title="Discard this draft?"
        description="It hasn't been published. What you entered will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          form.reset();
          router.push(cancelHref);
        }}
      />
    </>
  );
}

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, ImageField, DateField },
  formComponents: { PublishBar },
});

/** What publishing returns: where the new record is, or what is wrong (by field name). */
export type PublishResult =
  | { ok: true; href: string }
  | { ok: false; message: string; fields?: Record<string, string> };

/**
 * A form that publishes a record: `publish` sends the values to the server;
 * on success the browser goes to the new record's page. `labelOf` names a
 * field (by its form name) in the summary of what to fix; `lost` is the
 * message when the server's answer never arrives.
 */
export function useRecordForm<T extends object>({
  defaultValues,
  publish,
  labelOf,
  lost,
}: {
  defaultValues: T;
  publish: (values: T) => Promise<PublishResult>;
  labelOf: (name: string) => string;
  lost: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const focusFirstProblem = () =>
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );

  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "change", modeAfterSubmission: "change" }),
    onSubmit: async ({ value, formApi }) => {
      setFailure(null);
      const result = await publish(value).catch(
        (): PublishResult => ({ ok: false, message: lost }),
      );
      if (result.ok) {
        // Published: nothing left to lose by leaving.
        formApi.reset();
        router.push(result.href);
        return;
      }
      for (const [name, message] of Object.entries(result.fields ?? {})) {
        formApi.setFieldMeta(name as never, (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: message },
        }));
      }
      setFailure(result.message);
      focusFirstProblem();
    },
    onSubmitInvalid: ({ formApi }) => {
      // Every field's meta has its errors; the generic values type hides that.
      const meta = formApi.state.fieldMeta as Record<string, { errors: unknown[] } | undefined>;
      const names = Object.entries(meta)
        .filter(([, field]) => field && field.errors.length > 0)
        .map(([name]) => labelOf(name));
      setFailure(`Before publishing, check: ${[...new Set(names)].join(", ")}.`);
      focusFirstProblem();
    },
  });

  /** The <form>'s props: its ref, and Publish without a page load. */
  const formProps = {
    ref: formRef,
    noValidate: true,
    onSubmit: (event: React.FormEvent) => {
      event.preventDefault();
      void form.handleSubmit();
    },
  };
  return { form, formProps, failure };
}

/** A record form on its way: its two columns' worth of fields. */
export function RecordFormSkeleton() {
  return (
    <div className="record-form-columns" aria-hidden>
      <div className="stack">
        <Skeleton variant="box" className="skeleton-input" />
        <Skeleton variant="box" className="skeleton-textarea" />
        <Skeleton variant="box" className="skeleton-textarea" />
      </div>
      <div className="stack">
        <Skeleton variant="box" className="skeleton-image" />
        <Skeleton variant="box" className="skeleton-input" />
      </div>
    </div>
  );
}
