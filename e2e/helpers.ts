import type { Page, ConsoleMessage } from "@playwright/test"

/**
 * Shared helpers for the E2E tiers.
 *
 * The load-time assertion these specs lean on is "the page rendered and
 * the console stayed clean". That catches the failure mode unit tests
 * structurally cannot: a component that throws during render, a hook that
 * blows up on real data shapes, a hydration mismatch, a missing provider.
 */

/**
 * Console noise that is expected and must not fail a spec.
 *
 * Keep this list SHORT and justified — every entry is a class of real
 * error we've agreed to stop seeing. Prefer fixing the source.
 */
const IGNORED_CONSOLE = [
  // React DevTools nag in dev builds.
  /Download the React DevTools/i,
  // Next dev overlay + HMR chatter.
  /\[Fast Refresh\]/i,
  // jsdom/browser noise from next/image's dev-mode warnings about
  // fixture images that intentionally 404 in the mock harness.
  /Failed to load resource/i,
]

/**
 * Structural to the `/dev/preview/*` harness, NOT a product bug.
 *
 * `MockFetchProvider` is a client component that patches `window.fetch`
 * during first render, so the server render sees no fixtures (empty
 * state) while the client render sees them (populated). React reports
 * the difference as a hydration mismatch on every preview surface.
 *
 * Allowed ONLY where `allowHydrationMismatch` is passed — i.e. in
 * smoke.spec.ts. On real routes a hydration mismatch is a genuine bug
 * and must fail: public-routes.spec.ts hydrates clean today, which is
 * what makes this exemption safe to grant.
 */
const HYDRATION_MISMATCH = /Hydration failed because the server rendered/i

export interface PageProblems {
  consoleErrors: string[]
  pageErrors: string[]
}

export interface CollectOptions {
  /** Tolerate the preview harness's inherent SSR/client fixture mismatch. */
  allowHydrationMismatch?: boolean
}

/**
 * Start collecting console errors and uncaught exceptions. Call before
 * `page.goto`; read the arrays after the page settles.
 */
export function collectProblems(
  page: Page,
  options: CollectOptions = {},
): PageProblems {
  const problems: PageProblems = { consoleErrors: [], pageErrors: [] }

  const ignored = options.allowHydrationMismatch
    ? [...IGNORED_CONSOLE, HYDRATION_MISMATCH]
    : IGNORED_CONSOLE

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    if (ignored.some((re) => re.test(text))) return
    problems.consoleErrors.push(text)
  })

  // Uncaught exceptions and unhandled rejections in page context.
  page.on("pageerror", (err) => {
    const message = err.message.split("\n")[0]
    if (ignored.some((re) => re.test(message))) return
    problems.pageErrors.push(message)
  })

  return problems
}

/**
 * Seed the theme before first paint. next-themes persists to
 * localStorage under "theme" and flips `data-theme` on <html>; setting
 * both avoids a flash and removes any dependence on the OS preference.
 * Mirrors scripts/preview-screenshots.mjs.
 */
export async function seedTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t as string)
      document.documentElement.setAttribute("data-theme", t as string)
      document.documentElement.style.colorScheme = t as string
    } catch {
      /* ignore */
    }
  }, theme)
}

/**
 * Navigate and wait for the fixture-driven fetches to resolve and paint.
 * `networkidle` alone returns too early on these surfaces because the
 * mock fetch layer resolves synchronously and React renders after.
 */
export async function gotoAndSettle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle" })
  await page.waitForLoadState("domcontentloaded")
  // Let effect-driven fixture renders flush.
  await page.waitForTimeout(400)
}
