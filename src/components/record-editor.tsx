// What every page that edits a published record shares: the signed-in user's
// session (or a prompt to sign in again), the account's repository if they
// may edit it (the account itself, or an organization's admins and owners),
// and a message when the record can't be read. The page renders the form
// from the repository's own copy, not the index's: an edit must start from
// the current version.
import type { l } from "@atproto/lex";
import { Text } from "@hypercerts-org/ui-react";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { SignInAgain } from "@/components/sign-out-form";
import { readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { editableRepository, type Repository } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";

/**
 * Renders `children` with account `did`'s repository, once the user may edit
 * it. `here` is the page's path (to come back to after signing in again);
 * `what` names the record in messages ("activity", "project").
 */
export async function RecordEditor({
  did,
  here,
  what,
  children,
}: {
  did: string;
  here: string;
  what: string;
  children: (repository: Repository) => Promise<ReactNode>;
}) {
  try {
    const session = await readOAuthSession();
    if (session === null || session === "expired") {
      return (
        <SignInAgain path={here}>
          Your sign-in has expired. Sign in again to edit this {what}.
        </SignInAgain>
      );
    }
    const repository = await editableRepository(session, did as l.DidString);
    if (!repository) {
      return (
        <Text>
          You can't edit this {what}. Only the account itself and an organization's admins and
          owners can.
        </Text>
      );
    }
    return await children(repository);
  } catch (err) {
    unstable_rethrow(err); // notFound() and Next's other signals pass through
    if (!(err instanceof SessionUnavailableError)) {
      logError(`[edit] ${what} read failed`, err, { did });
    }
    return (
      <Text tone="muted">This {what} can't be loaded right now. Please try again shortly.</Text>
    );
  }
}
