import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { SignInAgain } from "@/components/sign-out-form";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { editableRepository, getProfile } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";
import { isDid, signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Edit profile", robots: { index: false } };

async function Editor({ params }: Pick<PageProps<"/[actor]/edit">, "params">) {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  const here = `/${did}/edit`;
  if (!(await getUser())) redirect(signInHref(here));

  try {
    const session = await readOAuthSession();
    if (session === null || session === "expired") {
      return (
        <SignInAgain path={here}>
          Your sign-in has expired. Sign in again to edit this profile.
        </SignInAgain>
      );
    }
    const repository = await editableRepository(session, did);
    if (!repository) {
      return (
        <Text>
          You can't edit this profile. Only the account itself and an organization's admins and
          owners can.
        </Text>
      );
    }
    // The PDS's copy, not the index's: the form must start from the current version.
    return <ProfileForm did={did} current={await getProfile(repository)} />;
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) logError("[profile] read failed", err, { did });
    return (
      <Text tone="muted">This profile can't be loaded right now. Please try again shortly.</Text>
    );
  }
}

export default function EditProfilePage(props: PageProps<"/[actor]/edit">) {
  return (
    <div className="page">
      <div className="stack">
        <Heading level={1} size="display-3">
          Edit profile
        </Heading>
        <Text tone="muted">
          Saved to the account's own repository, and signed by certified.app so other apps can see
          where the change was made.
        </Text>
      </div>
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <Editor params={props.params} />
      </Suspense>
    </div>
  );
}
