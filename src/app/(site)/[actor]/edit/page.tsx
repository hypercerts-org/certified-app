import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { SignOutForm } from "@/components/sign-out-form";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { editableRepository, getProfile } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";

export const metadata: Metadata = { title: "Edit profile" };

function Unavailable() {
  return (
    <Text tone="muted">This profile can't be loaded right now. Please try again shortly.</Text>
  );
}

async function Editor({ params }: Pick<PageProps<"/[actor]/edit">, "params">) {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  const here = `/${did}/edit`;
  const user = await getUser();
  if (!user) redirect(`/sign-in?returnTo=${encodeURIComponent(here)}`);

  let session: Awaited<ReturnType<typeof readOAuthSession>>;
  try {
    session = await readOAuthSession();
  } catch (err) {
    if (err instanceof SessionUnavailableError) return <Unavailable />;
    throw err;
  }
  if (session === null || session === "expired") {
    return (
      <div className="stack">
        <Text>Your sign-in has expired. Sign in again to edit this profile.</Text>
        <SignOutForm next={`/sign-in?returnTo=${encodeURIComponent(here)}`}>
          Sign in again
        </SignOutForm>
      </div>
    );
  }

  // The PDS's copy, not the index's: the form must start from the current version.
  let current: Awaited<ReturnType<typeof getProfile>>;
  try {
    const repository = await editableRepository(session, did);
    if (!repository) {
      return (
        <Text>
          You can't edit this profile. Only its own account and an organization's admins and owners
          can.
        </Text>
      );
    }
    current = await getProfile(repository);
  } catch (err) {
    logError("[profile] read failed", err, { did });
    return <Unavailable />;
  }
  return <ProfileForm did={did} current={current} />;
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
