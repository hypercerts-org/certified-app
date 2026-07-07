#!/usr/bin/env node
/**
 * Hyperindex connectivity/schema smoke test for the Certified migration.
 *
 * This checks that the hosted Hyperindex endpoint exposes the typed roots the
 * staged Magic Indexer removal plan depends on. It intentionally avoids any
 * app proxy or Magic endpoint so failures point at Hyperindex availability or
 * schema drift.
 */

const DEFAULT_HYPERINDEX_URL = "https://api.indexer.hypercerts.dev/graphql"
const endpoint = process.env.HYPERINDEX_URL || DEFAULT_HYPERINDEX_URL

const requiredRoots = [
  "orgHypercertsClaimActivity",
  "orgHypercertsCollection",
  "appCertifiedGraphFollow",
  "appCertifiedActorProfile",
  "appCertifiedActorOrganization",
  "appCertifiedBadgeAward",
  "appCertifiedBadgeDefinition",
  "appCertifiedBadgeResponse",
  "orgHypercertsFundingReceipt",
  "endorsementClosure",
  "recordTimeline",
]

async function request(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.ok || body.errors?.length) {
    throw new Error(
      `GraphQL error HTTP ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 800)}`,
    )
  }
  return body.data
}

const rootData = await request(`query HyperindexRootSmoke {
  __schema { queryType { fields { name } } }
}`)
const roots = new Set(rootData.__schema.queryType.fields.map((field) => field.name))
const missing = requiredRoots.filter((name) => !roots.has(name))
if (missing.length > 0) {
  throw new Error(`Missing required Hyperindex query roots: ${missing.join(", ")}`)
}

const countData = await request(`query HyperindexCountSmoke {
  profiles: appCertifiedActorProfile(first: 1) { totalCount }
  orgs: appCertifiedActorOrganization(first: 1) { totalCount }
  activities: orgHypercertsClaimActivity(first: 1) { totalCount }
  projects: orgHypercertsCollection(first: 1, where: { type: { eq: "project" } }) { totalCount }
  awards: appCertifiedBadgeAward(first: 1) { totalCount }
}`)

for (const [key, value] of Object.entries(countData)) {
  if (typeof value?.totalCount !== "number") {
    throw new Error(`Expected numeric totalCount for ${key}, got ${JSON.stringify(value)}`)
  }
}

console.log("Hyperindex smoke test passed")
console.log(`Endpoint: ${endpoint}`)
console.log(`Roots checked: ${requiredRoots.length}`)
console.log(
  Object.entries(countData)
    .map(([key, value]) => `${key}=${value.totalCount}`)
    .join(" "),
)
