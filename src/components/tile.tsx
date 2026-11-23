import { Heading } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";

export function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tile">
      <div className="tile-header">
        <Heading level={2} size="heading">
          {title}
        </Heading>
      </div>
      {children}
    </section>
  );
}

/** A tile on its way: its title, and its content's own skeleton. */
export function TileSkeleton({ title, children }: { title: string; children: ReactNode }) {
  return <Tile title={title}>{children}</Tile>;
}
