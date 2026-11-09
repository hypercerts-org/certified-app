import { Avatar, Button, Text } from "@hypercerts-org/ui-react";
import Link from "next/link";
import { actorHref } from "@/components/cards";
import { SignInLink } from "@/components/sign-in-link";
import { signOut } from "@/lib/auth/actions";
import { getUser } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";

// The header's account area. Reads the session cookie, so the site layout
// renders it behind a Suspense boundary and pages keep their cached shell.
export async function UserMenu() {
  const user = await getUser();
  if (!user) return <SignInLink />;

  // An account that has never written a Certified profile has no API view.
  const actor = await getActor(user.did);
  const name = actor?.displayName ?? user.did;
  return (
    <div className="user-menu">
      <Link href={actorHref(user.did)} className="user-menu-account">
        <Avatar name={name} src={actor?.avatarUrl} size="sm" />
        <Text as="span" size="body-sm" tone="ink" className="user-menu-name">
          {name}
        </Text>
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
