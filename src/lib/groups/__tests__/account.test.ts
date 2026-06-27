import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mirror the lib-client test convention (atproto/__tests__/collection.test.ts):
// mock @/lib/auth/fetch and drive each function with crafted Response objects.
// extractError is left un-mocked so the real error-extraction logic is exercised.
const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init?: RequestInit) => mockAuthFetch(url, init),
}))

beforeEach(() => {
  mockAuthFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errResp(status: number, body: unknown = { error: "boom" }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** A 401 whose body marks the group session as locked. */
function lockedResp(): Response {
  return errResp(401, { error: "locked" })
}

async function loadModule() {
  return import("../account")
}

const DID = "did:plc:group"
const ENC = encodeURIComponent(DID)
const SESSION_URL = `/api/groups/${ENC}/account/session`
const EMAIL_URL = `/api/groups/${ENC}/account/email`
const HANDLE_URL = `/api/groups/${ENC}/account/handle`

describe("LOCKED constant", () => {
  it('is the literal string "locked"', async () => {
    const { LOCKED } = await loadModule()
    expect(LOCKED).toBe("locked")
  })
})

describe("unlockGroupAccount", () => {
  it("POSTs the password as JSON and returns the parsed status on success", async () => {
    mockAuthFetch.mockResolvedValue(ok({ status: "ok" }))
    const { unlockGroupAccount } = await loadModule()

    const result = await unlockGroupAccount(DID, "hunter2")

    expect(result).toEqual({ status: "ok" })
    expect(mockAuthFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe(SESSION_URL)
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body)).toEqual({ password: "hunter2" })
  })

  it("includes authFactorToken in the body when provided", async () => {
    mockAuthFetch.mockResolvedValue(ok({ status: "ok" }))
    const { unlockGroupAccount } = await loadModule()

    await unlockGroupAccount(DID, "hunter2", "2fa-token")

    const [, init] = mockAuthFetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      password: "hunter2",
      authFactorToken: "2fa-token",
    })
  })

  it("omits authFactorToken when not provided", async () => {
    mockAuthFetch.mockResolvedValue(ok({ status: "twoFactorRequired" }))
    const { unlockGroupAccount } = await loadModule()

    await unlockGroupAccount(DID, "hunter2")

    const [, init] = mockAuthFetch.mock.calls[0]
    expect("authFactorToken" in JSON.parse(init.body)).toBe(false)
  })

  it("throws with the extracted error message on a non-ok response", async () => {
    mockAuthFetch.mockResolvedValue(errResp(400, { error: "wrong password" }))
    const { unlockGroupAccount } = await loadModule()

    await expect(unlockGroupAccount(DID, "nope")).rejects.toThrow(
      "wrong password",
    )
  })

  it("throws the fallback message when the error body has no error field", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500, { something: "else" }))
    const { unlockGroupAccount } = await loadModule()

    await expect(unlockGroupAccount(DID, "nope")).rejects.toThrow(
      "Unlock failed",
    )
  })

  // unlock does NOT special-case a locked 401 — a 401 here just fails the unlock.
  it("throws (does not return LOCKED) on a 401-locked response", async () => {
    mockAuthFetch.mockResolvedValue(lockedResp())
    const { unlockGroupAccount } = await loadModule()

    await expect(unlockGroupAccount(DID, "nope")).rejects.toBeInstanceOf(Error)
  })
})

describe("lockGroupAccount", () => {
  it("DELETEs the session endpoint and resolves to undefined", async () => {
    mockAuthFetch.mockResolvedValue(ok({}))
    const { lockGroupAccount } = await loadModule()

    const result = await lockGroupAccount(DID)

    expect(result).toBeUndefined()
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe(SESSION_URL)
    expect(init.method).toBe("DELETE")
  })

  it("does not throw even if the response is non-ok (best-effort)", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500))
    const { lockGroupAccount } = await loadModule()

    await expect(lockGroupAccount(DID)).resolves.toBeUndefined()
  })
})

