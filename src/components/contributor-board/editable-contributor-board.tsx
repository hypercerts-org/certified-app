"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Pencil, Settings, Share2, UserCog } from "lucide-react"
import Button from "@/components/ui/button"
import { buildAtUri } from "@/lib/urls"
import { invalidateActivity } from "@/hooks/use-activity"
import { putCertRecord } from "@/lib/atproto/cert"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import {
  createBoardRecord,
  createContributorInformation,
  putBoardRecord,
  boardImageUrl,
} from "@/lib/atproto/hyperboard"
import type { TreemapTile } from "@/lib/contributor-board/treemap"
import type { ClaimActivity, ActivityContributor, StrongRef } from "@/lib/atproto/activity-types"
import type { HypercertsUri } from "@/lib/atproto/types"
import {
  type BoardConfig,
  type BoardEntry,
  type BoardImage,
  type BoardWithRef,
  type ContributorConfig,
  type DisplayProfileRecord,
} from "@/lib/atproto/hyperboard-types"
import { ContributorBoard } from "./contributor-board"
import {
  AddEditContributorDialog,
  emptyDraft,
  type DraftContributor,
} from "./add-edit-contributor-dialog"
import { BoardSettingsDialog } from "./board-settings-dialog"
import { DisplayProfileDialog } from "./display-profile-dialog"
import { ShareEmbedDialog } from "./share-embed-dialog"

const ACTIVITY_NSID = "org.hypercerts.claim.activity"

interface EditableContributorBoardProps {
  did: string
  rkey: string
  /** full activity record (preserved on save) + its CID for the swap guard */
  activity: ClaimActivity
  activityCid: string
  /** the loaded board record + its location, or null when none exists yet */
  boardRef: BoardWithRef | null
  /** the resolved entries to seed the edit drafts from */
  initialEntries: BoardEntry[]
  config: BoardConfig
  /** the viewer's own displayProfile (for the appearance editor) */
  displayProfile: DisplayProfileRecord | null
  onDone: () => void
}

const smallImage = (blob: unknown): BoardImage => ({
  $type: "org.hypercerts.defs#smallImage",
  image: blob as never,
})
const uriUnion = (uri: string): HypercertsUri => ({
  $type: "org.hypercerts.defs#uri",
  uri,
})

function configKeyOf(c: ContributorConfig["contributor"]): string {
  return "uri" in c ? c.uri : c.identity
}

/** Seed an edit draft from a rendered entry + its raw board config (if any). */
function entryToDraft(
  entry: BoardEntry,
  cfg: ContributorConfig | undefined,
  boardDid: string,
  original: ActivityContributor | undefined,
): DraftContributor {
  return {
    key: entry.key,
    identity: entry.identity,
    isNew: false,
    weight: entry.value,
    displayName: entry.name,
    imagePreview: entry.imageUrl,
    imageBlob: null,
    imageRef: cfg?.image ?? null,
    videoUrl: cfg?.video && "uri" in cfg.video ? cfg.video.uri : "",
    hoverImageUrl: cfg?.hoverImage ? boardImageUrl(cfg.hoverImage, boardDid) ?? "" : "",
    hoverIframeUrl: cfg?.hoverIframeUrl ?? "",
    url: cfg?.url ?? "",
    override: cfg?.override ?? false,
    original,
  }
}

/** Project the current drafts to entries for live treemap rendering. */
function draftsToEntries(
  drafts: DraftContributor[],
  boardDid: string,
  circular: boolean,
): BoardEntry[] {
  return drafts.map((d, index) => ({
    key: d.key,
    index,
    identity: d.identity ?? { identity: d.displayName },
    contributorUri: d.identity && "uri" in d.identity ? d.identity.uri : null,
    did: null,
    name: d.displayName || "(unnamed)",
    value: Number.isFinite(d.weight) && d.weight > 0 ? d.weight : 1,
    imageUrl: d.imagePreview ?? boardImageUrl(d.imageRef, boardDid),
    videoUrl: d.videoUrl || null,
    hoverImageUrl: d.hoverImageUrl || null,
    hoverIframeUrl: d.hoverIframeUrl || null,
    url: d.url || null,
    circular,
  }))
}

/** Build a contributorConfig from a draft (null when nothing board-specific). */
function buildConfig(
  draft: DraftContributor,
  identity: ContributorConfig["contributor"],
  includeImageAndName: boolean,
): ContributorConfig | null {
  const cfg: ContributorConfig = { contributor: identity }
  let has = false
  if (includeImageAndName) {
    const img = draft.imageBlob ? smallImage(draft.imageBlob) : draft.imageRef ?? undefined
    if (img) {
      cfg.image = img
      has = true
    }
    if (draft.override && draft.displayName) {
      cfg.displayName = draft.displayName
      has = true
    }
  }
  if (draft.videoUrl) {
    cfg.video = uriUnion(draft.videoUrl)
    has = true
  }
  if (draft.hoverImageUrl) {
    cfg.hoverImage = uriUnion(draft.hoverImageUrl)
    has = true
  }
  if (draft.hoverIframeUrl) {
    cfg.hoverIframeUrl = draft.hoverIframeUrl
    has = true
  }
  if (draft.url) {
    cfg.url = draft.url
    has = true
  }
  if (has && draft.override) cfg.override = true
  return has ? cfg : null
}

