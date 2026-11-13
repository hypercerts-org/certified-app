// One-off: makes the Vercel Sandbox snapshot that site captures boot from
// (src/lib/look/site-capture.ts). Run it again when playwright-core is
// upgraded, then put the new id in SITE_CAPTURE_SNAPSHOT_ID.
//
//   vercel link && vercel env pull     # a VERCEL_OIDC_TOKEN in .env.local
//   node --env-file=.env.local scripts/site-capture/make-snapshot.mjs
//
// It installs playwright-core (the version this repo uses) and Playwright's
// headless Chromium with its system libraries into /vercel/sandbox/capture,
// checks that a capture works, and prints the snapshot id. Creating it makes
// a resource in the linked Vercel team (snapshot storage is billed).

import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Sandbox } from "@vercel/sandbox"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const version = require("playwright-core/package.json").version
const DIR = "/vercel/sandbox/capture"

async function run(sandbox, step, params) {
  console.log(`- ${step}`)
  const result = await sandbox.runCommand({ cwd: DIR, ...params })
  if (result.exitCode !== 0) {
    throw new Error(`${step} failed (${result.exitCode}):\n${(await result.stderr()).slice(-2000)}`)
  }
  return result
}

const sandbox = await Sandbox.create({
  image: "vercel/sandbox/node:24",
  resources: { vcpus: 2 },
  timeout: 15 * 60_000,
  persistent: false,
})
try {
  await run(sandbox, "make the folder", { cmd: "mkdir", args: ["-p", DIR], cwd: "/vercel/sandbox" })
  await sandbox.writeFiles([
    { path: `${DIR}/package.json`, content: Buffer.from(JSON.stringify({ private: true, type: "module" })) },
    { path: `${DIR}/capture.mjs`, content: await readFile(path.join(here, "capture.mjs")) },
  ])
  await run(sandbox, `install playwright-core ${version}`, {
    cmd: "npm",
    args: ["install", "--no-audit", "--no-fund", `playwright-core@${version}`],
  })
  await run(sandbox, "install Chromium's system libraries", {
    cmd: "npx",
    args: ["playwright-core", "install-deps", "chromium-headless-shell"],
    sudo: true,
  })
  await run(sandbox, "install headless Chromium", {
    cmd: "npx",
    args: ["playwright-core", "install", "--only-shell", "chromium"],
  })
  await run(sandbox, "test a capture", { cmd: "node", args: [`${DIR}/capture.mjs`, "https://example.com", `${DIR}/test.json`] })
  await run(sandbox, "clean up", { cmd: "rm", args: ["-f", `${DIR}/test.json`, `${DIR}/capture.mjs`] })
  console.log("- snapshot")
  // Kept until replaced (expiration 0); the sandbox stops on its own.
  const snapshot = await sandbox.snapshot({ expiration: 0 })
  console.log(`\nSITE_CAPTURE_SNAPSHOT_ID=${snapshot.snapshotId}`)
} catch (err) {
  await sandbox.stop().catch(() => {})
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
