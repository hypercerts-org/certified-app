"use client";

// A small map with one pin, for a place on a profile. MapLibre GL draws it
// from OpenFreeMap's vector tiles (OpenStreetMap data; no key, no account,
// no fees), in the light grey "positron" style that suits the brand.
//
// MapLibre is large, so it loads only here, in the browser, once a map is
// on the page; until its first tiles are drawn, a skeleton of the map's size
// holds the place. The map never takes over the page's scrolling: Ctrl/⌘ +
// scroll zooms it, and on a touch screen it moves with two fingers
// (cooperative gestures). If MapLibre can't load, the map steps aside and
// the card keeps the place's name.

import { Skeleton } from "@hypercerts-org/ui-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
/** A town and its surroundings, as on staging. */
const ZOOM = 10;

export function LocationMap({
  point,
  label,
  imageUrl,
}: {
  point: { lat: number; lng: number };
  /** The pin's hover label: who is here, and where. */
  label: string;
  /** The pin's picture (the account's), or the default pin without one. */
  imageUrl: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      // MapLibre 6 looks for its worker beside its own module, which the
      // bundler moves: point it at the worker's place in the build.
      maplibre.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const center: [number, number] = [point.lng, point.lat];
      map = new maplibre.Map({
        container: container.current,
        style: STYLE,
        center,
        zoom: ZOOM,
        cooperativeGestures: true,
        attributionControl: false,
      });
      // The credit behind its "i" button: open, it would cover a small map.
      const attribution = new maplibre.AttributionControl({ compact: true });
      map.addControl(attribution, "bottom-right");
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      map.addControl(new maplibre.FullscreenControl(), "top-right");

      const popup = new maplibre.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 20,
      }).setText(label);
      const marker = imageUrl
        ? new maplibre.Marker({ element: pin(imageUrl) })
        : new maplibre.Marker({ color: "#111111" });
      marker.setLngLat(center).addTo(map);
      const element = marker.getElement();
      element.setAttribute("aria-label", label);
      const show = () => map && popup.setLngLat(center).addTo(map);
      const hide = () => popup.remove();
      element.addEventListener("mouseenter", show);
      element.addEventListener("mouseleave", hide);
      element.addEventListener("focus", show);
      element.addEventListener("blur", hide);

      map.once("load", () => {
        if (cancelled) return;
        // MapLibre opens a compact credit at first; it stays one click away.
        map
          ?.getContainer()
          .querySelector(".maplibregl-compact-show")
          ?.classList.remove("maplibregl-compact-show");
        setState("ready");
      });
    })().catch(() => !cancelled && setState("failed"));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [point.lat, point.lng, label, imageUrl]);

  if (state === "failed") return null;
  return (
    <div className="location-map">
      <div ref={container} className="location-map-canvas" />
      {state === "loading" && <Skeleton variant="box" className="location-map-skeleton" />}
    </div>
  );
}

/** The pin: the account's picture in a small framed disc. */
function pin(imageUrl: string): HTMLElement {
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
