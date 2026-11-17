import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, act, renderHook, within } from "@testing-library/react"
import type { MapDataset } from "@/lib/map/dataset-types"
import { buildModel, type Layer } from "@/lib/map/model"

// The Places list: on phones it runs in the page under the map (no inner
// scroll box, map.css), growing 20 rows at a time with "Show more"; from
// 800px it keeps 40 per step beside the map. The layer chips' state is held
// by the page (so the phone Filters sheet and the chips are one control).

vi.mock("next/navigation", () => ({
  usePathname: () => "/map",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

// The canvas map is not under test.
vi.mock("@/components/network/map/world-map", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid="world-map">{children}</div>,
}))

import MapBrowse from "../map/map-browse"
import MapSites from "../map/map-sites"
import { useMapLayers } from "../map/use-map-layers"

/** `n` activities, each at its own spot. */
function model(n: number) {
  const ds: MapDataset = {
    generatedAt: "2026-11-15T00:00:00.000Z",
    partial: false,
    accounts: [{ did: "did:plc:aaa", name: "Green Belt" }],
    countries: ["Kenya"],
    places: Array.from({ length: n }, (_, i) => ({
      lng: 30 + i * 0.5,
      lat: -1 + i * 0.1,
      prec: "site" as const,
      name: `Spot ${i + 1}`,
      account: 0,
      country: 0,
    })),
    areas: [],
    activities: Array.from({ length: n }, (_, i) => ({
      rkey: `a${i}`,
      title: `Activity ${i + 1}`,
      account: 0,
      place: i,
      more: [],
      project: -1,
      date: null,
    })),
    projects: [],
    orgs: [],
    unused: [],
    totals: { activities: n, projects: 0, orgs: 0, unplaceable: 0 },
  }
  return buildModel(ds)
}

const layerState = {
  layers: new Set<Layer>(["activity", "project"]),
  toggle: vi.fn(),
  reset: vi.fn(),
  changed: 0,
}

const resize = { min: 420, max: 1100, onResize: vi.fn() }

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w })
}

afterEach(() => {
  setWidth(1024)
})

function rowCount(container: HTMLElement) {
  return container.querySelectorAll(".map-list__rows > li").length
}

describe("Places list", () => {
  it("shows 20 rows at a time on phones, with Show more", async () => {
    setWidth(390)
    const { container } = render(
      <MapBrowse model={model(30)} kind="flat" height={420} resize={resize} layerState={layerState} />,
    )
    await act(async () => {})
    expect(rowCount(container)).toBe(20)
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more" }))
    expect(rowCount(container)).toBe(30)
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull()
  })

  it("keeps 40 rows per step from 800px", async () => {
    setWidth(1440)
    const { container } = render(
      <MapBrowse model={model(30)} kind="flat" height={600} resize={resize} layerState={layerState} />,
    )
    await act(async () => {})
    expect(rowCount(container)).toBe(30)
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull()
  })

  it("says where the layers are when none is on (Filters on phones)", async () => {
    setWidth(390)
    render(
      <MapBrowse
        model={model(3)}
        kind="flat"
        height={420}
        resize={resize}
        layerState={{ ...layerState, layers: new Set<Layer>() }}
      />,
    )
    await act(async () => {})
    expect(screen.getByText("Turn on a layer in Filters to see it here.")).toBeInTheDocument()
  })
})

describe("useMapLayers", () => {
  it("counts the layers that differ from the default and resets them", () => {
    window.history.replaceState(null, "", "/map")
    const { result } = renderHook(() => useMapLayers())
    expect(result.current.changed).toBe(0)
    act(() => result.current.toggle("org"))
    act(() => result.current.toggle("activity"))
    expect(result.current.changed).toBe(2)
    expect(window.location.search).toBe("?layers=project%2Corg")
    act(() => result.current.reset())
    expect(result.current.changed).toBe(0)
    expect([...result.current.layers].sort()).toEqual(["activity", "project"])
    expect(window.location.search).toBe("")
  })
})

describe("Sites on phones", () => {
  it("puts Sort and Show in a Filters sheet whose button sits in the page's slot", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    setWidth(390)
    const scrollTo = Element.prototype.scrollTo
    Element.prototype.scrollTo = () => {}
    const host = document.createElement("span")
    document.body.appendChild(host)
    const ds: MapDataset = {
      generatedAt: "2026-11-15T00:00:00.000Z",
      partial: false,
      accounts: [{ did: "did:plc:aaa", name: "Green Belt" }],
      countries: ["Kenya"],
      places: [{ lng: 35, lat: -1, prec: "area", name: "Plot", account: 0, country: 0, area: 0, km2: 0.4 }],
      areas: [[[[[35, -1], [35.01, -1], [35.01, -0.99], [35, -1]]]]],
      activities: [],
      projects: [],
      orgs: [],
      unused: [0],
      totals: { activities: 0, projects: 0, orgs: 0, unplaceable: 0 },
    }
    render(<MapSites model={buildModel(ds)} kind="flat" height={420} resize={resize} filtersHost={host} />)
    await act(async () => {})
    const button = host.querySelector("button")
    expect(button?.textContent).toBe("Filters")
    fireEvent.click(button!)
    const sheet = await screen.findByRole("dialog", { name: "Filters" })
    expect(within(sheet).getByRole("radiogroup", { name: "Sort the outlines" })).toBeInTheDocument()
    expect(within(sheet).getByRole("radiogroup", { name: "Show" })).toBeInTheDocument()
    host.remove()
    Element.prototype.scrollTo = scrollTo
    vi.unstubAllGlobals()
  })
})
