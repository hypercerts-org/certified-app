import { describe, it, expect, vi, beforeEach } from "vitest"
import { extractError, extractRouteError, pickAllowedFields, toUserErrorMessage } from "../api"

// Silence the logSafe console output during tests (it logs every
// extractRouteError invocation). We don't assert on log content here
// — see log-safe.test.ts for that.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("extractRouteError", () => {
  describe("4xx errors echo upstream message", () => {
    it("echoes a 400 message verbatim", () => {
      const { status, message } = extractRouteError({
        status: 400,
        message: "Handle must be at least 3 characters",
      })
      expect(status).toBe(400)
      expect(message).toBe("Handle must be at least 3 characters")
    })

    it("echoes a 403 message verbatim", () => {
      const { status, message } = extractRouteError({
        status: 403,
        message: "Insufficient role on group",
      })
      expect(status).toBe(403)
      expect(message).toBe("Insufficient role on group")
    })

    it("redacts Bearer tokens in echoed 4xx messages", () => {
      const { message } = extractRouteError({
        status: 401,
        message: "auth failed: Bearer abc.def.ghi",
      })
      expect(message).not.toContain("abc.def.ghi")
      expect(message).toContain("Bearer <redacted>")
    })

    it("redacts JWT-shaped tokens in echoed 4xx messages", () => {
      const { message } = extractRouteError({
        status: 400,
        message: "decode failed for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig",
      })
      expect(message).not.toContain("eyJhbGciOiJIUzI1NiJ9")
      expect(message).toContain("<jwt>")
    })

    it("falls back to a generic message when 4xx error has no message string", () => {
      const { status, message } = extractRouteError({ status: 404 })
      expect(status).toBe(404)
      expect(message).toBe("Not found")
    })
  })

  describe("5xx errors return a generic message", () => {
    it("does NOT echo the upstream message on 500", () => {
      const { status, message } = extractRouteError({
        status: 500,
        message: "PostgreSQL connection refused at 10.0.0.1:5432",
      })
      expect(status).toBe(500)
      expect(message).toBe("Internal server error")
      expect(message).not.toContain("PostgreSQL")
    })

    it("does NOT echo the upstream message on 502", () => {
      const { status, message } = extractRouteError({
        status: 502,
        message: "Upstream Bluesky AppView returned 504",
      })
      expect(status).toBe(502)
      expect(message).toBe("Internal server error")
    })
  })

  describe("clamps out-of-range status codes to 500", () => {
    it.each([
      [0],
      [-1],
      [199],
      [600],
      [700],
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [3.14], // non-integer
    ])("treats status %p as 500", (badStatus) => {
      const { status } = extractRouteError({
        status: badStatus,
        message: "ignored",
      })
      expect(status).toBe(500)
    })
  })

  describe("falls back to 500 for non-numeric status", () => {
    it("treats missing status as 500", () => {
      const { status, message } = extractRouteError({ message: "x" })
      expect(status).toBe(500)
      expect(message).toBe("Internal server error")
    })

    it("treats a string status as 500", () => {
      const { status } = extractRouteError({ status: "not a number" })
      expect(status).toBe(500)
    })

    it("treats null err as 500", () => {
      const { status } = extractRouteError(null)
      expect(status).toBe(500)
    })

    it("uses err.statusCode as a secondary signal", () => {
      const { status } = extractRouteError({ statusCode: 404 })
      expect(status).toBe(404)
    })
  })

  describe("preserves the atproto error discriminator (code)", () => {
    it("surfaces err.error as `code` on a 4xx (InvalidSwap)", () => {
      const { status, message, code } = extractRouteError({
        status: 400,
        error: "InvalidSwap",
        message: "Record was modified",
      })
      expect(status).toBe(400)
      expect(message).toBe("Record was modified")
      // The discriminator must survive so the client write seam can
      // re-raise InvalidSwapError instead of a generic Error (bug-003).
      expect(code).toBe("InvalidSwap")
    })

    it("omits `code` when the error carries no discriminator", () => {
      const { code } = extractRouteError({
        status: 400,
        message: "Handle must be at least 3 characters",
      })
      expect(code).toBeUndefined()
    })
  })

  describe("status code → generic message table", () => {
    it.each([
      [400, "Bad request"],
      [401, "Not authenticated"],
      [403, "Forbidden"],
      [404, "Not found"],
      [409, "Conflict"],
      [429, "Too many requests"],
    ])("status %i → %s", (status, expected) => {
      // 4xx-with-no-message-string takes the generic path
      const { message } = extractRouteError({ status })
      expect(message).toBe(expected)
    })
  })
})

describe("pickAllowedFields", () => {
  it("keeps only allowed keys and stamps $type", () => {
    const result = pickAllowedFields(
      { title: "X", maliciousField: "drop me", subject: "y" },
      ["title", "subject"],
      "app.example.test",
    )
    expect(result).toEqual({
      $type: "app.example.test",
      title: "X",
      subject: "y",
    })
    expect(result).not.toHaveProperty("maliciousField")
  })

  it("drops keys whose value is undefined", () => {
    const result = pickAllowedFields(
      { title: "X", description: undefined },
      ["title", "description"],
      "app.example.test",
    )
    expect(result).toEqual({ $type: "app.example.test", title: "X" })
    expect(result).not.toHaveProperty("description")
  })

  it("preserves explicit null values (intentional clear semantics)", () => {
    const result = pickAllowedFields(
      { title: "X", description: null },
      ["title", "description"],
      "app.example.test",
    )
    expect(result.description).toBeNull()
  })

  it("returns just $type when no allowed fields are present", () => {
    const result = pickAllowedFields(
      { maliciousField: "y" },
      ["title", "description"],
      "app.example.test",
    )
    expect(result).toEqual({ $type: "app.example.test" })
  })
})

describe("toUserErrorMessage", () => {
  it("passes a human-written 4xx message through", () => {
    expect(toUserErrorMessage(400, "Handle must be at least 3 characters", "Failed")).toBe(
      "Handle must be at least 3 characters",
    )
  })

  it("replaces protocol jargon with the fallback", () => {
    expect(toUserErrorMessage(400, "Invalid group DID", "Failed to save")).toBe("Failed to save")
    expect(toUserErrorMessage(403, "csrf origin mismatch", "Failed to save")).toBe("Failed to save")
    expect(toUserErrorMessage(400, "listRecords failed: 502", "Failed to load")).toBe("Failed to load")
  })

  it("maps session, rate-limit and server errors to plain sentences", () => {
    expect(toUserErrorMessage(401, "Not authenticated", "Failed")).toMatch(/Sign in again/)
    expect(toUserErrorMessage(429, undefined, "Failed")).toMatch(/Too many attempts/)
    expect(toUserErrorMessage(502, "Upstream PDS returned 502", "Failed to save")).toBe(
      "Failed to save. Something went wrong on our side; try again in a moment.",
    )
  })

  it("keeps ordinary English that happens to contain 'did'", () => {
    expect(toUserErrorMessage(400, "You did not add a title", "Failed")).toBe("You did not add a title")
  })

  it("uses the fallback when the server sent no message", () => {
    expect(toUserErrorMessage(400, undefined, "Failed to save")).toBe("Failed to save")
  })
})

describe("extractError", () => {
  it("reads the JSON error field", async () => {
    const res = new Response(JSON.stringify({ error: "Title is too short" }), { status: 400 })
    expect(await extractError(res, "Failed")).toBe("Title is too short")
  })

  it("falls back on a non-JSON body", async () => {
    const res = new Response("<html>", { status: 400 })
    expect(await extractError(res, "Failed")).toBe("Failed")
  })
})
