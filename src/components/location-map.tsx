"use client";

// A small map with one pin: a place on a profile or a project, or, with
// `onPick`, the place being chosen in the location picker (a click drops the
// pin there, and the pin can be dragged). MapLibre GL draws it from
// OpenFreeMap's vector tiles (OpenStreetMap data; no key, no account, no
// fees), in the light grey "positron" style that suits the brand.
//
// MapLibre is large, so it loads only here, in the browser, once a map is
// on the page; until its first tiles are drawn, a skeleton of the map's size
// holds the place. A map on a page never takes over its scrolling: Ctrl/⌘ +
// scroll zooms it, and on a touch screen it moves with two fingers
// (cooperative gestures); the picker's map, in a dialog, takes gestures
// directly. If MapLibre can't load, the map steps aside and the card keeps
// the place's name.

import { Skeleton } from "@hypercerts-org/ui-react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
/** A town and its surroundings, as on staging. */
const ZOOM = 10;
/** The picker with nothing chosen yet: the whole world. */
const WORLD = { center: [0, 20] as [number, number], zoom: 1 };

type Point = { lat: number; lng: number };

export function LocationMap({
  point,
  label,
  imageUrl,
  onPick,
}: {
  /** The pin; null for none yet (the picker, before a place is chosen). */
  point: Point | null;
  /** The pin's label: who is here, and where. */
  label: string;
  /** The pin's picture (the account's), or the default pin without one. */
  imageUrl: string | null;
  /** Makes the map a picker: told the point a click or a drag puts the pin at. */
  onPick?: (point: Point) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [maplibre, setMaplibre] = useState<typeof import("maplibre-gl") | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // The latest callback, so the map isn't rebuilt when the parent re-renders.
  const pick = useRef(onPick);
  pick.current = onPick;
  const picker = Boolean(onPick);
  const first = useRef(point);

  // The map itself, once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const library = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      // MapLibre 6 looks for its worker beside its own module, which the
      // bundler moves: point it at the worker's place in the build.
      library.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const start = first.current;
      const created = new library.Map({
        container: container.current,
        style: STYLE,
        center: start ? [start.lng, start.lat] : WORLD.center,
        zoom: start ? ZOOM : WORLD.zoom,
        cooperativeGestures: !picker,
        attributionControl: false,
      });
      // The credit behind its "i" button: open, it would cover a small map.
      created.addControl(new library.AttributionControl({ compact: true }), "bottom-right");
      created.addControl(new library.NavigationControl({ showCompass: false }), "top-left");
      if (!picker) created.addControl(new library.FullscreenControl(), "top-right");
      if (picker) {
        created.getCanvas().style.cursor = "crosshair";
        created.on("click", (event) => pick.current?.(event.lngLat));
      }
      created.once("load", () => {
        if (cancelled) return;
        // MapLibre opens a compact credit at first; it stays one click away.
        created
          .getContainer()
          .querySelector(".maplibregl-compact-show")
          ?.classList.remove("maplibregl-compact-show");
        setState("ready");
      });
      map.current = created;
      setMaplibre(library);
    })().catch(() => !cancelled && setState("failed"));

    return () => {
      cancelled = true;
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, [picker]);

  // The pin, wherever `point` is now; the picker's map follows it there.
  useEffect(() => {
    const current = map.current;
    if (!maplibre || !current) return;
    if (!point) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const at: [number, number] = [point.lng, point.lat];
    if (!marker.current) {
      const created = imageUrl
        ? new maplibre.Marker({ element: pinElement(imageUrl), draggable: picker })
        : new maplibre.Marker({ color: "#111111", draggable: picker });
      created.getElement().setAttribute("aria-label", label);
      if (picker) {
        created.on("dragend", () => pick.current?.(created.getLngLat()));
      } else {
        hoverLabel(maplibre, current, created, label);
      }
      created.setLngLat(at).addTo(current);
      marker.current = created;
    } else {
      marker.current.setLngLat(at);
    }
    if (picker) current.easeTo({ center: at, zoom: Math.max(current.getZoom(), ZOOM) });
  }, [maplibre, point, picker, imageUrl, label]);

  if (state === "failed") return null;
  return (
    <div className={picker ? "location-map location-map-picker" : "location-map"}>
      <div ref={container} className="location-map-canvas" />
      {state === "loading" && <Skeleton variant="box" className="location-map-skeleton" />}
    </div>
  );
}

/** The label beside the pin while it's hovered or focused. */
function hoverLabel(
  maplibre: typeof import("maplibre-gl"),
  map: MapLibreMap,
  marker: Marker,
  label: string,
) {
  const popup = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset: 20 });
  popup.setText(label);
  const element = marker.getElement();
  const show = () => popup.setLngLat(marker.getLngLat()).addTo(map);
  const hide = () => popup.remove();
  element.addEventListener("mouseenter", show);
  element.addEventListener("mouseleave", hide);
  element.addEventListener("focus", show);
  element.addEventListener("blur", hide);
}

/** The pin: the account's picture in a small framed disc. */
function pinElement(imageUrl: string): HTMLElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "location-map-pin";
  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = "";
  // No title: the browser's tooltip would double the hover label.
  element.append(image);
  return element;
}
