"use client"

import { useCallback, useSyncExternalStore } from "react"
import { buildCustomLookCss, normalizeLookSpec, type LookSpec } from "./custom-look-spec"
import { normalizeSiteUrl } from "./site-design"
import {
  CUSTOM_LOOKS_CSS_STORAGE_KEY,
  CUSTOM_LOOKS_STORAGE_KEY,
  CUSTOM_LOOKS_STYLE_ID,
  DEFAULT_LOOK,
  applyLook,
  currentLook,
  isCustomLookId,
  type CustomLookId,
} from "./looks"

/**
 * Styles made from websites, kept in this browser (localStorage), like the
 * choice of style itself. Each is a checked spec (custom-look-spec.ts); the
 * CSS for all of them is compiled on every change and kept beside them, so
 * the before-paint script (LOOK_INIT_SCRIPT) can put it in place without
 * running any of this.
 *
 * Also the person's Claude API key, which only this browser holds: it is
 * sent to Anthropic and nowhere else (generate-look.ts).
 */

export interface CustomLook {
  id: CustomLookId
  /** The site it was made from, e.g. "stripe.com". */
  source: string
  /** The address it was read from, for making a new version. */
  url: string
  createdAt: string
  /** 1 for the first version, counting up with each new one. */
  version: number
  spec: LookSpec
  /** The version before this one, to go back to (one step). */
  previous?: LookSpec
}

/** Older ones drop off when a new one would make more. */
export const MAX_CUSTOM_LOOKS = 8

export const CLAUDE_KEY_STORAGE_KEY = "certified_claude_api_key"

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === CUSTOM_LOOKS_STORAGE_KEY ||
      e.key === CLAUDE_KEY_STORAGE_KEY ||
      e.key === null
    ) {
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function notify() {
  for (const listener of listeners) listener()
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

// ------------------------------------------------------------ made styles

/** Parse what's stored, keeping only entries that still check out. */
export function parseCustomLooks(raw: string | null): CustomLook[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: CustomLook[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    if (!isCustomLookId(e.id) || out.some((l) => l.id === e.id)) continue
    try {
      const source = typeof e.source === "string" ? e.source.slice(0, 253) : ""
      let previous: LookSpec | undefined
      try {
        previous = e.previous ? normalizeLookSpec(e.previous) : undefined
      } catch {
        previous = undefined
      }
      out.push({
        id: e.id,
        source,
        url: (normalizeSiteUrl(typeof e.url === "string" ? e.url : source) ?? null)?.toString() ?? "",
        createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
        version: typeof e.version === "number" && e.version >= 1 ? Math.floor(e.version) : 1,
        spec: normalizeLookSpec(e.spec),
        ...(previous ? { previous } : {}),
      })
    } catch {
      // A broken entry is skipped, not fatal.
    }
    if (out.length === MAX_CUSTOM_LOOKS) break
  }
  return out
}

/** The CSS for every made style, as the <style> element carries it. */
export function compileCustomLooksCss(looks: readonly CustomLook[]): string {
  return looks.map((l) => `/* ${l.id} */\n${buildCustomLookCss(l.id, l.spec)}`).join("\n\n")
}

/** Put `css` in the page's made-styles <style> element (or remove it). */
export function injectCustomLooksCss(css: string) {
  let el = document.getElementById(CUSTOM_LOOKS_STYLE_ID)
  if (!css) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement("style")
    el.id = CUSTOM_LOOKS_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = css
}

function writeCustomLooks(looks: readonly CustomLook[]) {
  const css = compileCustomLooksCss(looks)
  try {
    if (looks.length) {
      window.localStorage.setItem(CUSTOM_LOOKS_STORAGE_KEY, JSON.stringify(looks))
      window.localStorage.setItem(CUSTOM_LOOKS_CSS_STORAGE_KEY, css)
    } else {
      window.localStorage.removeItem(CUSTOM_LOOKS_STORAGE_KEY)
      window.localStorage.removeItem(CUSTOM_LOOKS_CSS_STORAGE_KEY)
    }
  } catch {
    // Storage full or blocked: the style still applies until reload.
  }
  injectCustomLooksCss(css)
  notify()
}

function newId(): CustomLookId {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `custom-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`
}

/** Keep a newly made style (newest first) and switch the page to it. */
export function addCustomLook(spec: LookSpec, source: string, url = `https://${source}/`): CustomLook {
  const look: CustomLook = { id: newId(), source, url, createdAt: new Date().toISOString(), version: 1, spec }
  const kept = parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY)).slice(0, MAX_CUSTOM_LOOKS - 1)
  writeCustomLooks([look, ...kept])
  applyLook(look.id)
  return look
}

/** A new version of a made style, in its place (same tile, same id); the
 *  one it replaces is kept to go back to. Switches the page to it. */
export function replaceCustomLook(id: CustomLookId, spec: LookSpec): CustomLook | null {
  const looks = parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY))
  const at = looks.findIndex((l) => l.id === id)
  if (at === -1) return null
  const old = looks[at]
  const next: CustomLook = { ...old, spec, previous: old.spec, version: old.version + 1 }
  looks[at] = next
  writeCustomLooks(looks)
  applyLook(id)
  return next
}

/** Swap a made style back to its previous version (and forward again). */
export function restorePreviousLook(id: CustomLookId): CustomLook | null {
  const looks = parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY))
  const at = looks.findIndex((l) => l.id === id)
  const old = looks[at]
  if (at === -1 || !old.previous) return null
  const next: CustomLook = { ...old, spec: old.previous, previous: old.spec, version: Math.max(1, old.version - 1) }
  looks[at] = next
  writeCustomLooks(looks)
  applyLook(id)
  return next
}

/** Forget a made style; if it is on, go back to Neutral. */
export function removeCustomLook(id: CustomLookId) {
  if (currentLook() === id) applyLook(DEFAULT_LOOK)
  writeCustomLooks(parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY)).filter((l) => l.id !== id))
}

// A stable snapshot per stored string (useSyncExternalStore needs one).
let lastRaw: string | null = null
let lastLooks: CustomLook[] = []
const NO_LOOKS: CustomLook[] = []

function looksSnapshot(): CustomLook[] {
  const raw = read(CUSTOM_LOOKS_STORAGE_KEY)
  if (raw !== lastRaw) {
    lastRaw = raw
    lastLooks = parseCustomLooks(raw)
  }
  return lastLooks
}

/** The styles made in this browser, newest first. */
export function useCustomLooks(): CustomLook[] {
  return useSyncExternalStore(subscribe, looksSnapshot, () => NO_LOOKS)
}

// ---------------------------------------------------------------- the key

/** The Claude API key kept in this browser, and a setter (null forgets). */
export function useClaudeKey(): [string | null, (key: string | null) => void] {
  const key = useSyncExternalStore(
    subscribe,
    () => read(CLAUDE_KEY_STORAGE_KEY),
    () => null,
  )
  const set = useCallback((next: string | null) => {
    try {
      if (next) window.localStorage.setItem(CLAUDE_KEY_STORAGE_KEY, next)
      else window.localStorage.removeItem(CLAUDE_KEY_STORAGE_KEY)
    } catch {
      // Storage blocked: nothing to keep.
    }
    notify()
  }, [])
  return [key, set]
}

/** "sk-ant-…a1b2": enough to recognise a key without showing it. */
export function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : "…"
}
