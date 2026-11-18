import { describe, expect, it } from "vitest";
import { imageUrl, safeUrl } from "./views";

// Records are written by anyone, so a URL in one is untrusted. These guard
// what reaches an href or an <img src>.
describe("safeUrl", () => {
  it("keeps http and https links", () => {
    expect(safeUrl("https://hypercerts.org")).toBe("https://hypercerts.org");
    expect(safeUrl("http://example.org/a")).toBe("http://example.org/a");
  });

  it("drops script, data and other schemes, and non-URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeUrl("ftp://example.org")).toBeNull();
    expect(safeUrl("hypercerts.org")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });

  it("allows only https when asked, for what browsers load on their own", () => {
    expect(safeUrl("http://tracker.example/x.gif", true)).toBeNull();
    expect(safeUrl("https://img.example/x.png", true)).toBe("https://img.example/x.png");
  });
});

describe("imageUrl", () => {
  const did = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";

  it("never loads an image given as a URL over plain http", () => {
    const image = { $type: "org.hypercerts.defs#uri", uri: "http://tracker.example/x.gif" };
    expect(imageUrl(did, image, "card")).toBeNull();
  });
});
