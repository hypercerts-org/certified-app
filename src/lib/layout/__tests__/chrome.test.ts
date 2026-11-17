import { describe, it, expect } from "vitest"
import { hasDesktopChrome, hasPhoneChrome, routeChrome } from "../chrome"

describe("routeChrome", () => {
  it("sorts routes into app, editorial, landing and embed", () => {
    expect(routeChrome("/feed")).toBe("app")
    expect(routeChrome("/maya.certified.app")).toBe("app")
    expect(routeChrome("/terms")).toBe("editorial")
    expect(routeChrome("/dsa")).toBe("editorial")
    expect(routeChrome("/welcome")).toBe("landing")
    expect(routeChrome("/embed/board/x")).toBe("embed")
    expect(routeChrome(null)).toBe("app")
  })

  it("gives the sidebar to app routes only, and the phone chrome to the legal pages too", () => {
    expect(hasDesktopChrome("/home")).toBe(true)
    expect(hasDesktopChrome("/privacy")).toBe(false)
    expect(hasPhoneChrome("/privacy")).toBe(true)
    expect(hasPhoneChrome("/welcome")).toBe(false)
    expect(hasPhoneChrome("/embed/board")).toBe(false)
  })
})
