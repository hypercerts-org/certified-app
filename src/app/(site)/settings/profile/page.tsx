import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { SignOutForm } from "@/components/sign-out-form";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { getOwnProfile, profileFields } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";

export const metadata: Metadata = { title: "Edit profile" };

const HERE = "/settings/profile";

function Unavailable() {
  return (
    <Text tone="muted">Your profile can't be loaded right now. Please try again shortly.</Text>
  );
}

async function Editor() {
  const user = await getUser();
  if (!user) redirect(`/sign-in?returnTo=${encodeURIComponent(HERE)}`);

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
        <Text>Your sign-in has expired. Sign in again to edit your profile.</Text>
        <SignOutForm next={`/sign-in?returnTo=${encodeURIComponent(HERE)}`}>
          Sign in again
        </SignOutForm>
      </div>
    );
  }

  // The PDS's copy, not the index's: the form must start from the current version.
  let profile: Awaited<ReturnType<typeof getOwnProfile>>;
  try {
    profile = await getOwnProfile(session);
  } catch (err) {
    logError("[profile] read failed", err);
    return <Unavailable />;
  }
  const current = profile.cid
    ? {
        uri: `at://${user.did}/app.certified.actor.profile/self`,
        cid: profile.cid,
        ...profileFields(profile.value),
      }
    : null;
  return <ProfileForm did={user.did} current={current} />;
}

export default function EditProfilePage() {
  return (
    <div className="page">
      <div className="stack">
        <Heading level={1} size="display-3">
          Edit profile
        </Heading>
        <Text tone="muted">
          Saved to your own account, and signed by certified.app so other apps can see where the
          change was made.
        </Text>
      </div>
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <Editor />
      </Suspense>
    </div>
  );
}
