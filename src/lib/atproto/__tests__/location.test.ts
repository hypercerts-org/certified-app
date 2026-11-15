import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * quality-028: location.ts must use the shared strict at:// parser
 * (from activity-uri.ts), which rejects URIs with trailing segments
 * (`!== 3`) rather than the old lenient private copy (`< 3`) that
 * silently dropped extras. A 4-segment uri is malformed and must NOT
 * resolve to a record — `readLocationStrongRef` returns null without
 * ever hitting the network.
 */
const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init: RequestInit) => mockAuthFetch(url, init),
}))

beforeEach(() => {
  mockAuthFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("readLocationStrongRef at:// parsing", () => {
  it("returns null for a 4-segment (malformed) uri without fetching", async () => {
    const { readLocationStrongRef } = await import("../location")
    // Correct collection but a trailing garbage segment — the strict
    // shared parser rejects extras, the old lenient copy accepted it.
    const result = await readLocationStrongRef({
      uri: "at://did:plc:abc/app.certified.location/rkey123/garbage",
      cid: "bafyfake",
    })
    expect(result).toBeNull()
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})

/**
 * Other clients keep a location's coordinates in a small blob (the
 * lexicon's `org.hypercerts.defs#smallBlob` arm): a 22-byte text/plain
 * "-37.78,175.27", or a GeoJSON polygon. The reader fetches the blob and
 * parses it, and keeps the place's name even when it can't.
 */
const DID = "did:plc:goeco"
const URI = `at://${DID}/app.certified.location/3mn6vumn2rc2q`

function blobLocation(locationType: string, cid: string, name: string | undefined) {
  return {
    uri: URI,
    cid: "bafyrecord",
    value: {
      $type: "app.certified.location",
      locationType,
      ...(name ? { name } : {}),
      location: {
        $type: "org.hypercerts.defs#smallBlob",
        blob: { $type: "blob", ref: { $link: cid }, mimeType: "text/plain", size: 22 },
      },
    },
  }
}

function respond(routes: Record<string, () => Response>) {
  mockAuthFetch.mockImplementation(async (url: string) => {
    for (const [part, make] of Object.entries(routes)) {
      if (url.includes(part)) return make()
    }
    return new Response("not found", { status: 404 })
  })
}

describe("readLocationStrongRef: blob-held coordinates", () => {
  it("reads a coordinate pair from the blob", async () => {
    const { readLocationStrongRef } = await import("../location")
    respond({
      "repo/getRecord": () =>
        Response.json(
          blobLocation("coordinate-decimal", "bafkpoint", "25A Devon Road, Frankton, Hamilton 3204, New Zealand"),
        ),
      "sync/getBlob": () => new Response("-37.7885582,175.272282"),
    })
    const result = await readLocationStrongRef({ uri: URI, cid: "" })
    expect(result?.name).toBe("25A Devon Road, Frankton, Hamilton 3204, New Zealand")
    expect(result?.coords).toEqual({ lat: -37.7885582, lng: 175.272282 })
    expect(result?.shape?.kind).toBe("point")
    const blobCall = mockAuthFetch.mock.calls.find(([url]) => String(url).includes("getBlob"))
    expect(String(blobCall?.[0])).toContain(`did=${encodeURIComponent(DID)}`)
    expect(String(blobCall?.[0])).toContain("cid=bafkpoint")
  })

  it("reads a GeoJSON polygon as a region, without a point", async () => {
    const { readLocationStrongRef } = await import("../location")
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [98.69, 3.65],
          [98.6, 3.56],
          [98.69, 3.47],
          [98.78, 3.56],
          [98.69, 3.65],
        ],
      ],
    }
    respond({
      "repo/getRecord": () => Response.json(blobLocation("geojson-polygon", "bafkpoly", "Indonesia")),
      "sync/getBlob": () => new Response(JSON.stringify(polygon)),
    })
    const result = await readLocationStrongRef({ uri: URI, cid: "" })
    expect(result?.name).toBe("Indonesia")
    expect(result?.coords).toBeNull()
    expect(result?.shape?.kind).toBe("polygon")
  })

  it("keeps the name when the blob can't be read", async () => {
    const { readLocationStrongRef } = await import("../location")
    respond({
      "repo/getRecord": () => Response.json(blobLocation("coordinate-decimal", "bafkgone", "Zug, Switzerland")),
      "sync/getBlob": () => new Response("gone", { status: 404 }),
    })
    const result = await readLocationStrongRef({ uri: URI, cid: "" })
    expect(result).toMatchObject({ name: "Zug, Switzerland", coords: null, shape: null })
  })

  it("is null with neither a name nor a readable place", async () => {
    const { readLocationStrongRef } = await import("../location")
    respond({
      "repo/getRecord": () => Response.json(blobLocation("coordinate-decimal", "bafkgone", undefined)),
    })
    expect(await readLocationStrongRef({ uri: URI, cid: "" })).toBeNull()
  })

  it("still reads an inline coordinate string without fetching a blob", async () => {
    const { readLocationStrongRef } = await import("../location")
    respond({
      "repo/getRecord": () =>
        Response.json({
          uri: URI,
          cid: "bafyrecord",
          value: {
            locationType: "coordinate-decimal",
            location: { $type: "app.certified.location#string", string: "47.1661672,8.5154946" },
          },
        }),
    })
    const result = await readLocationStrongRef({ uri: URI, cid: "" })
    expect(result?.coords).toEqual({ lat: 47.1661672, lng: 8.5154946 })
    expect(mockAuthFetch.mock.calls.some(([url]) => String(url).includes("getBlob"))).toBe(false)
  })
})

describe("fetchLocationBlobText", () => {
  it("ignores locations that aren't a small blob", async () => {
    const { fetchLocationBlobText } = await import("../location")
    expect(await fetchLocationBlobText(DID, { string: "1,2" })).toBeNull()
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})

describe("shortPlaceName", () => {
  it("keeps the town and the country", async () => {
    const { shortPlaceName } = await import("../location")
    expect(shortPlaceName("25A Devon Road, Frankton, Hamilton 3204, New Zealand")).toBe(
      "Hamilton, New Zealand",
    )
    expect(shortPlaceName("813 N 9th Ave, Tucson, AZ 85705, USA")).toBe("Tucson, USA")
  })

  it("drops a leading Plus Code", async () => {
    const { shortPlaceName } = await import("../location")
    expect(shortPlaceName("W8VJ+RPH, Provincia de Guanacaste, Nosara, Costa Rica")).toBe(
      "Nosara, Costa Rica",
    )
  })

  it("passes short names through", async () => {
    const { shortPlaceName } = await import("../location")
    expect(shortPlaceName("Zug, Switzerland")).toBe("Zug, Switzerland")
    expect(shortPlaceName("Indonesia")).toBe("Indonesia")
    expect(shortPlaceName(null)).toBeNull()
  })
})
