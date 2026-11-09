import { Eyebrow, Skeleton } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";
import { EmbedButton } from "./embed-button";

// A tile with an embed page passes its path, and gets an Embed button that
// hands out the <iframe> code for it.
export function Tile({
  title,
  embedPath,
  children,
}: {
  title: string;
  embedPath?: string;
  children: ReactNode;
}) {
  return (
    <section className="tile">
      <div className="tile-header">
        <Eyebrow as="p">{title}</Eyebrow>
        {embedPath && <EmbedButton path={embedPath} title={title} />}
      </div>
      {children}
    </section>
  );
}

export function TileSkeleton({ title }: { title: string }) {
  return (
    <Tile title={title}>
      <Skeleton variant="text" lines={3} />
    </Tile>
  );
}
