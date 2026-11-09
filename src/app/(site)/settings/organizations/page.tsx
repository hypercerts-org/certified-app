import { Card, EmptyState, Heading, IdentityRow, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { actorHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { listMemberships, type Membership, manages } from "@/lib/cgs";
import { getActor } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";
import { signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Your organizations" };

const HERE = "/settings/organizations";
const ROLE_LABEL: Record<string, string> = { member: "Member", admin: "Admin", owner: "Owner" };

async function OrganizationRow({ membership }: { membership: Membership }) {
  const actor = await getActor(membership.groupDid);
  return (
    <Card as="li" variant="panel" className="card">
      <IdentityRow
        name={actor?.displayName ?? membership.groupDid}
        avatarSrc={actor?.avatarUrl}
        href={actorHref(membership.groupDid)}
        secondary={ROLE_LABEL[membership.role] ?? membership.role}
      />
      {manages(membership) && (
        <Link href={`${actorHref(membership.groupDid)}/edit`}>
          <Text as="span" size="body-sm">
            Edit profile
          </Text>
        </Link>
      )}
    </Card>
  );
}

async function Organizations() {
  if (!(await getUser())) redirect(signInHref(HERE));
  let memberships: Membership[];
  try {
    const session = await readOAuthSession();
    if (session === null || session === "expired") {
      return (
        <SignInAgain path={HERE}>
          Your sign-in has expired. Sign in again to see your organizations.
        </SignInAgain>
      );
    }
    memberships = await listMemberships(session);
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) logError("[cgs] memberships failed", err);
    return (
      <Text tone="muted">
        Your organizations can't be loaded right now. Please try again shortly.
      </Text>
    );
  }
  if (memberships.length === 0)
    return <EmptyState title="You don't belong to any organization yet" />;
  return (
    <ul className="grid">
      {memberships.map((membership) => (
        <OrganizationRow key={membership.groupDid} membership={membership} />
      ))}
    </ul>
  );
}

export default function OrganizationsPage() {
  return (
    <div className="page">
      <div className="stack">
        <Heading level={1} size="display-3">
          Your organizations
        </Heading>
        <Text tone="muted">
          Organizations you belong to on the Certified Group Service. Admins and owners can edit an
          organization's profile here; each change is recorded, with who made it, in the
          organization's audit log.
        </Text>
      </div>
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <Organizations />
      </Suspense>
    </div>
  );
}
