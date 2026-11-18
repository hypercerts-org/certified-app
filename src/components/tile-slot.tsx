"use client";

import { Banner, Button } from "@hypercerts-org/ui-react";
import { catchError, type ErrorInfo } from "next/error";
import { type ReactNode, Suspense } from "react";
import { Tile, TileSkeleton } from "./tile";

function TileError({ title }: { title: string }, { retry }: ErrorInfo) {
  return (
    <Tile title={title}>
      {/* A section's failure is a Banner: ErrorMessage is a field's, and
          its alert would interrupt a screen reader as the tile streams in. */}
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        This couldn't be loaded right now.
      </Banner>
    </Tile>
  );
}

const TileBoundary = catchError(TileError);

/** Where a page places a tile: a skeleton while it loads, and its own error
 *  state if it fails, so neither holds up the rest of the page. */
export function TileSlot({ title, children }: { title: string; children: ReactNode }) {
  return (
    <TileBoundary title={title}>
      <Suspense fallback={<TileSkeleton title={title} />}>{children}</Suspense>
    </TileBoundary>
  );
}
