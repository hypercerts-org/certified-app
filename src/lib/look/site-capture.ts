import "server-only"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SiteCapture } from "./site-capture-types"

/**
 * Renders a website in headless Chromium and returns what it looks like
 * (scripts/site-capture/capture.mjs does the capturing), for making a style
 * from it (/api/looks/site-capture).
 *
 * Where Chromium runs:
 * - Production: a throwaway Vercel Sandbox VM per capture, booted from a
 *   snapshot that has Playwright's Chromium installed
 *   (scripts/site-capture/make-snapshot.mjs, id in SITE_CAPTURE_SNAPSHOT_ID).
 *   The website's own scripts run in there, not in Certified's function: the
 *   VM holds no secrets, can't reach private addresses (network policy
 *   below), and is stopped as soon as the capture is read.
 * - Local development: the same script with the developer's installed
 *   Chrome (CHROME_PATH, or the usual macOS location).
 * - Anywhere else: unavailable, and the style is made from the CSS digest
 *   alone, as before.
 *
 * Chosen over Chromium inside the function (a website's JavaScript would run
 * next to Certified's environment and secrets) and over a hosted screenshot
 * service (another company would see which sites people style from, and its
 * output can't include computed styles of real elements).
 */

export class SiteCaptureError extends Error {
  constructor(
    readonly code: "unavailable" | "failed",
    message: string,
  ) {
    super(message)
    this.name = "SiteCaptureError"
  }
}

const SCRIPT = path.join(process.cwd(), "scripts/site-capture/capture.mjs")
/** Where the snapshot has playwright-core installed; the script goes next to
 *  its node_modules so `import("playwright-core")` resolves. */
const SANDBOX_DIR = "/vercel/sandbox/capture"
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
/** The capture's own deadline is 15 s; this covers booting and reading. */
const TOTAL_MS = 40_000
const MAX_RESULT_BYTES = 6_000_000

/** Everything but the public internet, refused by the VM for every
 *  connection Chromium makes. */
export const DENIED_SUBNETS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
]

export function siteCaptureMode(): "sandbox" | "local" | null {
  if (process.env.SITE_CAPTURE_SNAPSHOT_ID) return "sandbox"
  if (process.env.NODE_ENV === "development" && existsSync(process.env.CHROME_PATH || MAC_CHROME)) return "local"
  return null
}

function parseCapture(raw: Buffer | null): SiteCapture {
  if (!raw || raw.byteLength === 0) throw new SiteCaptureError("failed", "The capture wrote nothing.")
  if (raw.byteLength > MAX_RESULT_BYTES) throw new SiteCaptureError("failed", "The capture was too large.")
  const capture = JSON.parse(raw.toString("utf8")) as SiteCapture
  if (!Array.isArray(capture.screenshots) || capture.screenshots.length === 0) {
    throw new SiteCaptureError("failed", "The capture has no screenshots.")
  }
  return capture
}

async function inSandbox(url: string, snapshotId: string, signal: AbortSignal): Promise<SiteCapture> {
  const { Sandbox } = await import("@vercel/sandbox")
  const script = await readFile(SCRIPT)
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    // Chromium wants more than the 2 GB one vCPU brings.
    resources: { vcpus: 2 },
    timeout: TOTAL_MS + 20_000,
    persistent: false,
    // Domain rules match by TLS name: "*" lets any https site load; plain
    // http sites may not, which is acceptable for reading a brand.
    networkPolicy: { allow: ["*"], subnets: { deny: DENIED_SUBNETS } },
    signal,
  })
  try {
    await sandbox.writeFiles([{ path: `${SANDBOX_DIR}/capture.mjs`, content: script }], { signal })
    const run = await sandbox.runCommand({
      cmd: "node",
      args: [`${SANDBOX_DIR}/capture.mjs`, url, `${SANDBOX_DIR}/out.json`],
      cwd: SANDBOX_DIR,
      signal,
    })
    if (run.exitCode !== 0) {
      const why = (await run.stderr().catch(() => "")).trim().slice(0, 300)
      throw new SiteCaptureError("failed", why || `capture exited with ${run.exitCode}`)
    }
    return parseCapture(await sandbox.readFileToBuffer({ path: `${SANDBOX_DIR}/out.json` }, { signal }))
  } finally {
    await sandbox.stop().catch(() => {})
  }
}

async function onThisMachine(url: string, signal: AbortSignal): Promise<SiteCapture> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "site-capture-"))
  const out = path.join(dir, "out.json")
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, url, out], {
        // Only what the script needs: none of the app's secrets.
        env: { NODE_ENV: "production", PATH: process.env.PATH ?? "", CHROME_PATH: process.env.CHROME_PATH || MAC_CHROME },
        stdio: ["ignore", "ignore", "pipe"],
        signal,
      })
      let err = ""
      child.stderr.on("data", (d: Buffer) => {
        err = (err + d.toString()).slice(-600)
      })
      child.on("error", reject)
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new SiteCaptureError("failed", err.trim() || `capture exited with ${code}`)),
      )
    })
    return parseCapture(await readFile(out))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** What a website looks like when rendered. Throws SiteCaptureError. */
export async function captureSite(url: string): Promise<SiteCapture> {
  const mode = siteCaptureMode()
  if (!mode) throw new SiteCaptureError("unavailable", "Screenshots aren't set up on this server.")
  const signal = AbortSignal.timeout(TOTAL_MS)
  try {
    return mode === "sandbox"
      ? await inSandbox(url, process.env.SITE_CAPTURE_SNAPSHOT_ID!, signal)
      : await onThisMachine(url, signal)
  } catch (err) {
    if (err instanceof SiteCaptureError) throw err
    throw new SiteCaptureError("failed", err instanceof Error ? err.message : String(err))
  }
}
