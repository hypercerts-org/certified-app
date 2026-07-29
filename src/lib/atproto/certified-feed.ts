import { parseAtUri } from "@/lib/urls"

export const CERTIFIED_FEED_PATH =
  "/xrpc/app.certified.feed.beta.getFeed"

export type HomeFeedSource = "indexer" | "service"
export type OrganizationQuality =
  | "high-quality"
  | "standard"
  | "draft"
  | "likely-test"

export interface GetCertifiedFeedInput {
  viewerDid: string
  trustedEvaluators?: readonly string[]
  organizationQuality?: {
    allowed: readonly OrganizationQuality[]
    includeUnrated: boolean
  }
  limit?: number
  cursor?: string
  kinds?: readonly string[]
}

export type CertifiedFeedImage =
  | { kind: "uri"; uri: string }
  | { kind: "blob"; cid: string }

export interface CertifiedFeedActor {
  did: string
  handle: string | null
  displayName: string | null
  avatar: CertifiedFeedImage | null
}

interface ViewBase {
  $type: string
}

export interface ActivityFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#activityView"
  title: string
  shortDescription: string | null
  image: CertifiedFeedImage | null
  createdAt: string | null
  startDate: string | null
  endDate: string | null
  locationCount: number
}

export interface CollectionFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#collectionView"
  collectionType: string | null
  title: string
  shortDescription: string | null
  image: CertifiedFeedImage | null
  createdAt: string | null
  itemCount: number
}

export interface EndorsementFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#endorsementView"
  subject: CertifiedFeedActor
  createdAt: string | null
}

export interface EvaluationFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#evaluationView"
  summary: string | null
  createdAt: string | null
  target: CertifiedFeedStrongRef | null
}

export interface MeasurementFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#measurementView"
  metric: string | null
  createdAt: string | null
  target: CertifiedFeedStrongRef | null
}

export interface HyperboardFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#hyperboardView"
  createdAt: string | null
}

export interface UpdateFeedView extends ViewBase {
  $type: "app.certified.feed.beta.defs#updateView"
  title: string | null
  shortDescription: string | null
  image: CertifiedFeedImage | null
  createdAt: string | null
  target: CertifiedFeedStrongRef | null
}

export interface UnknownFeedView extends ViewBase {
  unknown: true
}

export type CertifiedFeedView =
  | ActivityFeedView
  | CollectionFeedView
  | EndorsementFeedView
  | EvaluationFeedView
  | MeasurementFeedView
  | HyperboardFeedView
  | UpdateFeedView
  | UnknownFeedView

export interface CertifiedFeedStrongRef {
  uri: string
  cid: string
}

export interface CertifiedFeedItem {
  id: string
  kind: string
  subject: CertifiedFeedStrongRef
  feedTimestamp: string
  actor: CertifiedFeedActor
  view: CertifiedFeedView
}

export interface CertifiedFeedPage {
  items: CertifiedFeedItem[]
  cursor: string | null
}

const KNOWN_ERROR_CODES = new Set([
  "InvalidRequest",
  "TrustedEvaluatorsTooLarge",
  "InvalidKind",
  "InvalidCursor",
  "InternalError",
])

const KNOWN_VIEW_TYPES = new Set([
  "app.certified.feed.beta.defs#activityView",
  "app.certified.feed.beta.defs#collectionView",
  "app.certified.feed.beta.defs#endorsementView",
  "app.certified.feed.beta.defs#evaluationView",
  "app.certified.feed.beta.defs#measurementView",
  "app.certified.feed.beta.defs#hyperboardView",
  "app.certified.feed.beta.defs#updateView",
])

const EXPECTED_VIEW_BY_KIND: Readonly<Record<string, string>> = {
  "cert.create": "app.certified.feed.beta.defs#activityView",
  "collection.create": "app.certified.feed.beta.defs#collectionView",
  "project.created_with_cert": "app.certified.feed.beta.defs#collectionView",
  "endorsement.award": "app.certified.feed.beta.defs#endorsementView",
  "evaluation.create": "app.certified.feed.beta.defs#evaluationView",
  "measurement.create": "app.certified.feed.beta.defs#measurementView",
  "hyperboard.create": "app.certified.feed.beta.defs#hyperboardView",
  "update.create": "app.certified.feed.beta.defs#updateView",
}

const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+(?::[A-Za-z0-9._:%-]+)*$/
const HANDLE_CHARS_RE = /^[A-Za-z0-9.-]+$/
const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,255})$/
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/
const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/
const HTTP_DATE_RE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/
const MAX_ERROR_BODY = 64 * 1024
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_483_647
const MAX_DATE_MS = 8_640_000_000_000_000

