import { describe, it, expect } from "vitest"
import { isFeedbackTriggerVisible, isRecordPath } from "../feedback-trigger-visibility"

describe("isRecordPath", () => {
  it("matches activity and project pages and what sits under them", () => {
    expect(isRecordPath("/maya.certified.app/activity/3k2")).toBe(true)
    expect(isRecordPath("/did:plc:abc/project/3k2")).toBe(true)
    expect(isRecordPath("/maya.certified.app/activity/3k2/update/new")).toBe(true)
  })

  it("ignores profiles and other three-segment paths", () => {
    expect(isRecordPath("/maya.certified.app")).toBe(false)
    expect(isRecordPath("/dev/preview/activity")).toBe(false)
    expect(isRecordPath("/groups/did:plc:g/settings")).toBe(false)
  })
})

describe("isFeedbackTriggerVisible", () => {
  it("shows the button on the other destinations", () => {
    for (const path of ["/home", "/feed", "/explore", "/apps", "/settings", "/maya.certified.app"]) {
      expect(isFeedbackTriggerVisible(path)).toBe(true)
    }
  })

  it("hides it on Records, record pages, forms, /welcome and embeds", () => {
    for (const path of [
      "/records",
      "/maya.certified.app/activity/3k2",
      "/maya.certified.app/project/3k2",
      "/maya.certified.app/activity/3k2/edit",
      "/create",
      "/project/new",
      "/welcome",
      "/embed/board",
    ]) {
      expect(isFeedbackTriggerVisible(path)).toBe(false)
    }
  })
})
