"use client";

// When even the root layout fails: the site's chrome and providers are gone,
// so this page brings its own <html> and plain markup.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1>Something went wrong</h1>
        <p>Certified couldn't be loaded right now. Please try again shortly.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
