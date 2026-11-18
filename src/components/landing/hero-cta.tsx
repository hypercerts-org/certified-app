import { Button } from "@hypercerts-org/ui-react";
import Link from "next/link";

/**
 * The hero's ways in. Both buttons start Certified's sign-in, which asks
 * for an email and creates the account when there is none: "Sign in with
 * your email" for those who have one, "Create your account" for those who
 * don't. Plain forms posting to /oauth/sign-in, landing in the workspace.
 * `explore` adds a quieter link to the network, for visitors who want to
 * look around first (the hero passes it, the closing section doesn't).
 */
export default function HeroCta({ explore = false }: { explore?: boolean }) {
  return (
    <div className="lp-hero__actions">
      <form method="post" action="/oauth/sign-in">
        <input type="hidden" name="returnTo" value="/workspace" />
        <Button type="submit" size="lg" className="lp-cta-btn">
          Sign in with your email
        </Button>
      </form>
      <form method="post" action="/oauth/sign-in">
        <input type="hidden" name="returnTo" value="/workspace" />
        <Button type="submit" size="lg" variant="secondary" className="lp-cta-btn">
          Create your account
        </Button>
      </form>
      {explore ? (
        <Link href="/explore" className="lp-link lp-hero__explore">
          Explore the network
        </Link>
      ) : null}
    </div>
  );
}
