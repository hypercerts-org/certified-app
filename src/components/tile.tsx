import { Heading } from "@hypercerts-org/ui-react";
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
        <Heading level={2} size="heading">
          {title}
        </Heading>
        {embedPath && <EmbedButton path={embedPath} title={title} />}
      </div>
      {children}
    </section>
  );
}

/** A tile on its way: its title, and its content's own skeleton. */
export function TileSkeleton({ title, children }: { title: string; children: ReactNode }) {
  return <Tile title={title}>{children}</Tile>;
}