export class CertifiedFeedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryAt: number | null = null,
  ) {
    super(message)
    this.name = "CertifiedFeedError"
  }
}

export function parseHomeFeedSource(
  raw = process.env.NEXT_PUBLIC_HOME_FEED_SOURCE,
): HomeFeedSource {
  if (raw === undefined || raw === "") return "indexer"
  if (raw === "indexer" || raw === "service") return raw
  throw new Error(
    `NEXT_PUBLIC_HOME_FEED_SOURCE is ${JSON.stringify(raw)}; use "indexer" for the rollback path or "service" for the Certified Feed Service.`,
  )
}

export function parseCertifiedFeedServiceOrigin(
  raw = process.env.NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL is missing while the home feed uses the service source; set it to the feed service HTTPS origin, then rebuild the app.",
    )
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(
      `NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL is not a valid URL: ${JSON.stringify(raw)}. Set an exact feed service origin such as https://feed.example.com.`,
    )
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL must be an exact origin without credentials, a path, query, or fragment; move those parts out of the configured value.",
    )
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(nodeEnv !== "production" && url.protocol === "http:" && loopback)) {
    throw new Error(
      "NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL must use HTTPS; non-production HTTP is allowed only for localhost, 127.0.0.1, or [::1].",
    )
  }
  return url.origin
}

export function certifiedFeedImageUrl(
  image: CertifiedFeedImage | null,
  ownerDid: string,
): string | null {
  if (!image) return null
  if (image.kind === "uri") return image.uri
  return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(ownerDid)}&cid=${encodeURIComponent(image.cid)}`
}

export async function fetchCertifiedFeed(
  input: GetCertifiedFeedInput,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<CertifiedFeedPage> {
  const origin = options.origin ?? parseCertifiedFeedServiceOrigin()
  const response = await fetch(`${origin}${CERTIFIED_FEED_PATH}`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
  })
  const text = await response.text()
  if (!response.ok) {
    const parsed = safeErrorBody(text)
    const code = parsed && KNOWN_ERROR_CODES.has(parsed.error) ? parsed.error : null
    const message =
      response.status < 500 && code && parsed && parsed.message.length <= 500
        ? parsed.message
        : response.status === 429
          ? "The feed service is rate limiting requests. Wait before trying again."
          : "The feed service request failed. Try again; if it keeps failing, contact support."
    throw new CertifiedFeedError(
      message,
      response.status,
      code,
      response.status === 429
        ? parseRetryAt(response.headers.get("Retry-After"))
        : null,
    )
  }
  if (text.length > MAX_ERROR_BODY * 8) {
    throw contractError("response body is unexpectedly large")
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw contractError("response is not valid JSON")
  }
  return parseCertifiedFeedResponse(json)
}

export function parseCertifiedFeedResponse(value: unknown): CertifiedFeedPage {
  const root = requireObject(value, "response")
  if (!Array.isArray(root.items)) throw contractError("response.items must be an array")
  const cursor = optionalString(root.cursor, "response.cursor", 4096)
  if (cursor === "") throw contractError("response.cursor must not be empty")
  return {
    items: root.items.map((item, index) => parseItem(item, index)),
    cursor: cursor ?? null,
  }
}

function parseItem(value: unknown, index: number): CertifiedFeedItem {
  const path = `response.items[${index}]`
  const item = requireObject(value, path)
  const id = requiredString(item.id, `${path}.id`, 4096)
  const subject = parseStrongRef(item.subject, `${path}.subject`)
  const parsedSource = parseAtUri(subject.uri)
  if (!parsedSource || !isDid(parsedSource.did)) {
    throw contractError(`${path}.subject.uri must be an at:// URI with a DID authority`)
  }
  if (id !== subject.uri) throw contractError(`${path}.id must equal ${path}.subject.uri`)
  const kind = requiredString(item.kind, `${path}.kind`, 64)
  const feedTimestamp = requiredDate(item.feedTimestamp, `${path}.feedTimestamp`)
  const actor = parseActor(item.actor, `${path}.actor`, parsedSource.did, true)
  const viewObject = requireObject(item.view, `${path}.view`)
  const viewType = requiredString(viewObject.$type, `${path}.view.$type`, 128)
  const expected = EXPECTED_VIEW_BY_KIND[kind]
  let view: CertifiedFeedView
  if (!expected || !KNOWN_VIEW_TYPES.has(viewType)) {
    view = { $type: viewType, unknown: true }
  } else {
    if (viewType !== expected) {
      throw contractError(`${path} kind ${JSON.stringify(kind)} requires view ${JSON.stringify(expected)}, not ${JSON.stringify(viewType)}`)
    }
    view = parseKnownView(viewObject, viewType, `${path}.view`)
  }
  return { id, kind, subject, feedTimestamp, actor, view }
}

