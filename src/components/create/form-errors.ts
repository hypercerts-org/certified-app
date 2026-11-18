/**
 * Shared pieces of the create and edit forms' one validation rule
 * (DESIGN.md §9.2): a field's error shows once it has been left (blur)
 * or after a save attempt, then follows the typing live; Save is disabled
 * only while saving; a click with problems lists them in the action bar
 * and focuses the first field that needs attention.
 */

/** "Before publishing: the title needs at least 5 characters; …." */
export function problemsMessage(lead: string, unmet: readonly string[]): string {
  return `${lead}: ${unmet.join("; ")}.`
}

/**
 * Focus the first field marked invalid inside `root`, after the render
 * that marks it (a save attempt reveals every error at once). Returns
 * nothing; a form with no invalid field keeps focus where it is.
 */
export function focusFirstInvalid(root: HTMLElement | null): void {
  if (!root) return
  const run = () =>
    root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run)
  else run()
}

/** The words a person uses for the fields a save conflict can name. */
const FIELD_WORDS: Record<string, string> = {
  title: "title",
  shortDescription: "short description",
  description: "description",
  workScope: "work scope",
  startDate: "dates",
  endDate: "dates",
}

/** "the title", "the title and the dates", "the title, the dates and the description". */
function listFields(fields: readonly PropertyKey[]): string | null {
  const words = [
    ...new Set(
      fields.map((f) => (typeof f === "string" ? FIELD_WORDS[f] : undefined)).filter(Boolean),
    ),
  ].map(
    (w) => `the ${w}`,
  )
  if (words.length === 0) return null
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

/**
 * The message for a save that met someone else's newer save. Names the
 * changed fields in plain words (never the record's field names); a
 * reload brings their version in, and the viewer's changes are still on
 * screen to copy until then.
 */
export function saveConflictMessage(
  what: "activity" | "project",
  conflictingFields: readonly PropertyKey[] = [],
): string {
  const fields = listFields(conflictingFields)
  const changed = fields
    ? `Someone else changed ${fields} of this ${what} while you were editing.`
    : `Someone else saved this ${what} while you were editing.`
  return `${changed} Reload the page to see their version, then make your changes again.`
}

// ---------------------------------------------------------------------
// Projects (`/project/new` and the project editor)
// ---------------------------------------------------------------------

// Lexicon caps from `org.hypercerts.collection`: title.maxGraphemes = 80,
// shortDescription.maxGraphemes = 300 (optional). The title minimum is a
// product floor.
export const PROJECT_TITLE_MIN = 5
export const PROJECT_TITLE_MAX = 80
export const PROJECT_SHORT_DESC_MAX = 300

/**
 * What still blocks saving a project, in the words the action bar shows,
 * plus the field to focus first. Counts are graphemes.
 */
export function projectFormProblems(counts: {
  /** Graphemes in the trimmed title. */
  titleTrimmed: number
  /** Graphemes in the title as typed. */
  title: number
  shortDescription: number
}): { unmet: string[]; focus: "title" | "shortDescription" | null } {
  const titleUnder = counts.titleTrimmed < PROJECT_TITLE_MIN
  const titleOver = counts.title > PROJECT_TITLE_MAX
  const shortDescOver = counts.shortDescription > PROJECT_SHORT_DESC_MAX
  const unmet = [
    titleUnder && `the title needs at least ${PROJECT_TITLE_MIN} characters`,
    titleOver && `the title must be ${PROJECT_TITLE_MAX} characters or fewer`,
    shortDescOver &&
      `the short description must be ${PROJECT_SHORT_DESC_MAX} characters or fewer`,
  ].filter((m): m is string => !!m)
  return {
    unmet,
    focus: titleUnder || titleOver ? "title" : shortDescOver ? "shortDescription" : null,
  }
}
