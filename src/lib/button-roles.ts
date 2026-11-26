// How the workspace's buttons look, by their role, so every screen agrees and
// a change happens in one place. A section's main action (New project,
// Endorse someone, Create badge, New list) is the screen's one primary
// button, at the right end of its tab bar. An action on a row (Revoke,
// Award, Accept, Reject, Hide) is secondary, whatever it does. Dialogs end
// with a secondary Cancel and a primary (or destructive) confirmation, and an
// empty state never repeats the section's action.

/** A workspace section's main action, in its head. */
export const SECTION_ACTION = { variant: "primary", size: "sm" } as const;

/** An action on one row of a workspace list. */
export const ROW_ACTION = { variant: "secondary", size: "sm" } as const;
