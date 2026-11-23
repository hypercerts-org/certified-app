// Rules the publishing forms share beyond the lexicon's (New activity, New
// project), used by the forms and by the actions that publish them.

/** A title needs at least this many characters: a product floor, as on staging. */
export const TITLE_MIN = 5;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Characters as a reader counts them: an emoji or an accented letter is one. */
export function characters(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

/**
 * What is wrong with a title: too short (the product floor), or what its
 * lexicon check (`check`) says. Undefined when it is fine.
 */
export function titleProblem(
  title: string,
  check: (input: { value: unknown }) => string | undefined,
): string | undefined {
  const trimmed = title.trim();
  return characters(trimmed) < TITLE_MIN
    ? `Use at least ${TITLE_MIN} characters.`
    : check({ value: trimmed });
}