describe("getGroupEmail", () => {
  it("GETs the email endpoint and returns the parsed GroupEmail on success", async () => {
    mockAuthFetch.mockResolvedValue(
      ok({ email: "group@example.com", emailConfirmed: true }),
    )
    const { getGroupEmail } = await loadModule()

    const result = await getGroupEmail(DID)

    expect(result).toEqual({
      email: "group@example.com",
      emailConfirmed: true,
    })
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe(EMAIL_URL)
    // A bare GET — no explicit init object passed.
    expect(init).toBeUndefined()
  })

  it("returns LOCKED on a 401-locked response", async () => {
    mockAuthFetch.mockResolvedValue(lockedResp())
    const { getGroupEmail, LOCKED } = await loadModule()

    expect(await getGroupEmail(DID)).toBe(LOCKED)
  })

  it("does NOT return LOCKED for a 401 that is not locked", async () => {
    mockAuthFetch.mockResolvedValue(errResp(401, { error: "expired" }))
    const { getGroupEmail } = await loadModule()

    await expect(getGroupEmail(DID)).rejects.toThrow("expired")
  })

  it("throws with the extracted error message on other non-ok responses", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500, { error: "db down" }))
    const { getGroupEmail } = await loadModule()

    await expect(getGroupEmail(DID)).rejects.toThrow("db down")
  })

  it("throws the fallback message when there is no error field", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500, {}))
    const { getGroupEmail } = await loadModule()

    await expect(getGroupEmail(DID)).rejects.toThrow("Failed to read email")
  })
})

describe("requestGroupEmailUpdate", () => {
  it("POSTs the email endpoint and returns the parsed result on success", async () => {
    mockAuthFetch.mockResolvedValue(ok({ tokenRequired: true }))
    const { requestGroupEmailUpdate } = await loadModule()

    const result = await requestGroupEmailUpdate(DID)

    expect(result).toEqual({ tokenRequired: true })
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe(EMAIL_URL)
    expect(init.method).toBe("POST")
  })

  it("returns LOCKED on a 401-locked response", async () => {
    mockAuthFetch.mockResolvedValue(lockedResp())
    const { requestGroupEmailUpdate, LOCKED } = await loadModule()

    expect(await requestGroupEmailUpdate(DID)).toBe(LOCKED)
  })

  it("throws with the extracted message on other non-ok responses", async () => {
    mockAuthFetch.mockResolvedValue(errResp(429, { error: "slow down" }))
    const { requestGroupEmailUpdate } = await loadModule()

    await expect(requestGroupEmailUpdate(DID)).rejects.toThrow("slow down")
  })

  it("throws the fallback message when there is no error field", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500, {}))
    const { requestGroupEmailUpdate } = await loadModule()

    await expect(requestGroupEmailUpdate(DID)).rejects.toThrow(
      "Failed to request email update",
    )
  })
})

