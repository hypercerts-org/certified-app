"use client"

import { useEffect, useMemo, useState } from "react"
import { Flag, Globe, LandPlot, Map as MapIcon, MapPin } from "lucide-react"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SegmentedControl from "@/components/ui/segmented-control"
import StatRow from "@/components/ui/stat-row"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { usePageTitle } from "@/lib/navbar-context"
import { useUrlParam } from "@/hooks/use-url-param"
import { useMapDataset } from "@/hooks/use-map-dataset"
import { buildModel } from "@/lib/map/model"
import MapBrowse from "./map/map-browse"
import MapCountries from "./map/map-countries"
import MapSites from "./map/map-sites"
import type { MapKind } from "./map/world-map"

const VIEWS = [
  {
    value: "places",
    label: "Places",
    icon: MapPin,
    blurb: "Everything at one spot is one mark, drawn as exactly as it was recorded. The list shows what's on the map.",
  },
  {
    value: "countries",
    label: "Countries",
    icon: Flag,
    blurb: "Each country shaded by how much happens there, including places that only name the country.",
  },
  {
    value: "sites",
    label: "Sites",
    icon: LandPlot,
    blurb: "The boundaries people drew around the land they work on, each at its own scale.",
  },
] as const

type View = (typeof VIEWS)[number]["value"]

const MIN_HEIGHT = 420
const MAX_HEIGHT = 1100

/**
 * Network → Map (`/map`): where the work across the network happens. Three
 * views of the same places (`?view=`): Places, a map with a list of what is
 * in view; Countries, the overview; Sites, the drawn boundaries. Each has
 * the flat map / globe switch (`?projection=globe`, as on /funding).
 */
export default function MapPage() {
  usePageTitle("Map")
  const { data, error, retry } = useMapDataset()
  const model = useMemo(() => (data ? buildModel(data) : null), [data])
  const [viewParam, setViewParam] = useUrlParam("view", { defaultValue: "places" })
  const view: View = VIEWS.some((v) => v.value === viewParam) ? (viewParam as View) : "places"
  const [projection, setProjection] = useUrlParam("projection", { defaultValue: "flat" })
  const kind: MapKind = projection === "globe" ? "globe" : "flat"
  const [height, setHeight] = useState(600)

  // Phones start with a shorter map, so the list below it is in reach.
  useEffect(() => {
    if (window.matchMedia("(max-width: 799px)").matches) setHeight(MIN_HEIGHT)
  }, [])

  const stats = useMemo(() => {
    if (!model) return null
    const countries = new Set<string>()
    for (const a of model.activities) if (a.place?.country) countries.add(a.place.country)
    return {
      activities: model.activities.length,
      projects: model.projects.filter((p) => p.place).length,
      countries: countries.size,
      areas: model.places.filter((p) => p.prec === "area").length,
    }
  }, [model])

  const active = VIEWS.find((v) => v.value === view)!
  const resize = { min: MIN_HEIGHT, max: MAX_HEIGHT, onResize: setHeight }

  return (
    <PageContainer className="map-page">
      <PageHeader title="Map" description="Where the work across the Certified network happens." />
      {error && !model ? (
        <ErrorMessage title="The map didn't load" message={error} onRetry={retry} />
      ) : !model || !stats ? (
        <div className="map-loading" role="status">
          <LoadingSpinner size="md" />
          <p>Gathering every place on the network. The first load can take up to a minute.</p>
        </div>
      ) : (
        <>
          <StatRow
            aria-label="On the map"
            className="map-page__stats"
            items={[
              { label: `of ${model.totals.activities.toLocaleString("en-US")} activities have a place`, value: stats.activities.toLocaleString("en-US") },
              { label: "projects have a place", value: stats.projects.toLocaleString("en-US") },
              { label: "countries with an activity", value: stats.countries.toLocaleString("en-US") },
              { label: "drawn areas", value: stats.areas.toLocaleString("en-US") },
            ]}
          />
          <div className="map-page__toolbar">
            <SegmentedControl
              aria-label="View"
              value={view}
              onValueChange={(v) => setViewParam(v)}
              options={VIEWS.map((v) => ({ value: v.value, label: v.label, icon: <v.icon size={15} strokeWidth={1.75} /> }))}
            />
            <SegmentedControl
              aria-label="Projection"
              size="sm"
              value={kind}
              onValueChange={(v) => setProjection(v)}
              options={[
                { value: "flat", label: "Flat", icon: <MapIcon size={14} strokeWidth={1.75} /> },
                { value: "globe", label: "Globe", icon: <Globe size={14} strokeWidth={1.75} /> },
              ]}
            />
          </div>
          <p className="map-page__blurb">{active.blurb}</p>
          <section className="map-page__view" aria-label={active.label}>
            {view === "places" ? (
              <MapBrowse model={model} kind={kind} height={height} resize={resize} />
            ) : view === "countries" ? (
              <MapCountries model={model} kind={kind} height={height} resize={resize} />
            ) : (
              <MapSites model={model} kind={kind} height={height} resize={resize} />
            )}
          </section>
          {model.partial ? (
            <p className="map-page__note">
              Some places couldn&apos;t be read completely this time, so a few may be missing.
            </p>
          ) : null}
        </>
      )}
    </PageContainer>
  )
}
