import { describe, expect, it } from "vitest";
import { emailAddress, imageUrl, safeUrl } from "./views";

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

// A public email becomes a mailto: link, so only a plain address passes.
describe("emailAddress", () => {
  it("keeps a plain address", () => {
    expect(emailAddress(" hello@example.org ")).toBe("hello@example.org");
  });

  it("drops anything that isn't one address", () => {
    expect(emailAddress("hello")).toBeNull();
    expect(emailAddress("hello@example")).toBeNull();
    expect(emailAddress("a@b.org, c@d.org")).toBeNull();
    expect(emailAddress("a@b.org?subject=x&body=y")).toBeNull();
    expect(emailAddress("a?subject=x@b.org")).toBeNull();
    expect(emailAddress("Name <a@b.org>")).toBeNull();
    expect(emailAddress("a b@c.org")).toBeNull();
    expect(emailAddress(42)).toBeNull();
  });
});
