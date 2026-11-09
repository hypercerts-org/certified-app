"use client";

import { Button, Dialog, Text, Textarea } from "@hypercerts-org/ui-react";
import { useState } from "react";

// Shows a copyable <iframe> snippet for a tile that has an embed page. The
// snippet uses the origin the visitor is on, so it works the same on
// localhost, a preview deployment or production. It is built when the dialog
// opens, never during render, so server and client markup always match.
export function EmbedButton({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const snippet = url
    ? `<iframe src="${url}" title="${title} on Certified" width="100%" height="520" style="border: 0" loading="lazy"></iframe>`
    : null;

  function open() {
    setUrl(new URL(path, window.location.origin).href);
    setCopied(false);
  }

  function copy() {
    // Without a secure context there is no Clipboard API; the code can still
    // be copied from the field, which selects itself on focus.
    if (snippet)
      navigator.clipboard?.writeText(snippet).then(
        () => setCopied(true),
        () => {},
      );
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={open}>
        Embed
      </Button>
      <Dialog
        open={snippet !== null}
        onClose={() => setUrl(null)}
        title={`Embed ${title}`}
        description="Paste this code into any web page to show this tile there."
        footer={
          <Button variant="primary" onClick={copy}>
            {copied ? "Copied" : "Copy code"}
          </Button>
        }
      >
        <div className="stack">
          <Textarea
            readOnly
            rows={4}
            value={snippet ?? ""}
            aria-label="Embed code"
            className="embed-code"
            onFocus={(event) => event.currentTarget.select()}
          />
          {url && (
            <Text size="body-sm" tone="muted">
              <a href={url} target="_blank" rel="noopener">
                Preview the embed
              </a>
            </Text>
          )}
        </div>
      </Dialog>
    </>
  );
}
