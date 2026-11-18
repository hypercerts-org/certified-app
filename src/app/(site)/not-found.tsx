import { Button, Text } from "@hypercerts-org/ui-react";
import { PageTitle } from "@/components/page-title";

/** An unknown account, project or page, inside the site's navigation. */
export default function NotFound() {
  return (
    <div className="page stack">
      <PageTitle>Not found</PageTitle>
      <Text tone="muted">
        There's no account or page at this address. Check the handle, or look for it in Explore.
      </Text>
      <div>
        <Button href="/explore" variant="secondary">
          Explore
        </Button>
      </div>
    </div>
  );
}
