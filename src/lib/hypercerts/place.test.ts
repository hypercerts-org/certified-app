import { describe, expect, it } from "vitest";
import { locationBlobCid, toPlace } from "./views";

// Location records are written by any app, in any of the Location Protocol's
// formats. Only a point read with certainty reaches the map.
describe("toPlace", () => {
  const name = "Wilmington, New Castle County, Delaware, United States";

  it("reads a decimal coordinate pair (lat, lng), as the API returns it", () => {
    expect(
      toPlace({
        name,
        locationType: "coordinate-decimal",
        location: { $type: "app.certified.location#string", string: "39.7459468,-75.546589" },
      }),
    ).toEqual({
      name,
      short: "Delaware, United States",
      point: { lat: 39.7459468, lng: -75.546589 },
    });
  });

  it("reads a GeoJSON point, longitude first", () => {
    const place = toPlace({
      name,
      locationType: "geojson-point",
      location: { string: '{"type":"Point","coordinates":[-75.5466,39.7459]}' },
    });
    expect(place?.point).toEqual({ lat: 39.7459, lng: -75.5466 });
  });

  it("keeps the name without a point for formats it doesn't read, or bad values", () => {
    const point = (locationType: string, string: string) =>
      toPlace({ name, locationType, location: { string } })?.point;
    expect(point("h3", "8a2a1072b59ffff")).toBeNull();
    expect(point("coordinate-decimal", "91,10")).toBeNull();
    expect(point("coordinate-decimal", "10,200")).toBeNull();
    expect(point("coordinate-decimal", "abc,def")).toBeNull();
    expect(point("coordinate-decimal", "39.7,")).toBeNull();
    expect(point("geojson-point", "{not json")).toBeNull();
    expect(point("geojson-point", '{"type":"Polygon","coordinates":[]}')).toBeNull();
    expect(
      toPlace({ name, locationType: "coordinate-decimal", location: { uri: "x" } })?.point,
    ).toBeNull();
  });

  it("reads a value kept in a blob, once the caller has its text", () => {
    const record = {
      name: "645 SE Alexander Ave, Corvallis, OR 97333, USA",
      locationType: "coordinate-decimal",
      location: {
        $type: "org.hypercerts.defs#smallBlob",
        blob: {
          $type: "blob",
          mimeType: "text/plain",
          ref: { $link: "bafkreiflm5pe2akiwr7fkj3dmpkl2tchcdgefn6dnda4g6c3ssdwwbj6gi" },
          size: 37,
        },
      },
    };
    expect(locationBlobCid(record)).toBe(
      "bafkreiflm5pe2akiwr7fkj3dmpkl2tchcdgefn6dnda4g6c3ssdwwbj6gi",
    );
    expect(toPlace(record, "44.545457499208084,-123.2611234945545\n")?.point).toEqual({
      lat: 44.545457499208084,
      lng: -123.2611234945545,
    });
    // Unread (the server didn't answer): the name, no point.
    expect(toPlace(record)).toMatchObject({ short: "OR 97333, USA", point: null });
  });

  it("has no blob for an inline value", () => {
    expect(locationBlobCid({ location: { string: "1,2" } })).toBeNull();
  });

  it("is nothing without a name", () => {
    expect(toPlace({ name: "  ", locationType: "coordinate-decimal" })).toBeNull();
  });
});
