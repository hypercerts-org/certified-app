// An image field's value, as a form holds it and an action receives it: a new
// file, the record's current picture kept as it is, or none. Editing starts
// from the current picture; a new record starts from none.

/** The current picture, kept: its URL, to show it. */
export type KeptImage = { kept: string };

/** A File in the browser, which may reach the server as a plain Blob. */
export type ImageChoice = Blob | KeptImage | null;

export const isKept = (value: unknown): value is KeptImage =>
  typeof value === "object" &&
  value !== null &&
  !(value instanceof Blob) &&
  typeof (value as KeptImage).kept === "string";

/** Whether `value` has the shape of an ImageChoice (it comes from the browser). */
export const isImageChoice = (value: unknown): value is ImageChoice =>
  value === null || value instanceof Blob || isKept(value);

/** What is wrong with a newly chosen picture under `limits`, or undefined (a kept one is fine). */
export function imageProblem(
  value: ImageChoice,
  limits: { accept: string[]; maxSize: number | null },
): string | undefined {
  if (!(value instanceof Blob)) return undefined;
  if (limits.accept.length > 0 && !limits.accept.includes(value.type)) {
    return "Use a JPEG, PNG or WebP image.";
  }
  if (limits.maxSize !== null && value.size > limits.maxSize) return "The image is too large.";
  return undefined;
}
