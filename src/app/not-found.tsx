import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";

// Note: Next.js does not support metadata exports in not-found.tsx.
// 404 pages are not indexed by search engines by default.

export default function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you're looking for doesn't exist."
      headingLevel={1}
    >
      <Button variant="secondary" size="sm" href="/">
        Go home
      </Button>
    </EmptyState>
  );
}
