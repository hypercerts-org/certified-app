#!/usr/bin/env node
/**
 * Small local/staging parity harness for the Magic Indexer → Hyperindex switch.
 *
 * This Stage-0 harness intentionally starts with count-like canaries because
 * they are cheap, public, and easy to compare. Later stages can extend this
 * file with operation-specific samples (DIDs/URIs) before flipping each group.
 *
 * Usage:
 *   npm run indexer:parity
 *   MAGIC_INDEXER_URL=... HYPERINDEX_URL=... npm run indexer:parity
 *   npm run indexer:parity -- --json
 *
 * By default the command is diagnostic and exits 0 even when counts differ;
 * pass --strict to fail on any non-zero delta.
 */

const DEFAULT_MAGIC_INDEXER_URL =
  "https://magic-indexer-prod.up.railway.app/graphql"
const DEFAULT_HYPERINDEX_URL = "https://api.indexer.hypercerts.dev/graphql"

const magicUrl =
  process.env.MAGIC_INDEXER_URL ||
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  DEFAULT_MAGIC_INDEXER_URL
const hyperindexUrl = process.env.HYPERINDEX_URL || DEFAULT_HYPERINDEX_URL

const args = new Set(process.argv.slice(2))
const asJson = args.has("--json")
const strict = args.has("--strict")

const query = `query CertifiedCountParity {
  profiles: appCertifiedActorProfile(first: 1) { totalCount }
  organizations: appCertifiedActorOrganization(first: 1) { totalCount }
  activities: orgHypercertsClaimActivity(first: 1) { totalCount }
  projects: orgHypercertsCollection(first: 1, where: { type: { eq: "project" } }) { totalCount }
  awards: appCertifiedBadgeAward(first: 1) { totalCount }
}`

const operations = [
  ["ProfileCount", "profiles"],
  ["OrganizationCount", "organizations"],
  ["ActivityCount", "activities"],
  ["ProjectCount", "projects"],
  ["AwardCount", "awards"],
]

async function request(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, operationName: "CertifiedCountParity" }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${url} returned non-JSON HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.ok || body.errors?.length) {
    throw new Error(
      `${url} returned HTTP ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`,
    )
  }
  return body.data ?? {}
}

function getCount(data, key) {
  const value = data?.[key]?.totalCount
  return typeof value === "number" ? value : null
}

function pad(value, width) {
  return String(value).padEnd(width, " ")
}

const startedAt = new Date().toISOString()
const [magic, hyperindex] = await Promise.all([
  request(magicUrl),
  request(hyperindexUrl),
])

const rows = operations.map(([operation, key]) => {
  const magicCount = getCount(magic, key)
  const hyperindexCount = getCount(hyperindex, key)
  const delta =
    typeof magicCount === "number" && typeof hyperindexCount === "number"
      ? hyperindexCount - magicCount
      : null
  return {
    operation,
    magic: magicCount,
    hyperindex: hyperindexCount,
    delta,
    matches: delta === 0,
  }
})

const result = {
  startedAt,
  magicUrl,
  hyperindexUrl,
  rows,
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log("Certified indexer parity harness")
  console.log(`Magic:      ${magicUrl}`)
  console.log(`Hyperindex: ${hyperindexUrl}`)
  console.log("")
  console.log(
    `${pad("Operation", 22)} ${pad("Magic", 12)} ${pad("Hyperindex", 12)} ${pad("Delta", 12)} Status`,
  )
  console.log("-".repeat(74))
  for (const row of rows) {
    const delta = row.delta === null ? "n/a" : row.delta
    console.log(
      `${pad(row.operation, 22)} ${pad(row.magic ?? "n/a", 12)} ${pad(row.hyperindex ?? "n/a", 12)} ${pad(delta, 12)} ${row.matches ? "match" : "diff"}`,
    )
  }
  console.log("")
  console.log(
    "Note: this is a diagnostic harness. Known semantic/indexing differences should be documented before flipping each stage.",
  )
}

if (strict && rows.some((row) => !row.matches)) {
  process.exitCode = 1
}
