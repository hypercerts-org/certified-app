"use client"

import { useEffect, useId, useRef, useState } from "react"
import { RefreshCw, Trash2 } from "lucide-react"
import Banner from "@/components/ui/banner"
import Button from "@/components/ui/button"
import FormDialog from "@/components/ui/form-dialog"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import type { SiteDesignResponse } from "@/app/api/looks/site-design/route"
import {
  addCustomLook,
  maskKey,
  removeCustomLook,
  replaceCustomLook,
  restorePreviousLook,
  useClaudeKey,
  useCustomLooks,
  type CustomLook,
} from "@/lib/look/custom-looks"
import type { CustomLookId } from "@/lib/look/looks"
import { LookGenerationError, LOOK_MODEL_NAME, generateLookSpec, toLookError, verifyClaudeKey } from "@/lib/look/generate-look"
import { normalizeSiteUrl } from "@/lib/look/site-design"

const KEYS_PAGE = "https://platform.claude.com/settings/keys"

function KeyForm({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = value.trim()
    if (!key) {
      setError("Paste your Claude API key.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await verifyClaudeKey(key)
      setValue("")
      onSave(key)
    } catch (err) {
      setError(toLookError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="max-w-[28rem]">
        <Input
          type="password"
          label="Claude API key"
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          helperText="Kept in this browser and sent only to Anthropic, never to Certified."
        />
      </div>
      <p className="m-0 max-w-measure text-body-sm text-[var(--fg-muted)] text-pretty">
        Make a key in the{" "}
        <a href={KEYS_PAGE} target="_blank" rel="noreferrer" className="text-[var(--fg-primary)] underline underline-offset-2">
          Claude Console
        </a>
        . Saving checks it with Anthropic first, which costs nothing.
      </p>
      <div>
        <Button type="submit" size="sm" loading={busy}>
          Save key
        </Button>
      </div>
    </form>
  )
}

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; host: string; refresh: boolean }
  | { kind: "designing"; host: string; refresh: boolean }
  | { kind: "done"; name: string; host: string; refreshedId?: CustomLookId; version?: number }
  | { kind: "error"; message: string; field: boolean }

type Task =
  | { kind: "new"; url: URL }
  | { kind: "refresh"; look: CustomLook; request: string }

/** One style being made at a time, new or a new version: read the site,
 *  ask Claude, keep the result. Leaving the page stops it. */
function useLookRun(apiKey: string) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const busy = phase.kind === "reading" || phase.kind === "designing"

  const start = async (task: Task): Promise<boolean> => {
    if (abortRef.current) return false
    const url = task.kind === "new" ? task.url : normalizeSiteUrl(task.look.url || task.look.source)
    if (!url) {
      setPhase({ kind: "error", message: "This style has no website address to read again.", field: false })
      return false
    }
    const host = url.hostname.replace(/^www\./, "")
    const refresh = task.kind === "refresh"
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase({ kind: "reading", host, refresh })
    try {
      const res = await fetch(`/api/looks/site-design?url=${encodeURIComponent(url.toString())}`, {
        signal: ctrl.signal,
      })
      const body = (await res.json().catch(() => ({}))) as SiteDesignResponse
      if (!res.ok || !body.design) {
        throw new LookGenerationError("site", body.error ?? "Couldn't read that website.")
      }
      setPhase({ kind: "designing", host, refresh })
      if (task.kind === "new") {
        const spec = await generateLookSpec({ apiKey, design: body.design, signal: ctrl.signal })
        const look = addCustomLook(spec, host, url.toString())
        setPhase({ kind: "done", name: look.spec.name, host })
      } else {
        const spec = await generateLookSpec({
          apiKey,
          design: body.design,
          previous: task.look.spec,
          request: task.request,
          signal: ctrl.signal,
        })
        const look = replaceCustomLook(task.look.id, spec)
        if (!look) throw new LookGenerationError("unknown", "That style was removed in the meantime.")
        setPhase({ kind: "done", name: look.spec.name, host, refreshedId: look.id, version: look.version })
      }
      return true
    } catch (err) {
      const error = toLookError(err)
      setPhase(error.code === "aborted" ? { kind: "idle" } : { kind: "error", message: error.message, field: false })
      return false
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }

  return {
    phase,
    busy,
    start,
    stop: () => abortRef.current?.abort(),
    fieldError: (message: string) => setPhase({ kind: "error", message, field: true }),
    clearFieldError: () => setPhase((p) => (p.kind === "error" && p.field ? { kind: "idle" } : p)),
    clear: () => setPhase({ kind: "idle" }),
  }
}

type LookRun = ReturnType<typeof useLookRun>

function SiteForm({ run, statusId }: { run: LookRun; statusId: string }) {
  const [site, setSite] = useState("")
  const { phase, busy } = run

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const url = normalizeSiteUrl(site)
    if (!url) {
      run.fieldError("Enter a website address, like example.com.")
      return
    }
    if (await run.start({ kind: "new", url })) setSite("")
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-describedby={statusId}>
      <div className="max-w-[28rem]">
        <Input
          type="text"
          inputMode="url"
          label="Website"
          placeholder="example.com"
          autoComplete="url"
          spellCheck={false}
          value={site}
          disabled={busy}
          onChange={(e) => {
            setSite(e.target.value)
            run.clearFieldError()
          }}
          error={phase.kind === "error" && phase.field ? phase.message : undefined}
        />
      </div>
      <div className="flex gap-2">
        {busy ? (
          <>
            <Button type="button" size="sm" loading>
              {phase.kind !== "idle" && "refresh" in phase && phase.refresh ? "Making new version" : "Making style"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={run.stop}>
              Stop
            </Button>
          </>
        ) : (
          <Button type="submit" size="sm">
            Make style
          </Button>
        )}
      </div>
    </form>
  )
}

/** What is happening now, under the form: reading, making, made (with a
 *  way back after a new version), or what went wrong. */
function RunStatus({ run, statusId }: { run: LookRun; statusId: string }) {
  const { phase } = run
  return (
    <>
      <div id={statusId} role="status" aria-live="polite" className="text-body-sm text-[var(--fg-muted)]">
        {phase.kind === "reading" ? <p className="m-0">Reading {phase.host}…</p> : null}
        {phase.kind === "designing" ? (
          <p className="m-0">
            {LOOK_MODEL_NAME} is making {phase.refresh ? "a new version of the style" : "a style"} from {phase.host}.
            This can take a minute or two.
          </p>
        ) : null}
        {phase.kind === "done" ? (
          <p className="m-0 text-[var(--fg-primary)]">
            {phase.refreshedId ? (
              <>
                Made version {phase.version} of “{phase.name}” and switched to it.{" "}
                <button
                  type="button"
                  className="inline cursor-pointer border-0 bg-transparent p-0 text-[var(--fg-primary)] underline underline-offset-2"
                  onClick={() => {
                    restorePreviousLook(phase.refreshedId!)
                    run.clear()
                  }}
                >
                  Back to the previous version
                </button>
              </>
            ) : (
              <>
                Made “{phase.name}” from {phase.host} and switched to it. It’s with the other styles above.
              </>
            )}
          </p>
        ) : null}
      </div>
      {phase.kind === "error" && !phase.field ? <Banner variant="error">{phase.message}</Banner> : null}
    </>
  )
}

/** "New version of X": what Claude should do differently, optional. */
function RefreshDialog({
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

function MadeLooks({ run, apiKey }: { run: LookRun; apiKey: string | null }) {
  const looks = useCustomLooks()
  const headingId = useId()
  const [refreshing, setRefreshing] = useState<CustomLook | null>(null)
  if (!looks.length) return null
  return (
    <div className="flex flex-col gap-2">
      <h4 id={headingId} className="m-0 text-body-sm font-medium text-[var(--fg-primary)]">
        Made in this browser
      </h4>
      <ul aria-labelledby={headingId} className="m-0 flex list-none flex-col divide-y divide-[var(--border-subtle)] p-0">
        {looks.map((look) => (
          <li key={look.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-sm text-[var(--fg-primary)]">{look.spec.name}</span>
              <span className="truncate text-caption text-[var(--fg-muted)]">
                From {look.source}
                {look.version > 1 ? ` · version ${look.version}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`New version of ${look.spec.name}`}
                disabled={!apiKey || run.busy}
                onClick={() => setRefreshing(look)}
              >
                <RefreshCw size={16} aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${look.spec.name}`}
                disabled={run.busy}
                onClick={() => removeCustomLook(look.id)}
              >
                <Trash2 size={16} aria-hidden />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {refreshing ? (
        <RefreshDialog
          look={refreshing}
          onClose={() => setRefreshing(null)}
          onSubmit={(request) => {
            const look = refreshing
            setRefreshing(null)
            void run.start({ kind: "refresh", look, request })
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Settings → Appearance → Make a style from a website (experimental): the
 * person's Claude API key, a website, and the styles made so far. The
 * website is read by Certified's server (/api/looks/site-design); Claude is
 * called from this browser with the person's key (generate-look.ts).
 */
export default function CustomLookMaker() {
  const [apiKey, setApiKey] = useClaudeKey()
  const run = useLookRun(apiKey ?? "")
  const statusId = useId()
  return (
    <div className="flex flex-col gap-6">
      {apiKey ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm font-medium text-[var(--fg-primary)]">Claude API key</span>
              <span className="truncate text-caption text-[var(--fg-muted)]">{maskKey(apiKey)} · in this browser only</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => setApiKey(null)} disabled={run.busy}>
              Remove key
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <SiteForm run={run} statusId={statusId} />
            <RunStatus run={run} statusId={statusId} />
          </div>
        </>
      ) : (
        <KeyForm onSave={setApiKey} />
      )}
      <MadeLooks run={run} apiKey={apiKey} />
    </div>
  )
}
