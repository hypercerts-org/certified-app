import { l } from "@atproto/lex";
import { Banner, Button, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { SignInButton } from "@/components/sign-in-button";
import { getUser } from "@/lib/auth/dal";
import type { SignInError } from "@/lib/auth/start-sign-in";
import { returnPath } from "@/lib/validate";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

// Where pages that need a signed-in visitor send them, and where a sign-in
// that couldn't start or complete comes back to. Signing in itself happens on
// Certified's page, after the button.

const ERRORS: Record<SignInError, string> = {
  denied: "Sign-in was cancelled.",
  failed: "Sign-in didn't complete. Please try again.",
  unavailable: "Sign-in is unavailable right now. Please try again shortly.",
  busy: "Too many sign-in attempts. Please wait a minute and try again.",
  handle: "We couldn't find an account for that handle. Check the spelling and try again.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function SignIn({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const returnTo = returnPath(first(params.returnTo));
  if (await getUser()) redirect(returnTo);
  const error = ERRORS[first(params.error) as SignInError];
  // Handed over from Certified's page with a handle on another server
  // (/oauth/handle-login): continue only when the visitor says so.
  const handle = first(params.handle);
  if (!error && handle && l.isHandleString(handle)) {
    return (
      <form method="post" action="/oauth/handle-login" className="stack">
        <Text>Continue signing in as @{handle}, at its own server.</Text>
        <input type="hidden" name="handle" value={handle} />
        <div>
          <Button type="submit" variant="primary" size="sm">
            Continue as @{handle}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className="stack">
      {error && <Banner tone="danger">{error}</Banner>}
      <SignInButton returnTo={returnTo}>Continue to Certified</SignInButton>
    </div>
  );
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <div className="page">
      <div className="stack">
        <PageTitle>Sign in</PageTitle>
        <Text tone="muted">
          Sign in with your Certified account: an email code, Google, or a handle on Bluesky or any
          other AT Protocol server.
        </Text>
      </div>
      <Suspense fallback={<Skeleton variant="box" className="skeleton-button" />}>
        <SignIn searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
