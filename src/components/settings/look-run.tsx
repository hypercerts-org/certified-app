"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import Banner from "@/components/ui/banner"
import FormDialog from "@/components/ui/form-dialog"
import Textarea from "@/components/ui/textarea"
import type { SiteDesignResponse } from "@/app/api/looks/site-design/route"
import type { SiteCapture, SiteCaptureResponse } from "@/lib/look/site-capture-types"
import {
  addCustomLook,
  replaceCustomLook,
  restorePreviousLook,
  useClaudeKey,
  type CustomLook,
} from "@/lib/look/custom-looks"
import type { CustomLookId } from "@/lib/look/looks"
import { LookGenerationError, LOOK_MODEL_NAME, generateLookSpec, toLookError } from "@/lib/look/generate-look"
import { emptyDesign, normalizeSiteUrl } from "@/lib/look/site-design"

/** The made style a new version is for; null while making a new style. */
type Target = { id: CustomLookId; name: string } | null

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; host: string; target: Target }
  | { kind: "designing"; host: string; target: Target }
  | { kind: "done"; name: string; host: string; target: Target; version?: number }
  | { kind: "error"; message: string; field: boolean; target: Target }

type Task =
  | { kind: "new"; url: URL }
  | { kind: "refresh"; look: CustomLook; request: string }

/** One style being made at a time, new or a new version: read the site,
 *  ask Claude, keep the result. Leaving the page stops it. */
function useLookRunState(apiKey: string) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const busy = phase.kind === "reading" || phase.kind === "designing"

  const start = async (task: Task): Promise<boolean> => {
    if (abortRef.current) return false
    const target: Target = task.kind === "refresh" ? { id: task.look.id, name: task.look.spec.name } : null
    const url = task.kind === "new" ? task.url : normalizeSiteUrl(task.look.url || task.look.source)
    if (!url) {
      setPhase({ kind: "error", message: "This style has no website address to read again.", field: false, target })
      return false
    }
    const host = url.hostname.replace(/^www\./, "")
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase({ kind: "reading", host, target })
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
      setPhase({ kind: "designing", host, target })
      if (task.kind === "new") {
        const spec = await generateLookSpec({ apiKey, design, capture, signal: ctrl.signal })
        const look = addCustomLook(spec, host, url.toString())
        setPhase({ kind: "done", name: look.spec.name, host, target })
      } else {
        const spec = await generateLookSpec({
          apiKey,
          design,
          capture,
          previous: task.look.spec,
          request: task.request,
          signal: ctrl.signal,
        })
        const look = replaceCustomLook(task.look.id, spec)
        if (!look) throw new LookGenerationError("unknown", "That style was removed in the meantime.")
        setPhase({ kind: "done", name: look.spec.name, host, target, version: look.version })
      }
      return true
    } catch (err) {
      const error = toLookError(err)
      setPhase(error.code === "aborted" ? { kind: "idle" } : { kind: "error", message: error.message, field: false, target })
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
    fieldError: (message: string) => setPhase({ kind: "error", message, field: true, target: null }),
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

/** What is happening now: reading, making, made (with a way back after a
 *  new version), or what went wrong. The gallery shows the runs for new
 *  versions (`refresh`), the maker the runs for new styles. */
export function RunStatus({
  statusId,
  refresh,
  spaced = false,
}: {
  statusId: string
  refresh: boolean
  /** Space above, only while there is something to say. */
  spaced?: boolean
}) {
  const { run } = useLookRun()
  const { phase } = run
  const shown = phase.kind !== "idle" && (phase.target !== null) === refresh ? phase : null
  return (
    <div className={`flex flex-col gap-3 ${spaced && shown ? "mt-3" : ""}`}>
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
            {refresh ? (
              <>
                {" "}
                <button
                  type="button"
                  className="inline cursor-pointer border-0 bg-transparent p-0 text-[var(--fg-primary)] underline underline-offset-2"
                  onClick={run.stop}
                >
                  Stop
                </button>
              </>
            ) : null}
          </p>
        ) : null}
        {shown?.kind === "done" ? (
          <p className="m-0 text-[var(--fg-primary)]">
            {shown.target ? (
              <>
                Made version {shown.version} of “{shown.name}” and switched to it.{" "}
                <button
                  type="button"
                  className="inline cursor-pointer border-0 bg-transparent p-0 text-[var(--fg-primary)] underline underline-offset-2"
                  onClick={() => {
                    restorePreviousLook(shown.target!.id)
                    run.clear()
                  }}
                >
                  Back to the previous version
                </button>
              </>
            ) : (
              <>
                Made “{shown.name}” from {shown.host} and switched to it. It’s with the other styles above.
              </>
            )}
          </p>
        ) : null}
      </div>
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
