/**
 * Shared type for the inline-edit drafts the profile page owns and the
 * sidebar / overview render. Kept in its own module to avoid a cycle
 * between the page (which imports the sidebar and overview) and the
 * sidebar / overview (which need this type to type their props).
 */
export interface ProfileDrafts {
  displayName: string
  description: string
  website: string
}
