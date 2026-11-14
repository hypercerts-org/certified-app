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

/** One version of a made style. */
export interface LookVersion {
  /** 1, 2, 3 … in the order they were made. */
  version: number
  createdAt: string
  /** What the person asked for ("" for the first, or a fresh variation). */
  request: string
  spec: LookSpec
}

export interface CustomLook {
  id: CustomLookId
  /** The site it was made from, e.g. "stripe.com". */
  source: string
  /** The address it was read from, for making a new version. */
  url: string
  createdAt: string
  /** The version on show; a new one is numbered after the highest. */
  version: number
  /** The version on show's spec. */
  spec: LookSpec
  /** Every version kept, oldest first, the one on show among them. */
  versions: LookVersion[]
}

/** Older versions drop off past this; the one on show is always kept. */
export const MAX_LOOK_VERSIONS = 12

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

// Stored, each style's site images are kept once, in `images`, and its
// versions point at them ("#image-0" …): the versions of a style mostly
// share one image, and each can be 100,000 characters.
const IMAGE_REF = /^#image-(\d+)$/

function withImages(raw: unknown, images: readonly unknown[]): unknown {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  const assets = r?.assets && typeof r.assets === "object" ? (r.assets as Record<string, unknown>) : null
  const img = assets?.idImage && typeof assets.idImage === "object" ? (assets.idImage as Record<string, unknown>) : null
  const ref = typeof img?.data === "string" ? IMAGE_REF.exec(img.data) : null
  if (!r || !img || !ref) return raw
  return { ...r, assets: { ...assets, idImage: { ...img, data: images[Number(ref[1])] } } }
}

function toStored(look: CustomLook) {
  const images: string[] = []
  const versions = look.versions.map((v) => {
    const img = v.spec.assets?.idImage
    if (!img) return v
    let at = images.indexOf(img.data)
    if (at === -1) at = images.push(img.data) - 1
    return { ...v, spec: { ...v.spec, assets: { ...v.spec.assets, idImage: { ...img, data: `#image-${at}` } } } }
  })
  const { spec: _spec, ...rest } = look
  void _spec
  return { ...rest, versions, images }
}

function parseVersions(e: Record<string, unknown>): LookVersion[] {
  const images = Array.isArray(e.images) ? e.images : []
  const out: LookVersion[] = []
  const add = (version: unknown, raw: unknown, createdAt: unknown, request: unknown) => {
    const n = typeof version === "number" && version >= 1 ? Math.floor(version) : 1
    if (out.some((v) => v.version === n)) return
    try {
      out.push({
        version: n,
        createdAt: typeof createdAt === "string" ? createdAt : "",
        request: typeof request === "string" ? request.slice(0, 600) : "",
        spec: normalizeLookSpec(withImages(raw, images)),
      })
    } catch {
      // A broken version is skipped.
    }
  }
  if (Array.isArray(e.versions)) {
    for (const v of e.versions) {
      if (v && typeof v === "object") {
        const r = v as Record<string, unknown>
        add(r.version, r.spec, r.createdAt, r.request)
      }
    }
  } else {
    // Stored before versions were kept: the one on show and the one before.
    const shown = typeof e.version === "number" && e.version >= 1 ? Math.floor(e.version) : 1
    add(shown, e.spec, e.createdAt, "")
    if (e.previous) add(shown > 1 ? shown - 1 : shown + 1, e.previous, "", "")
  }
  return out.sort((a, b) => a.version - b.version).slice(-MAX_LOOK_VERSIONS)
}

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
    const versions = parseVersions(e)
    if (!versions.length) continue
    const shown = versions.find((v) => v.version === e.version) ?? versions[versions.length - 1]
    const source = typeof e.source === "string" ? e.source.slice(0, 253) : ""
    out.push({
      id: e.id,
      source,
      url: (normalizeSiteUrl(typeof e.url === "string" ? e.url : source) ?? null)?.toString() ?? "",
      createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
      version: shown.version,
      spec: shown.spec,
      versions,
    })
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

const isQuotaError = (err: unknown) =>
  err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")

/** Without the oldest version not on show (of the style with the most
 *  versions); null when every style is down to the one on show. */
function withoutOldestVersion(looks: readonly CustomLook[]): CustomLook[] | null {
  let at = -1
  for (let i = 0; i < looks.length; i++) {
    if (looks[i].versions.length > 1 && (at === -1 || looks[i].versions.length > looks[at].versions.length)) at = i
  }
  if (at === -1) return null
  const look = looks[at]
  const drop = look.versions.find((v) => v.version !== look.version)!
  const next = looks.slice()
  next[at] = { ...look, versions: look.versions.filter((v) => v !== drop) }
  return next
}

function writeCustomLooks(looks: readonly CustomLook[]) {
  const css = compileCustomLooksCss(looks)
  let kept: readonly CustomLook[] | null = looks
  while (kept) {
    try {
      if (kept.length) {
        window.localStorage.setItem(CUSTOM_LOOKS_STORAGE_KEY, JSON.stringify(kept.map(toStored)))
        window.localStorage.setItem(CUSTOM_LOOKS_CSS_STORAGE_KEY, css)
      } else {
        window.localStorage.removeItem(CUSTOM_LOOKS_STORAGE_KEY)
        window.localStorage.removeItem(CUSTOM_LOOKS_CSS_STORAGE_KEY)
      }
      break
    } catch (err) {
      // Storage full: older versions give way, oldest first. Blocked: the
      // style still applies until reload.
      kept = isQuotaError(err) ? withoutOldestVersion(kept) : null
    }
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
  const createdAt = new Date().toISOString()
  const look: CustomLook = {
    id: newId(),
    source,
    url,
    createdAt,
    version: 1,
    spec,
    versions: [{ version: 1, createdAt, request: "", spec }],
  }
  const kept = parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY)).slice(0, MAX_CUSTOM_LOOKS - 1)
  writeCustomLooks([look, ...kept])
  applyLook(look.id)
  return look
}

/** A new version of a made style, in its tile (same id), numbered after
 *  the highest and put on show; every earlier one is kept to go back to.
 *  Switches the page to it. */
export function replaceCustomLook(id: CustomLookId, spec: LookSpec, request = ""): CustomLook | null {
  const looks = parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY))
  const at = looks.findIndex((l) => l.id === id)
  if (at === -1) return null
  const old = looks[at]
  const version = Math.max(...old.versions.map((v) => v.version)) + 1
  const versions = [...old.versions, { version, createdAt: new Date().toISOString(), request, spec }].slice(-MAX_LOOK_VERSIONS)
  const next: CustomLook = { ...old, version, spec, versions }
  looks[at] = next
  writeCustomLooks(looks)
  applyLook(id)
  return next
}

/** Put one of a made style's versions on show, and switch the page to it. */
export function showLookVersion(id: CustomLookId, version: number): CustomLook | null {
  const looks = parseCustomLooks(read(CUSTOM_LOOKS_STORAGE_KEY))
  const at = looks.findIndex((l) => l.id === id)
  const chosen = at === -1 ? undefined : looks[at].versions.find((v) => v.version === version)
  if (!chosen) return null
  const next: CustomLook = { ...looks[at], version, spec: chosen.spec }
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
