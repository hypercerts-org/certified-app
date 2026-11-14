"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import AppDialog, { AppDialogBody, AppDialogHeader } from "@/components/ui/app-dialog"
import Banner from "@/components/ui/banner"
import Button from "@/components/ui/button"
import FormDialog, { DIALOG_FOOTER_ACTIONS_CLASS } from "@/components/ui/form-dialog"
import Textarea from "@/components/ui/textarea"
import type { SiteDesignResponse } from "@/app/api/looks/site-design/route"
import type { SiteCapture, SiteCaptureResponse } from "@/lib/look/site-capture-types"
import {
  addCustomLook,
  replaceCustomLook,
  showLookVersion,
  useClaudeKey,
  type CustomLook,
} from "@/lib/look/custom-looks"
import type { CustomLookId } from "@/lib/look/looks"
import { LookGenerationError, LOOK_MODEL_NAME, generateLookSpec, toLookError } from "@/lib/look/generate-look"
import { emptyDesign, normalizeSiteUrl } from "@/lib/look/site-design"

/** Where a run was started, so where its progress and result show: under
 *  the gallery (New version on a made style's tile) or under the maker
 *  (a new style, or a new version asked for from its result). */
export type Slot = "gallery" | "maker"

/** The made style a new version is for; null while making a new style. */
type Target = { id: CustomLookId; name: string } | null

type Done = {
  kind: "done"
  slot: Slot
  id: CustomLookId
  name: string
  host: string
  /** A new version (with the way back), not a new style. */
  refreshed: boolean
  version: number
  /** The version it was made from, to go back to. */
  from: number
  /** Claude's own summary, and what the app took back from it. */
  notes: string[]
  caveats: string[]
}

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; slot: Slot; host: string; target: Target }
  | { kind: "designing"; slot: Slot; host: string; target: Target }
  | Done
  | { kind: "error"; slot: Slot; message: string; field: boolean }

type Task = { slot: Slot } & ({ kind: "new"; url: URL } | { kind: "refresh"; look: CustomLook; request: string })

/** One style being made at a time, new or a new version: read the site,
 *  ask Claude, keep the result. Leaving the page stops it. */
function useLookRunState(apiKey: string) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const busy = phase.kind === "reading" || phase.kind === "designing"

  const start = async (task: Task): Promise<boolean> => {
    if (abortRef.current) return false
    const { slot } = task
    const target: Target = task.kind === "refresh" ? { id: task.look.id, name: task.look.spec.name } : null
    const url = task.kind === "new" ? task.url : normalizeSiteUrl(task.look.url || task.look.source)
    if (!url) {
      setPhase({ kind: "error", slot, message: "This style has no website address to read again.", field: false })
      return false
    }
    const host = url.hostname.replace(/^www\./, "")
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase({ kind: "reading", slot, host, target })
    const site = encodeURIComponent(url.toString())
    // Screenshots are a bonus: without them (not set up, or the site
    // wouldn't render) the style comes from the CSS digest alone.
    const capturing: Promise<SiteCapture | null> = fetch(`/api/looks/site-capture?url=${site}`, {
      signal: ctrl.signal,
    })
      .then(async (res) => (res.ok ? (((await res.json()) as SiteCaptureResponse).capture ?? null) : null))
      .catch(() => null)
    try {
      const res = await fetch(`/api/looks/site-design?url=${site}`, { signal: ctrl.signal })
      const body = (await res.json().catch(() => ({}))) as SiteDesignResponse
      const capture = await capturing
      // Some sites refuse plain fetches but render for a browser: the
      // screenshots and rendered styles are then enough on their own.
      const design = res.ok && body.design ? body.design : capture ? emptyDesign(capture.url) : null
      if (!design) throw new LookGenerationError("site", body.error ?? "Couldn't read that website.")
      setPhase({ kind: "designing", slot, host, target })
      const { spec, caveats } = await generateLookSpec({
        apiKey,
        design,
        capture,
        ...(task.kind === "refresh" ? { previous: task.look.spec, request: task.request } : {}),
        signal: ctrl.signal,
      })
      const look =
        task.kind === "new"
          ? addCustomLook(spec, host, url.toString())
          : replaceCustomLook(task.look.id, spec, task.request)
      if (!look) throw new LookGenerationError("unknown", "That style was removed in the meantime.")
      setPhase({
        kind: "done",
        slot,
        id: look.id,
        name: look.spec.name,
        host,
        refreshed: task.kind === "refresh",
        version: look.version,
        from: task.kind === "refresh" ? task.look.version : look.version,
        notes: look.spec.notes,
        caveats,
      })
      return true
    } catch (err) {
      const error = toLookError(err)
      setPhase(error.code === "aborted" ? { kind: "idle" } : { kind: "error", slot, message: error.message, field: false })
      return false
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }

  return {
    phase,
    busy,
    /** The made style a new version is being made for, while one is. */
    refreshingId: busy && phase.target ? phase.target.id : null,
    start,
    stop: () => abortRef.current?.abort(),
    fieldError: (message: string) => setPhase({ kind: "error", slot: "maker", message, field: true }),
    clearFieldError: () => setPhase((p) => (p.kind === "error" && p.field ? { kind: "idle" } : p)),
    clear: () => setPhase({ kind: "idle" }),
  }
}

export type LookRun = ReturnType<typeof useLookRunState>

type LookRunContextValue = {
  apiKey: string | null
  setApiKey: (key: string | null) => void
  run: LookRun
}

