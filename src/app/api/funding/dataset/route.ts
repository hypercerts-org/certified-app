import { NextResponse } from "next/server"
import { buildFundingDataset } from "@/lib/funding/build-dataset"
import { logSafe } from "@/lib/utils/log-safe"

/**
 * GET /api/funding/dataset
 *
 * The /funding page's data: every receipt it can show plus the projects and
 * recipients to draw them (see `src/lib/funding/dataset-types.ts`). Public
 * records only, so the response is anonymous and cacheable.
 *
 * Building it reads a whole repository and scans the indexer (tens of
 * seconds), so it is cached twice: in this instance for an hour (with
 * concurrent requests sharing one build), and at the CDN for an hour with a
 * day of stale-while-revalidate, so visitors almost never wait for a build.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 300

const TTL_MS = 60 * 60 * 1000

let cached: { at: number; body: string; partial: boolean } | null = null
let building: Promise<string> | null = null

function build(): Promise<string> {
  if (!building) {
    building = buildFundingDataset()
      .then((ds) => {
        const body = JSON.stringify(ds)
        // A partial build (a source or the indexer failed) is served but
        // kept only briefly, so the next request tries again.
        cached = {
          at: ds.partial ? Date.now() - TTL_MS + 5 * 60 * 1000 : Date.now(),
          body,
          partial: ds.partial,
        }
        return body
      })
      .finally(() => {
        building = null
      })
  }
  return building
}

export async function GET() {
  const fresh = cached && Date.now() - cached.at < TTL_MS
  try {
    let body: string
    if (fresh && cached) {
      body = cached.body
    } else if (cached) {
      // Serve the stale copy and rebuild in the background.
      body = cached.body
      void build().catch((err) => logSafe("[funding] dataset rebuild failed", err))
    } else {
      body = await build()
    }
    return new NextResponse(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // A partial build is cached at the CDN for minutes, not an hour.
        "cache-control": cached?.partial
          ? "public, max-age=60, s-maxage=300"
          : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (err) {
    logSafe("[funding] dataset build failed", err)
    return NextResponse.json({ error: "Couldn't load funding data" }, { status: 502 })
  }
}
