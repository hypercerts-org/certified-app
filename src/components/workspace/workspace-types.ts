import type {
  WorkspaceCounts,
  WorkspaceLexicon,
  NetworkActor,
} from "@/lib/atproto/workspace"

export type WorkspaceScope =
  | { kind: "network" }
  | { kind: "actor"; did: string }

export interface WorkspaceLayoutProps {
  actors: NetworkActor[]
  actorsLoading: boolean
  scope: WorkspaceScope
  counts: WorkspaceCounts
  countsLoading: boolean
  lexicon: WorkspaceLexicon | null
  onSetScope: (scope: WorkspaceScope) => void
  onSetLexicon: (lex: WorkspaceLexicon | null) => void
}

export function findActor(
  actors: NetworkActor[],
  did: string,
): NetworkActor | null {
  return actors.find((a) => a.did === did) ?? null
}