const LookRunContext = createContext<LookRunContextValue | null>(null)

/** Settings → Appearance: the key and the one run shared by the style
 *  gallery (a new version of a made style) and the maker (a new style). */
export function LookRunProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useClaudeKey()
  const run = useLookRunState(apiKey ?? "")
  return <LookRunContext.Provider value={{ apiKey, setApiKey, run }}>{children}</LookRunContext.Provider>
}

export function useLookRun(): LookRunContextValue {
  const ctx = useContext(LookRunContext)
  if (!ctx) throw new Error("useLookRun must be used inside a LookRunProvider")
  return ctx
}

const LINK_BUTTON =
  "inline cursor-pointer border-0 bg-transparent p-0 text-[var(--fg-primary)] underline underline-offset-2"

/** What was made, in a dialog of its own: Claude's notes on what it took
 *  and where it shows, anything the app took back from them, and a word
 *  on where to ask for changes (New version on the tile) once the person
 *  has looked around. After a new version, the way back to the one it
 *  was made from. */
function MadeDialog({ done }: { done: Done }) {
  const { run } = useLookRun()
  const lookAround = useRef<HTMLButtonElement>(null)
  const close = () => run.clear()
  const title = done.refreshed ? `Made version ${done.version} of “${done.name}”` : `Made “${done.name}”`
  return (
    <AppDialog ariaLabel={title} onClose={close} maxWidth={520} autoFocusFirst initialFocusRef={lookAround}>
      <AppDialogHeader title={title} onClose={close} />
      <AppDialogBody>
        <div className="mb-6 flex flex-col gap-4 text-body-sm text-[var(--fg-secondary)]">
          <p className="m-0">
            {done.refreshed
              ? `It’s on now. Version ${done.from} is still there.`
              : `Made from ${done.host}, and it’s on now.`}
          </p>
          {done.notes.length ? (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-caption text-[var(--fg-muted)]">From {LOOK_MODEL_NAME}</p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[var(--fg-primary)]">
                {done.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {done.caveats.map((caveat) => (
            <p key={caveat} className="m-0 text-pretty text-[var(--fg-muted)]">
              {caveat}
            </p>
          ))}
          <p className="m-0 text-pretty">
            Look around the app to see it in place. If something isn’t right, press New version on its tile and tell{" "}
            {LOOK_MODEL_NAME} what to change, in your own words. Every version is kept, so you can always go back.
          </p>
        </div>
        <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
          {done.refreshed ? (
            <Button
              variant="ghost"
              onClick={() => {
                showLookVersion(done.id, done.from)
                close()
              }}
            >
              Back to version {done.from}
            </Button>
          ) : null}
          <Button ref={lookAround} onClick={close}>
            Look around
          </Button>
        </div>
      </AppDialogBody>
    </AppDialog>
  )
}

/** What is happening now, where the run was started (`slot`): reading,
 *  making, or what went wrong; once made, MadeDialog. */
export function RunStatus({
  statusId,
  slot,
  spaced = false,
}: {
  statusId: string
  slot: Slot
  /** Space above, only while there is something to say. */
  spaced?: boolean
}) {
  const { run } = useLookRun()
  const { phase } = run
  const shown = phase.kind !== "idle" && phase.slot === slot ? phase : null
  return (
    <div className={`flex flex-col gap-3 ${spaced && shown && shown.kind !== "done" ? "mt-3" : ""}`}>
      <div id={statusId} role="status" aria-live="polite" className="text-body-sm text-[var(--fg-muted)]">
        {shown?.kind === "reading" || shown?.kind === "designing" ? (
          <p className="m-0">
            {shown.kind === "reading" ? (
              <>Reading {shown.host} and taking screenshots…</>
            ) : (
              <>
                {LOOK_MODEL_NAME} is making {shown.target ? `a new version of “${shown.target.name}”` : "a style"} from{" "}
                {shown.host}. This can take a minute or two.
              </>
            )}
            {/* A new style has Stop beside the maker's button; a new version
                has it here. */}
            {shown.target ? (
              <>
                {" "}
                <button type="button" className={LINK_BUTTON} onClick={run.stop}>
                  Stop
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {shown?.kind === "done" ? <MadeDialog done={shown} /> : null}
      {shown?.kind === "error" && !shown.field ? <Banner variant="error">{shown.message}</Banner> : null}
    </div>
  )
}

/** "New version of X": what Claude should do differently, optional. */
export function RefreshDialog({
  look,
  onClose,
  onSubmit,
}: {
  look: CustomLook
  onClose: () => void
  onSubmit: (request: string) => void
}) {
  const [request, setRequest] = useState("")
  return (
    <FormDialog
      title={`New version of ${look.spec.name}`}
      onClose={onClose}
      onSubmit={() => onSubmit(request.trim())}
      submitLabel="Make new version"
      maxWidth={480}
      autoFocusFirst
    >
      {/* FormDialog's footer brings no space of its own: 24px to the buttons. */}
      <div className="mb-6 flex flex-col gap-4">
        <p className="m-0 text-body-sm text-[var(--fg-secondary)] text-pretty">
          {LOOK_MODEL_NAME} reads {look.source} again and makes a new version from this one. You can go back to
          this version afterwards.
        </p>
        <Textarea
          label="What should change? (optional)"
          rows={4}
          maxLength={600}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          helperText="For example: use the green from their buttons, make the ID card darker, more like their homepage hero. Leave it empty for a fresh variation."
        />
      </div>
    </FormDialog>
  )
}
