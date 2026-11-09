"use client";

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";
import { catchError, type ErrorInfo } from "next/error";
import { type ReactNode, Suspense } from "react";
import { Tile, TileSkeleton } from "./tile";

function TileError({ title }: { title: string }, { retry }: ErrorInfo) {
  return (
    <Tile title={title}>
      <ErrorMessage>This couldn't be loaded right now.</ErrorMessage>
      <Button variant="secondary" size="sm" onClick={() => retry()}>
        Try again
      </Button>
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
