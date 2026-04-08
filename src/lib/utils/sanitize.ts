/**
 * Regex matching invisible Unicode characters that can sneak in via clipboard paste.
 * Does NOT include whitespace — use sanitizeEmail/sanitizeHandle for that.
 */
const INVISIBLE_CHARS_RE =
  /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD\u034F\u061C\u180E]/g

/** Strip invisible Unicode characters (preserves whitespace). */
export const stripInvisible = (s: string) =>
  s.replace(INVISIBLE_CHARS_RE, "").trim()

/** Sanitize an email: strip invisible chars + whitespace, lowercase. */
export const sanitizeEmail = (s: string) =>
  s.replace(INVISIBLE_CHARS_RE, "").replace(/\s/g, "").toLowerCase()

/** Sanitize an AT Protocol handle: strip invisible chars + whitespace, remove leading @. */
export const sanitizeHandle = (s: string) =>
  s.replace(INVISIBLE_CHARS_RE, "").replace(/\s/g, "").replace(/^@/, "")