function parseKnownView(
  view: Record<string, unknown>,
  type: string,
  path: string,
): CertifiedFeedView {
  switch (type) {
    case "app.certified.feed.beta.defs#activityView":
      return {
        $type: type,
        title: requiredString(view.title, `${path}.title`),
        shortDescription: nullableString(view.shortDescription, `${path}.shortDescription`),
        image: parseImage(view.image, new Set(["uri", "smallImage"]), `${path}.image`),
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
        startDate: nullableDate(view.startDate, `${path}.startDate`),
        endDate: nullableDate(view.endDate, `${path}.endDate`),
        locationCount: requiredNonnegativeInteger(view.locationCount, `${path}.locationCount`),
      }
    case "app.certified.feed.beta.defs#collectionView":
      return {
        $type: type,
        collectionType: nullableString(view.collectionType, `${path}.collectionType`),
        title: requiredString(view.title, `${path}.title`),
        shortDescription: nullableString(view.shortDescription, `${path}.shortDescription`),
        image: parseImage(view.image, new Set(["uri", "smallImage", "largeImage"]), `${path}.image`),
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
        itemCount: requiredNonnegativeInteger(view.itemCount, `${path}.itemCount`),
      }
    case "app.certified.feed.beta.defs#endorsementView":
      return {
        $type: type,
        subject: parseActor(view.subject, `${path}.subject`, null, false),
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
      }
    case "app.certified.feed.beta.defs#evaluationView":
      return {
        $type: type,
        summary: nullableString(view.summary, `${path}.summary`),
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
        target: nullableStrongRef(view.target, `${path}.target`),
      }
    case "app.certified.feed.beta.defs#measurementView":
      return {
        $type: type,
        metric: nullableString(view.metric, `${path}.metric`),
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
        target: nullableStrongRef(view.target, `${path}.target`),
      }
    case "app.certified.feed.beta.defs#hyperboardView":
      return {
        $type: type,
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
      }
    case "app.certified.feed.beta.defs#updateView":
      return {
        $type: type,
        title: nullableString(view.title, `${path}.title`),
        shortDescription: nullableString(view.shortDescription, `${path}.shortDescription`),
        image: parseImage(view.image, new Set(["uri", "smallBlob"]), `${path}.image`),
        createdAt: nullableDate(view.createdAt, `${path}.createdAt`),
        target: nullableStrongRef(view.target, `${path}.target`),
      }
    default:
      return { $type: type, unknown: true }
  }
}

function parseActor(
  value: unknown,
  path: string,
  fallbackDid: string | null,
  allowFallback: boolean,
): CertifiedFeedActor {
  const actor = requireObject(value, path)
  const rawDid = optionalString(actor.did, `${path}.did`, 256)
  const did = rawDid ?? (allowFallback ? fallbackDid : null)
  if (!did || !isDid(did)) {
    throw contractError(`${path}.did is missing or invalid and cannot be derived safely`)
  }
  if (allowFallback && fallbackDid && rawDid && rawDid !== fallbackDid) {
    throw contractError(
      `${path}.did must match the source AT-URI authority ${JSON.stringify(fallbackDid)}`,
    )
  }
  return {
    did,
    handle: nullableHandle(actor.handle, `${path}.handle`),
    displayName: nullableString(actor.displayName, `${path}.displayName`, 640),
    avatar: parseImage(actor.avatar, new Set(["uri", "smallImage"]), `${path}.avatar`),
  }
}

function parseImage(
  value: unknown,
  allowed: ReadonlySet<"uri" | "smallImage" | "largeImage" | "smallBlob">,
  path: string,
): CertifiedFeedImage | null {
  if (value === undefined || value === null) return null
  const image = requireObject(value, path)
  const type = requiredString(image.$type, `${path}.$type`, 128)
  const variant =
    type === "org.hypercerts.defs#uri"
      ? "uri"
      : type === "org.hypercerts.defs#smallImage"
        ? "smallImage"
        : type === "org.hypercerts.defs#largeImage"
          ? "largeImage"
          : type === "org.hypercerts.defs#smallBlob"
            ? "smallBlob"
            : null
  if (!variant) return null
  if (!allowed.has(variant)) throw contractError(`${path} does not allow ${type}`)
  if (variant === "uri") {
    return { kind: "uri", uri: requiredUri(image.uri, `${path}.uri`) }
  }
  const blob = requireObject(
    variant === "smallBlob" ? image.blob : image.image,
    `${path}.${variant === "smallBlob" ? "blob" : "image"}`,
  )
  if (blob.$type !== "blob") throw contractError(`${path} blob must have $type "blob"`)
  const ref = requireObject(blob.ref, `${path}.ref`)
  const cid = requiredCid(ref.$link, `${path}.ref.$link`)
  requiredString(blob.mimeType, `${path}.mimeType`, 255)
  requiredNonnegativeInteger(blob.size, `${path}.size`)
  return { kind: "blob", cid }
}

