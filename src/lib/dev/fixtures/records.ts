/**
 * Fixtures for the `/dev/preview/records` surface: the viewer's own
 * activities (as the PDS `listRecords` returns them, contributors
 * included) and projects whose `items` point at some of them. One activity
 * sits in both projects and two sit in none, so every part of the folder
 * view shows: chips for the other project, contributor stacks with "+N",
 * and the "Without a project" folder.
 */
import { MOCK_DID } from "./session"
import { MOCK_ACTORS } from "./authors"

const ACTIVITY = "org.hypercerts.claim.activity"
const PROJECT = "org.hypercerts.collection"

interface ActivitySpec {
  rkey: string
  title: string
  createdAt: string
  startDate?: string
  endDate?: string
  /** DIDs or plain names. */
  contributors: string[]
}

const [ada, mangrove, rosa, kelp, soil] = MOCK_ACTORS

const ACTIVITIES: ActivitySpec[] = [
  {
    rkey: "rec-act-1",
    title: "Mangrove replanting, Tagus estuary",
    createdAt: "2025-10-02T09:00:00.000Z",
    startDate: "2025-01-01",
    endDate: "2025-03-31",
    contributors: [ada.did, mangrove.did, rosa.did, kelp.did, soil.did, "Field team Lisbon"],
  },
  {
    rkey: "rec-act-2",
    title: "Water quality survey, upper catchment",
    createdAt: "2025-09-14T09:00:00.000Z",
    startDate: "2025-04-01",
    endDate: "2025-06-30",
    contributors: [ada.did, rosa.did],
  },
  {
    rkey: "rec-act-3",
    title: "Soil carbon baseline, 40 plots",
    createdAt: "2025-08-20T09:00:00.000Z",
    startDate: "2025-05-01",
    contributors: [soil.did],
  },
  {
    rkey: "rec-act-4",
    title: "Volunteer day: riverbank clean-up",
    createdAt: "2025-07-03T09:00:00.000Z",
    contributors: [ada.did, "Maria Santos", "Joe Okafor"],
  },
  {
    rkey: "rec-act-5",
    title: "Kelp canopy monitoring, spring dives",
    createdAt: "2025-06-11T09:00:00.000Z",
    startDate: "2025-03-15",
    endDate: "2025-05-30",
    contributors: [kelp.did, ada.did],
  },
  {
    rkey: "rec-act-6",
    title: "Seed bank inventory",
    createdAt: "2025-05-28T09:00:00.000Z",
    contributors: [],
  },
]

function activityUri(rkey: string): string {
  return `at://${MOCK_DID}/${ACTIVITY}/${rkey}`
}

function activityCid(i: number): string {
  return `bafyrecact${i}000000000000000000000000000000000000000000000000`
}

/** The viewer's activities, in the `listRecords` envelope. */
export function recordsActivities(): {
  records: { uri: string; cid: string; value: Record<string, unknown> }[]
} {
  return {
    records: ACTIVITIES.map((a, i) => ({
      uri: activityUri(a.rkey),
      cid: activityCid(i),
      value: {
        $type: ACTIVITY,
        title: a.title,
        shortDescription: "Preview activity.",
        createdAt: a.createdAt,
        ...(a.startDate ? { startDate: a.startDate } : {}),
        ...(a.endDate ? { endDate: a.endDate } : {}),
        contributors: a.contributors.map((identity) => ({
          contributorIdentity: {
            $type: "org.hypercerts.claim.activity#contributorIdentity",
            identity,
          },
        })),
      },
    })),
  }
}

function itemsFor(rkeys: string[]) {
  return rkeys.map((rkey) => {
    const i = ACTIVITIES.findIndex((a) => a.rkey === rkey)
    return { itemIdentifier: { uri: activityUri(rkey), cid: activityCid(i) } }
  })
}

const PROJECTS = [
  {
    rkey: "rec-proj-1",
    title: "Watershed restoration",
    items: ["rec-act-1", "rec-act-2", "rec-act-3"],
  },
  {
    rkey: "rec-proj-2",
    title: "Coastal habitats 2025",
    items: ["rec-act-1", "rec-act-5"],
  },
]

function projectValue(p: (typeof PROJECTS)[number]): Record<string, unknown> {
  return {
    $type: PROJECT,
    type: "project",
    title: p.title,
    shortDescription: "Preview project.",
    createdAt: "2025-04-01T09:00:00.000Z",
    items: itemsFor(p.items),
  }
}

/** The viewer's projects, as the indexer's `UserProjects` connection. */
export function recordsProjectsConnection(): {
  totalCount: number
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const edges = PROJECTS.map((p, i) => ({
    cursor: `rec-proj-${i}`,
    node: {
      uri: `at://${MOCK_DID}/${PROJECT}/${p.rkey}`,
      cid: `bafyrecproj${i}00000000000000000000000000000000000000000000000`,
      did: MOCK_DID,
      ...projectValue(p),
      avatar: null,
      banner: null,
    },
  }))
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** One project in the `getRecord` envelope (the writer reads it first). */
export function recordsProjectRecord(rkey: string): {
  uri: string
  cid: string
  value: Record<string, unknown>
} | null {
  const i = PROJECTS.findIndex((p) => p.rkey === rkey)
  if (i < 0) return null
  return {
    uri: `at://${MOCK_DID}/${PROJECT}/${rkey}`,
    cid: `bafyrecproj${i}00000000000000000000000000000000000000000000000`,
    value: projectValue(PROJECTS[i]),
  }
}
