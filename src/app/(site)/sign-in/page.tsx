import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/sign-in-form";
import { getUser } from "@/lib/auth/dal";
import { returnPath } from "@/lib/validate";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled.",
  failed: "Sign-in didn't complete. Please try again.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function SignIn({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const returnTo = returnPath(first(params.returnTo));
  if (await getUser()) redirect(returnTo);
  return <SignInForm returnTo={returnTo} error={ERRORS[first(params.error) ?? ""] ?? null} />;
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <div className="page">
      <div className="stack">
        <Heading level={1} size="display-3">
          Sign in
        </Heading>
        <Text tone="muted">
          Sign in to manage your profile and the organizations you belong to.
        </Text>
      </div>
      <Suspense fallback={<Skeleton variant="text" lines={3} />}>
        <SignIn searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
