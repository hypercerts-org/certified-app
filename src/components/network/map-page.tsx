"use client"

import { useEffect, useMemo, useState } from "react"
import { Filter as FilterIcon, Globe, Map as MapIcon } from "lucide-react"
import Button from "@/components/ui/button"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SegmentedControl from "@/components/ui/segmented-control"
import Skeleton from "@/components/ui/skeleton"
import StatRow from "@/components/ui/stat-row"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import { usePageTitle } from "@/lib/navbar-context"
import { useUrlParam } from "@/hooks/use-url-param"
import { useMapDataset } from "@/hooks/use-map-dataset"
import { buildModel } from "@/lib/map/model"
import MapBrowse, { MapLayerChips, layerCountsOf } from "./map/map-browse"
import MapCountries from "./map/map-countries"
import MapSites from "./map/map-sites"
import { useMapLayers } from "./map/use-map-layers"
import type { MapKind } from "./map/world-map"
import NetworkFiltersSheet from "./network-filters-sheet"

const VIEWS = [
  {
    value: "places",
    label: "Places",
    blurb: "Everything at one spot is one mark, drawn as exactly as it was recorded. The list shows what's on the map.",
  },
  {
    value: "countries",
    label: "Countries",
    blurb: "Each country shaded by how much happens there, including places that only name the country.",
  },
  {
    value: "sites",
    label: "Sites",
    blurb: "The boundaries people drew around the land they work on, each at its own scale.",
  },
] as const

type View = (typeof VIEWS)[number]["value"]

const MIN_HEIGHT = 420
const MAX_HEIGHT = 1100

const fmt = (n: number) => n.toLocaleString("en-US")

/**
 * Network → Map (`/map`): where the work across the network happens. Three
 * views of the same places (`?view=`), as tabs under the title: Places, a
 * map with a list of what is in view; Countries, the overview; Sites, the
 * drawn boundaries. Each has the flat map / globe switch beside the map
 * (`?projection=globe`, as on /funding). On phones the totals shrink to one
 * line and the Places layer chips move into the Filters sheet, so the map
 * comes first. While the places load, the page keeps its final shape: the
 * tabs, the totals as skeletons and the main box with the message inside.
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
  // The Places layer chips: one state for the chips in the page and the
  // phone Filters sheet.
  const layerState = useMapLayers()
  // The slot in the bar where a view (Sites) puts its phone Filters button.
  const [filtersHost, setFiltersHost] = useState<HTMLSpanElement | null>(null)

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
  const layerCounts = useMemo(() => (model ? layerCountsOf(model) : null), [model])

  const active = VIEWS.find((v) => v.value === view)!
  const resize = { min: MIN_HEIGHT, max: MAX_HEIGHT, onResize: setHeight }

  return (
    <PageContainer className="map-page">
      <PageHeader title="Map" description="Where the work across the Certified network happens." />
      <Tabs value={view} onChange={(v) => setViewParam(v)} className="map-page__tabs">
        <div className="map-page__tab-scroll">
          <TabList aria-label="View" className="map-page__tab-list">
            {VIEWS.map((v) => (
              <Tab key={v.value} value={v.value}>
                {v.label}
              </Tab>
            ))}
          </TabList>
        </div>
        <TabPanel value={view} className="map-page__panel">
          {error && !model ? (
            <ErrorMessage title="The map didn't load" message={error} onRetry={retry} />
          ) : (
            <>
              {/* From 800px the totals as a row; phones get one line. Both
                  hold their place while the data loads. */}
              <div className="map-page__stats">
                <StatRow
                  aria-label="On the map"
                  items={[
                    {
                      label: model ? `of ${fmt(model.totals.activities)} activities have a place` : "activities have a place",
                      value: stats ? fmt(stats.activities) : null,
                      loading: !stats,
                    },
                    { label: "projects have a place", value: stats ? fmt(stats.projects) : null, loading: !stats },
                    { label: "countries with an activity", value: stats ? fmt(stats.countries) : null, loading: !stats },
                    { label: "drawn areas", value: stats ? fmt(stats.areas) : null, loading: !stats },
                  ]}
                />
              </div>
              <div className="map-page__stats-line">
                {stats ? (
                  <>
                    {fmt(stats.activities)} activities with a place · {fmt(stats.projects)} projects ·{" "}
                    {fmt(stats.countries)} countries · {fmt(stats.areas)} drawn areas
                  </>
                ) : (
                  <Skeleton variant="line" width="80%" height={12} />
                )}
              </div>
              <div className="map-page__bar">
                <p className="map-page__blurb">{active.blurb}</p>
                <div className="map-page__controls">
                  <span className="map-page__filters" ref={setFiltersHost}>
                    {view === "places" ? (
                      layerCounts ? (
                        <NetworkFiltersSheet changed={layerState.changed} onReset={layerState.reset}>
                          <div className="map-sheet__group" role="group" aria-labelledby="map-sheet-layers">
                            <p className="map-sheet__label" id="map-sheet-layers">
                              Show on the map
                            </p>
                            <MapLayerChips layers={layerState.layers} toggle={layerState.toggle} counts={layerCounts} />
                          </div>
                        </NetworkFiltersSheet>
                      ) : (
                        <Button variant="secondary" size="md" disabled>
                          <FilterIcon size={16} strokeWidth={1.75} aria-hidden />
                          Filters
                        </Button>
                      )
                    ) : null}
                  </span>
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
              </div>
              {model ? (
                <section className="map-page__view" aria-label={active.label}>
                  {view === "places" ? (
                    <MapBrowse model={model} kind={kind} height={height} resize={resize} layerState={layerState} />
                  ) : view === "countries" ? (
                    <MapCountries model={model} kind={kind} height={height} resize={resize} />
                  ) : (
                    <MapSites model={model} kind={kind} height={height} resize={resize} filtersHost={filtersHost} />
                  )}
                </section>
              ) : (
                <div className="map-loading" role="status" style={{ minHeight: height }}>
                  <LoadingSpinner size="md" />
                  <p>Gathering every place on the network. The first load can take up to a minute.</p>
                </div>
              )}
              {model?.partial ? (
                <p className="map-page__note">
                  Some places couldn&apos;t be read completely this time, so a few may be missing.
                </p>
              ) : null}
            </>
          )}
        </TabPanel>
      </Tabs>
    </PageContainer>
  )
}