function parseStrongRef(value: unknown, path: string): CertifiedFeedStrongRef {
  const ref = requireObject(value, path)
  const uri = requiredString(ref.uri, `${path}.uri`, 4096)
  const parsed = parseAtUri(uri)
  if (!parsed || !isDid(parsed.did)) {
    throw contractError(`${path}.uri must be an at:// URI with a DID authority`)
  }
  return {
    uri,
    cid: requiredCid(ref.cid, `${path}.cid`),
  }
}

function nullableStrongRef(value: unknown, path: string): CertifiedFeedStrongRef | null {
  return value === undefined || value === null ? null : parseStrongRef(value, path)
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw contractError(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, path: string, max = 10_000): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw contractError(`${path} must be a non-empty string no longer than ${max} characters`)
  }
  return value
}

function optionalString(value: unknown, path: string, max = 10_000): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.length > max) {
    throw contractError(`${path} must be a string no longer than ${max} characters when present`)
  }
  return value
}

function nullableString(value: unknown, path: string, max = 10_000): string | null {
  return optionalString(value, path, max) ?? null
}

function nullableHandle(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null
  const handle = requiredString(value, path, 253)
  const labels = handle.split(".")
  if (
    !HANDLE_CHARS_RE.test(handle) ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-"),
    ) ||
    /^\d+$/.test(labels.at(-1) ?? "")
  ) {
    throw contractError(`${path} must be a valid AT Protocol handle`)
  }
  return handle
}

function requiredUri(value: unknown, path: string): string {
  const uri = requiredString(value, path, 4096)
  if (!URI_SCHEME_RE.test(uri) || /[\u0000-\u0020\u007f]/.test(uri)) {
    throw contractError(`${path} must be a valid absolute URI`)
  }
  try {
    new URL(uri)
  } catch {
    throw contractError(`${path} must be a valid absolute URI`)
  }
  return uri
}

function requiredCid(value: unknown, path: string): string {
  const cid = requiredString(value, path, 256)
  if (!CID_RE.test(cid)) {
    throw contractError(`${path} must be a valid CID`)
  }
  return cid
}

function requiredDate(value: unknown, path: string): string {
  const date = requiredString(value, path, 64)
  const match = RFC3339_RE.exec(date)
  if (!match || !isValidRfc3339Parts(match) || Number.isNaN(Date.parse(date))) {
    throw contractError(`${path} must be an RFC3339 datetime`)
  }
  return date
}

function isValidRfc3339Parts(match: RegExpExecArray): boolean {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[8] === undefined ? 0 : Number(match[8])
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9])
  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  return day >= 1 && day <= daysInMonth[month - 1]
}

function nullableDate(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : requiredDate(value, path)
}

function requiredNonnegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw contractError(`${path} must be a non-negative integer`)
  }
  return value as number
}

function isDid(value: string): boolean {
  return value.length <= 256 && DID_RE.test(value)
}

function contractError(detail: string): CertifiedFeedError {
  return new CertifiedFeedError(
    `The feed service returned an invalid response: ${detail}. Verify the deployed feed-service contract and retry.`,
    502,
    "InvalidResponse",
  )
}

function safeErrorBody(text: string): { error: string; message: string } | null {
  if (text.length === 0 || text.length > MAX_ERROR_BODY) return null
  try {
    const value = JSON.parse(text) as unknown
    const object = requireObject(value, "error response")
    if (typeof object.error !== "string" || typeof object.message !== "string") return null
    return { error: object.error, message: object.message }
  } catch {
    return null
  }
}

function parseRetryAt(value: string | null): number | null {
  if (!value) return null
  const now = Date.now()
  if (/^\d+$/.test(value)) {
    const delta = Number(value)
    const delay = delta * 1000
    if (
      !Number.isSafeInteger(delta) ||
      !Number.isSafeInteger(delay) ||
      delay < 0 ||
      delay > MAX_BROWSER_TIMER_DELAY_MS ||
      now > MAX_DATE_MS - delay
    ) {
      return null
    }
    return now + delay
  }
  if (!HTTP_DATE_RE.test(value)) return null
  const date = Date.parse(value)
  if (
    !Number.isFinite(date) ||
    Math.abs(date) > MAX_DATE_MS ||
    new Date(date).toUTCString() !== value
  ) {
    return null
  }
  const retryAt = Math.max(now, date)
  return retryAt - now <= MAX_BROWSER_TIMER_DELAY_MS ? retryAt : null
}
