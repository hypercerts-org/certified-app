import { test, expect } from "@playwright/test"
import { STORAGE_STATE } from "./global-setup"
import { collectProblems, gotoAndSettle } from "../helpers"

/**
 * Tier 3 — the real write path, against a real ePDS.
 *
 * This is the regression test for the bug that started all of this:
 * posting an activity update 403'd because
 * `org.hypercerts.context.attachment` was missing from the XRPC proxy's
 * write allowlist. Create / edit / delete all route through the same
 * gate, so all three are exercised here.
 *
 * `allowed-collections.test.ts` catches that specific omission in
 * milliseconds without a browser — this spec is the backstop that proves
 * the whole chain works against the actual PDS: session → CSRF → proxy →
 * OAuth session → PDS write → indexer read-back.
 *
 * COSTS REAL RECORDS. Every run writes to a real, federated atproto repo.
 * Use a throwaway account (E2E_TEST_DID), and note the cleanup contract
 * below — a failed run can leave records behind.
 */

const TEST_ACTIVITY_URI = process.env.E2E_TEST_ACTIVITY_URI
const hasSession = !!process.env.E2E_TEST_DID

test.describe("update lifecycle (authenticated)", () => {
  test.skip(
    !hasSession,
    "Set E2E_TEST_DID in .env.test.local to run authenticated tests — see AGENTS.md §27",
  )
  test.skip(
    !TEST_ACTIVITY_URI,
    "Set E2E_TEST_ACTIVITY_URI to an activity the test account authored",
  )

  test.use({ storageState: STORAGE_STATE })

  // Writes are serial and stateful: create → edit → delete on one record.
  test.describe.configure({ mode: "serial" })

  const title = `E2E update ${Date.now()}`
  let updateUrl: string | null = null

  test("the session is actually authenticated", async ({ page }) => {
    // Fail fast and clearly if the seeded cookie didn't take — otherwise
    // every later assertion fails for a confusing downstream reason.
    const res = await page.request.get("/api/auth/session")
    expect(res.status(), "seeded session cookie should authenticate").toBe(200)
    const body = await res.json()
    expect(body.did).toBe(process.env.E2E_TEST_DID)
  })

  test("posts a new update", async ({ page }) => {
    const problems = collectProblems(page)

    // at://did/collection/rkey → /{did}/activity/{rkey}/update/new
    const [, , did, , rkey] = TEST_ACTIVITY_URI!.split("/")
    await gotoAndSettle(page, `/${did}/activity/${rkey}/update/new`)

    await page.getByLabel(/^title$/i).fill(title)
    await page.locator('[contenteditable="true"]').first().fill("Posted by the E2E suite.")
    await page.getByRole("button", { name: /post update/i }).click()

    // The 403 this suite exists for surfaced as an inline error box.
    await expect(
      page.getByText(/must be an allowed collection/i),
      "the collection allowlist rejected the write",
    ).toHaveCount(0)

    await expect(page).toHaveURL(/tab=updates/, { timeout: 20_000 })
    await expect(page.getByText(title)).toBeVisible()

    updateUrl = page.url()
    expect(problems.pageErrors).toEqual([])
  })

  test("edits the update (putRecord path)", async ({ page }) => {
    test.skip(!updateUrl, "create step did not complete")

    await gotoAndSettle(page, updateUrl!)
    await page.getByText(title).click()
    await page.getByRole("link", { name: /edit/i }).first().click()

    const edited = `${title} (edited)`
    await page.getByLabel(/^title$/i).fill(edited)
    await page.getByRole("button", { name: /save|update/i }).first().click()

    await expect(page.getByText(edited)).toBeVisible({ timeout: 20_000 })
  })

  test("deletes the update (deleteRecord path)", async ({ page }) => {
    test.skip(!updateUrl, "create step did not complete")

    await gotoAndSettle(page, updateUrl!)
    await page.getByText(new RegExp(title)).first().click()
    await page.getByRole("button", { name: /delete/i }).first().click()
    // ConfirmDialog — accept.
    await page.getByRole("button", { name: /^delete$/i }).last().click()

    await expect(page.getByText(new RegExp(title))).toHaveCount(0, {
      timeout: 20_000,
    })
  })
})

/**
 * CLEANUP CONTRACT
 *
 * The delete step is the cleanup for the happy path. If an earlier step
 * fails the record survives, so before adding more write specs, add a
 * sweep here that lists `org.hypercerts.context.attachment` records on
 * E2E_TEST_DID whose title starts with "E2E update " and deletes them.
 * `deleteContextUpdate` in src/lib/atproto/context-attachment.ts is the
 * client-side equivalent; from a spec, drive it via page.request against
 * /api/xrpc/com/atproto/repo/deleteRecord with the seeded session.
 */