/**
 * The edit experience for the Contributor Board: add/edit/remove contributors,
 * drag tiles to resize their weight, edit cosmetics, set your own appearance,
 * and share. Save writes the activity (contributors + weights) and the board
 * (config + contributorConfigs); new manual people get a contributorInformation
 * record. Own-repo only.
 */
export function EditableContributorBoard({
  did,
  rkey,
  activity,
  activityCid,
  boardRef,
  initialEntries,
  config: initialConfig,
  displayProfile,
  onDone,
}: EditableContributorBoardProps) {
  const configByKey = useMemo(() => {
    const m = new Map<string, ContributorConfig>()
    for (const c of boardRef?.board.contributorConfigs ?? []) {
      m.set(configKeyOf(c.contributor), c)
    }
    return m
  }, [boardRef])

  const [drafts, setDrafts] = useState<DraftContributor[]>(() =>
    initialEntries.map((entry) => {
      const cfg =
        (entry.contributorUri && configByKey.get(entry.contributorUri)) ||
        configByKey.get(
          "identity" in entry.identity ? entry.identity.identity : "",
        )
      const original = activity.contributors?.[entry.index]
      return entryToDraft(entry, cfg, did, original)
    }),
  )
  const [config, setConfig] = useState<BoardConfig>(initialConfig)
  // The activity CID we swap against. Advances after a successful activity
  // write so a retry (e.g. after a board-write failure) doesn't trip the swap.
  const [committedCid, setCommittedCid] = useState(activityCid)

  const [editingDraft, setEditingDraft] = useState<DraftContributor | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const circular = (config.imageShape ?? "circular") === "circular"
  const entries = useMemo(
    () => draftsToEntries(drafts, did, circular),
    [drafts, did, circular],
  )

  // ---- drag-to-resize ------------------------------------------------
  // Move/up listeners are created per drag so they capture this drag's start
  // values. The active teardown is stashed in a ref so an unmount mid-drag
  // (e.g. save completes and exits edit mode) removes the listeners too.
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const startResize = useCallback((e: React.PointerEvent, tile: TreemapTile) => {
    e.preventDefault()
    e.stopPropagation()
    const key = tile.entry.key
    const startWeight = tile.entry.value
    const startX = e.clientX
    const startY = e.clientY
    // Pointer capture keeps move/up flowing even if the pointer leaves the
    // window, so a fast drag can't strand the listeners.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* setPointerCapture unsupported — window listeners still work */
    }
    const move = (ev: PointerEvent) => {
      const delta = ev.clientX - startX + (ev.clientY - startY)
      const next = Math.max(1, Math.round(startWeight * (1 + delta / 200)))
      setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, weight: next } : d)))
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      dragCleanupRef.current = null
    }
    dragCleanupRef.current = up
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }, [])

  // ---- draft mutations ----------------------------------------------
  const upsertDraft = (draft: DraftContributor) => {
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.key === draft.key)
      if (i === -1) return [...ds, draft]
      const copy = [...ds]
      copy[i] = draft
      return copy
    })
    setEditingDraft(null)
  }

  const removeDraft = (key: string) =>
    setDrafts((ds) => ds.filter((d) => d.key !== key))

  // ---- save ----------------------------------------------------------
  // Three phases so a failure leaves a recoverable state:
  //   1. create contributorInformation for new people (then persist the refs
  //      into drafts so a retry never re-creates them),
  //   2. write the activity (contributors + weights) with a swap guard,
  //   3. write the board (config + contributorConfigs) at the new activity CID.
  const handleSave = async () => {
    setError(null)
    setSaving(true)

    const activityContributors: ActivityContributor[] = []
    const contributorConfigs: ContributorConfig[] = []
    const nextDrafts: DraftContributor[] = []

    // Phase 1 — identities.
    try {
      for (const draft of drafts) {
        const weight =
          Number.isFinite(draft.weight) && draft.weight > 0 ? draft.weight : 1

        if (draft.isNew || draft.identity === null) {
          const ref: StrongRef = await createContributorInformation(did, {
            identifier: draft.displayName,
            displayName: draft.displayName,
            image: draft.imageBlob ? smallImage(draft.imageBlob) : undefined,
          })
          activityContributors.push({
            contributorIdentity: ref,
            contributionWeight: String(weight),
          })
          const cfg = buildConfig(draft, ref, false)
          if (cfg) contributorConfigs.push(cfg)
          // The identity now exists — demote so a retry reuses it.
          nextDrafts.push({ ...draft, identity: ref, isNew: false, imageBlob: null })
        } else {
          const base = draft.original ?? { contributorIdentity: draft.identity }
          activityContributors.push({
            ...base,
            contributorIdentity: draft.identity,
            contributionWeight: String(weight),
          })
          const cfg = buildConfig(draft, draft.identity, true)
          if (cfg) contributorConfigs.push(cfg)
          nextDrafts.push(draft)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contributors")
      setSaving(false)
      return
    }
    // Persist created identities before any write that might fail.
    setDrafts(nextDrafts)

    // Phase 2 — activity (preserve all fields, replace contributors).
    let newCid: string
    try {
      const res = await putCertRecord(
        did,
        did,
        rkey,
        { ...activity, contributors: activityContributors },
        { swapRecord: committedCid },
      )
      newCid = res.cid
      setCommittedCid(newCid)
    } catch (err) {
      setError(
        err instanceof InvalidSwapError
          ? "This activity changed since you opened the editor — reload the page and try again."
          : err instanceof Error
            ? err.message
            : "Failed to save contributors",
      )
      setSaving(false)
      return
    }

    // Phase 3 — board, pointing at the just-written activity version.
    try {
      const boardBody = {
        subject: { uri: buildAtUri(did, ACTIVITY_NSID, rkey), cid: newCid },
        config,
        contributorConfigs,
        createdAt: boardRef?.board.createdAt ?? new Date().toISOString(),
      }
      if (boardRef) {
        await putBoardRecord(did, boardRef.rkey, boardBody, boardRef.cid)
      } else {
        await createBoardRecord(did, boardBody)
      }
    } catch {
      setError(
        "Contributors were saved, but the board styling failed to save. Click Save board to retry.",
      )
      setSaving(false)
      return
    }

    invalidateActivity(did, rkey)
    onDone()
  }

  return (
    <section className="cert-detail__section">
      <div className="contributor-board__toolbar">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditingDraft(emptyDraft())}
        >
          <Plus size={15} /> Add contributor
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} /> Settings
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAppearanceOpen(true)}>
          <UserCog size={15} /> My appearance
        </Button>
        {rkey ? (
          <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)}>
            <Share2 size={15} /> Share
          </Button>
        ) : null}
        <span className="contributor-board__toolbar-spacer" />
        <Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" loading={saving} onClick={handleSave}>
          Save board
        </Button>
      </div>

      {error ? (
        <p className="mb-2 text-body-sm text-[var(--color-error)]">{error}</p>
      ) : null}
      <p className="contributor-board__status">
        Drag the bottom-right corner of a tile to resize its weight, or click the
        pencil to edit a contributor.
      </p>

      <ContributorBoard
        entries={entries}
        config={config}
        boardDid={did}
        editing
        emptyMessage="No contributors yet — add the first one."
        renderTileOverlay={(tile) => (
          <div
            className="contributor-tile-overlay"
            style={{
              left: tile.x,
              top: tile.y,
              width: tile.width,
              height: tile.height,
            }}
          >
            <span className="contributor-tile-overlay__edit">
              <Button
                size="icon"
                variant="secondary"
                aria-label={`Edit ${tile.entry.name}`}
                onClick={() => {
                  const d = drafts.find((x) => x.key === tile.entry.key)
                  if (d) setEditingDraft(d)
                }}
              >
                <Pencil size={13} />
              </Button>
            </span>
            <span
              className="contributor-tile-overlay__resize"
              role="presentation"
              aria-hidden="true"
              onPointerDown={(e) => startResize(e, tile)}
            />
          </div>
        )}
      />

      {editingDraft ? (
        <AddEditContributorDialog
          initial={editingDraft}
          onClose={() => setEditingDraft(null)}
          onSave={upsertDraft}
          onRemove={
            drafts.some((d) => d.key === editingDraft.key)
              ? () => {
                  removeDraft(editingDraft.key)
                  setEditingDraft(null)
                }
              : undefined
          }
        />
      ) : null}

      {settingsOpen ? (
        <BoardSettingsDialog
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSave={(c) => {
            setConfig(c)
            setSettingsOpen(false)
          }}
        />
      ) : null}

      {appearanceOpen ? (
        <DisplayProfileDialog
          did={did}
          initial={displayProfile}
          onClose={() => setAppearanceOpen(false)}
          onSaved={() => setAppearanceOpen(false)}
        />
      ) : null}

      {shareOpen && rkey ? (
        <ShareEmbedDialog did={did} rkey={rkey} onClose={() => setShareOpen(false)} />
      ) : null}
    </section>
  )
}

export default EditableContributorBoard
