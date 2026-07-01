"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Styles are inlined with raw hex + literal radius on purpose: this is the
  // root error boundary, which renders when the root layout (and thus the
  // CSS-token stylesheet) may have failed to load, so design tokens
  // (var(--radius), --bg-canvas, …) are not reliably available here. The 2px
  // radius mirrors var(--radius).
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#111",
          color: "#eee",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, marginBottom: "1.5rem" }}>An unexpected error occurred.</p>
          {error.digest && (
            <p style={{ fontSize: "0.85rem", opacity: 0.5, marginBottom: "1rem" }}>
              Reference: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1.25rem",
                border: "1px solid #555",
                borderRadius: "2px",
                background: "#222",
                color: "#eee",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders when the root layout itself has failed; the Next.js router may be broken, so a plain <a> with a full document load is the safer fallback than <Link>. */}
            <a
              href="/"
              style={{
                padding: "0.5rem 1.25rem",
                border: "1px solid #555",
                borderRadius: "2px",
                background: "#222",
                color: "#eee",
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
