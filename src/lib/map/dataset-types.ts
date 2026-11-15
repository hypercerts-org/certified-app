/**
 * The /map dataset, built on the server (`build-dataset.ts`) and served by
 * `/api/map/dataset`. Every place the network can show, with the activities,
 * projects and organizations that point to it. Records labelled test or
 * draft are left out, as the rest of the app does by default.
 *
 * References between records are indexes into the arrays here.
 */

/** How exactly a place was recorded. */
export type Precision =
  /** Coordinates to a few metres (GPS, a Plus Code). */
  | "site"
  /** A boundary someone drew. */
  | "area"
  /** A circle around a guess, or coordinates rounded to a kilometre or more. */
  | "approx"
  /** Only says which country (a country's name, a country code, whole degrees). */
  | "country"

export const PRECISIONS: readonly Precision[] = ["site", "area", "approx", "country"]

export interface MapAccount {
  did: string
  name?: string
  /** An https URL, or the content id of an image in the account's
   *  repository (build the URL with `buildAvatarUrlFromCid`). */
  avatar?: string
}

/** One polygon: an outer ring, then holes; each ring [lng, lat] pairs,
 *  wound the way d3-geo expects (clockwise outer rings). */
export type MapPolygon = [number, number][][]

/** Optional fields are left out when empty, to keep the payload small. */
export interface MapPlace {
  lng: number
  lat: number
  prec: Precision
  /** The name the owner gave it, without a leading Plus Code. */
  name?: string
  /** Who saved it (index into `accounts`). */
  account: number
  /** Index into `countries`; absent at sea or just off a coast. */
  country?: number
  /** Drawn areas: index into `areas`. */
  area?: number
  /** Drawn areas: size in km². */
  km2?: number
  /** Approximate places: how far off the point may be, in km. */
  radiusKm?: number
}

export interface MapActivity {
  /** Record key; the record is at://{accounts[account].did}/org.hypercerts.claim.activity/{rkey}. */
  rkey: string
  title: string | null
  account: number
  /** Its own place (index into `places`), or -1. */
  place: number
  /** Further places it names. */
  more: number[]
  /** The project it belongs to (index into `projects`), or -1. */
  project: number
  /** Start date, else when it was created (YYYY-MM-DD), or null. */
  date: string | null
}

export interface MapProject {
  /** Record key; the record is at://{accounts[account].did}/org.hypercerts.collection/{rkey}. */
  rkey: string
  title: string | null
  account: number
  place: number
}

export interface MapOrg {
  account: number
  /** Where the organization is based. */
  place: number
}

export interface MapDataset {
  generatedAt: string
  /** Some sources couldn't be read completely this time. */
  partial: boolean
  accounts: MapAccount[]
  /** Country names (Natural Earth), referenced by `MapPlace.country`. */
  countries: string[]
  places: MapPlace[]
  /** Drawn areas: each a list of polygons. */
  areas: MapPolygon[][]
  /** Activities with a place of their own or through their project. */
  activities: MapActivity[]
  /** Projects with a place, and projects of included activities. */
  projects: MapProject[]
  /** Organizations that say where they are based. */
  orgs: MapOrg[]
  /** Places nothing points to (index into `places`). */
  unused: number[]
  totals: {
    /** Every activity not labelled test or draft, placed or not. */
    activities: number
    projects: number
    orgs: number
    /** Location records that couldn't be placed (links, 0,0, unreadable). */
    unplaceable: number
  }
}
