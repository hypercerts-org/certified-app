import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { placeLabel } = await import("./geocode");

// Nominatim's address fields, as it returns them at city level (zoom 10).
describe("placeLabel", () => {
  it("names the city and the country", () => {
    expect(
      placeLabel({
        city: "Corvallis",
        county: "Benton County",
        state: "Oregon",
        country: "United States",
      }),
    ).toBe("Corvallis, United States");
    expect(placeLabel({ city: "Nairobi", state: "Nairobi County", country: "Kenya" })).toBe(
      "Nairobi, Kenya",
    );
  });

  it("takes a town or village where there is no city", () => {
    expect(placeLabel({ town: "Gnesta", county: "Södermanland", country: "Sweden" })).toBe(
      "Gnesta, Sweden",
    );
    expect(placeLabel({ village: "Timbi-Madina", country: "Guinea" })).toBe("Timbi-Madina, Guinea");
  });

  it("falls back to the county or region in the countryside", () => {
    expect(
      placeLabel({ county: "Dalaba Prefecture", state: "Mamou Region", country: "Guinea" }),
    ).toBe("Dalaba Prefecture, Guinea");
  });

  it("is the country alone, or nothing without one", () => {
    expect(placeLabel({ country: "Kenya" })).toBe("Kenya");
    expect(placeLabel({ city: "Somewhere" })).toBeNull();
  });
});