describe("updateGroupEmail", () => {
  it("PUTs the email (no token) as JSON and resolves to undefined on success", async () => {
    mockAuthFetch.mockResolvedValue(ok({}))
    const { updateGroupEmail } = await loadModule()

    const result = await updateGroupEmail(DID, "new@example.com")

    expect(result).toBeUndefined()
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe(EMAIL_URL)
    expect(init.method).toBe("PUT")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body)).toEqual({ email: "new@example.com" })
  })

  it("includes the token in the body when provided", async () => {
    mockAuthFetch.mockResolvedValue(ok({}))
    const { updateGroupEmail } = await loadModule()

    await updateGroupEmail(DID, "new@example.com", "confirm-token")

    const [, init] = mockAuthFetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      email: "new@example.com",
      token: "confirm-token",
    })
  })

  it("omits the token key when not provided", async () => {
    mockAuthFetch.mockResolvedValue(ok({}))
    const { updateGroupEmail } = await loadModule()

    await updateGroupEmail(DID, "new@example.com")

    const [, init] = mockAuthFetch.mock.calls[0]
    expect("token" in JSON.parse(init.body)).toBe(false)
  })

  it("returns LOCKED on a 401-locked response", async () => {
    mockAuthFetch.mockResolvedValue(lockedResp())
    const { updateGroupEmail, LOCKED } = await loadModule()

    expect(await updateGroupEmail(DID, "new@example.com")).toBe(LOCKED)
  })

  it("does NOT return LOCKED for a 401 that is not locked", async () => {
    mockAuthFetch.mockResolvedValue(errResp(401, { error: "nope" }))
    const { updateGroupEmail } = await loadModule()

    await expect(updateGroupEmail(DID, "new@example.com")).rejects.toThrow(
      "nope",
    )
  })

  it("throws with the extracted message on other non-ok responses", async () => {
    mockAuthFetch.mockResolvedValue(errResp(400, { error: "bad email" }))
    const { updateGroupEmail } = await loadModule()

    await expect(updateGroupEmail(DID, "bad")).rejects.toThrow("bad email")
  })

  it("throws the fallback message when there is no error field", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500, {}))
    const { updateGroupEmail } = await loadModule()

    await expect(updateGroupEmail(DID, "new@example.com")).rejects.toThrow(
      "Failed to update email",
    )
  })
})

describe("updateGroupHandle", () => {
  it("PUTs the handle endpoint with the handle as JSON and resolves to undefined", async () => {
    mockAuthFetch.mockResolvedValue(ok({}))
    const { updateGroupHandle } = await loadModule()

    const result = await updateGroupHandle(DID, "new-handle")

    expect(result).toBeUndefined()
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe(HANDLE_URL)
    expect(init.method).toBe("PUT")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body)).toEqual({ handle: "new-handle" })
  })

  it("returns LOCKED on a 401-locked response", async () => {
    mockAuthFetch.mockResolvedValue(lockedResp())
    const { updateGroupHandle, LOCKED } = await loadModule()

    expect(await updateGroupHandle(DID, "new-handle")).toBe(LOCKED)
  })

  it("does NOT return LOCKED for a 401 that is not locked", async () => {
    mockAuthFetch.mockResolvedValue(errResp(401, { error: "session expired" }))
    const { updateGroupHandle } = await loadModule()

    await expect(updateGroupHandle(DID, "new-handle")).rejects.toThrow(
      "session expired",
    )
  })

  it("throws with the extracted message on other non-ok responses", async () => {
    mockAuthFetch.mockResolvedValue(errResp(409, { error: "handle taken" }))
    const { updateGroupHandle } = await loadModule()

    await expect(updateGroupHandle(DID, "taken")).rejects.toThrow(
      "handle taken",
    )
  })

  it("throws the fallback message when there is no error field", async () => {
    mockAuthFetch.mockResolvedValue(errResp(500, {}))
    const { updateGroupHandle } = await loadModule()

    await expect(updateGroupHandle(DID, "new-handle")).rejects.toThrow(
      "Failed to update handle",
    )
  })
})

describe("isLocked behaviour (observed via getGroupEmail)", () => {
  it("treats only status 401 + { error: 'locked' } as locked", async () => {
    const { getGroupEmail, LOCKED } = await loadModule()

    // 403 with error:locked is NOT locked (wrong status).
    mockAuthFetch.mockResolvedValueOnce(errResp(403, { error: "locked" }))
    await expect(getGroupEmail(DID)).rejects.toThrow("locked")

    // 401 with a non-JSON body is NOT locked (parse fails → false).
    mockAuthFetch.mockResolvedValueOnce(
      new Response("not json", { status: 401 }),
    )
    await expect(getGroupEmail(DID)).rejects.toBeInstanceOf(Error)

    // 401 with the exact locked marker IS locked.
    mockAuthFetch.mockResolvedValueOnce(lockedResp())
    expect(await getGroupEmail(DID)).toBe(LOCKED)
  })
})
