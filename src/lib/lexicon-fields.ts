// Form fields from lexicon schemas. A form validates each field with the
// field's own schema from @hypercerts-org/lexicon (the same schema the SDK
// checks the record with) and reads its limits from it, so the form follows
// the lexicon and never keeps a copy of its rules. Usable on the server and
// in the browser.

import type { l } from "@atproto/lex";

/** The parts of an @atproto/lex schema read here. */
export type LexSchema = {
  type: string;
  options?: Record<string, unknown>;
  /** An optional field's own schema (OptionalSchema). */
  validator?: LexSchema;
  /** Another wrapper's own schema (WrappedValidator). */
  unwrap?: () => LexSchema;
  "~standard": {
    validate(
      value: unknown,
    ): { issues?: readonly LexIssue[] } | Promise<{ issues?: readonly LexIssue[] }>;
  };
};

type LexIssue = {
  code: string;
  message: string;
  path?: readonly PropertyKey[];
  type?: string;
  format?: string;
  maximum?: number;
  minimum?: number;
};

/** The schema inside an optional field's. */
function unwrap(schema: LexSchema): LexSchema {
  const inner = schema.type === "optional" ? schema.validator : schema.unwrap?.();
  return inner ? unwrap(inner) : schema;
}

/**
 * The schema of field `key` of an object schema (a record's, or an object
 * definition's). The generated lexicon types describe these schemas only as
 * validators; their fields are there at runtime, and a missing one throws.
 */
export function fieldOf<T>(schema: l.Validator<T>, key: Extract<keyof T, string>): LexSchema {
  const field = (schema as { shape?: Record<string, LexSchema> }).shape?.[key];
  if (!field) throw new Error(`The lexicon schema has no field ${key}`);
  return field;
}

/**
 * A text field's limit, in what its schema counts: graphemes (what a reader
 * sees as one character) when it has `maxGraphemes`, else UTF-8 bytes.
 */
export function textLimit(schema: LexSchema): { max: number; unit: "graphemes" | "bytes" } | null {
  const { maxGraphemes, maxLength } = unwrap(schema).options ?? {};
  if (typeof maxGraphemes === "number") return { max: maxGraphemes, unit: "graphemes" };
  if (typeof maxLength === "number") return { max: maxLength, unit: "bytes" };
  return null;
}

/** A blob field's accepted media types and largest size in bytes. */
export function blobLimits(schema: LexSchema): { accept: string[]; maxSize: number | null } {
  const { accept, maxSize } = unwrap(schema).options ?? {};
  return {
    accept: Array.isArray(accept) ? accept.filter((t): t is string => typeof t === "string") : [],
    maxSize: typeof maxSize === "number" ? maxSize : null,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** What a lexicon issue means, in words a person filling in the form can act on. */
function describe(issue: LexIssue): string {
  switch (issue.code) {
    case "too_big":
      // Limits in bytes are not something people count; graphemes are.
      return issue.type === "string" && issue.maximum !== undefined
        ? "This is too long."
        : `Use at most ${plural(issue.maximum ?? 0, "item")}.`;
    case "too_small":
      return "This is too short.";
    case "invalid_format":
      return issue.format === "datetime" ? "Enter a valid date." : "This isn't in a valid format.";
    case "invalid_type":
      return "This is required.";
    default:
      return "This isn't valid.";
  }
}

/**
 * A TanStack Form validator from a lexicon field schema: undefined when the
 * value is valid, otherwise what is wrong with it. Empty optional fields are
 * left to the form, which leaves them out of the record.
 */
export function lexiconValidator(schema: LexSchema) {
  const inner = unwrap(schema);
  return ({ value }: { value: unknown }): string | undefined => {
    if (value === "" && inner !== schema) return undefined;
    const result = inner["~standard"].validate(value);
    // The lexicon's validators are synchronous; a promise would be a different library.
    if (result instanceof Promise) throw new Error("Expected a synchronous lexicon validator");
    const [issue] = result.issues ?? [];
    if (!issue) return undefined;
    const limit = textLimit(inner);
    if (issue.code === "too_big" && limit?.unit === "graphemes") {
      return `Use at most ${plural(limit.max, "character")}.`;
    }
    return describe(issue);
  };
}
