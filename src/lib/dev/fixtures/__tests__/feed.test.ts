import { describe, expect, it } from "vitest"
import {
  certifiedFeedPage,
  followerEventsConnection,
} from "../feed"

describe("feed fixtures", () => {
  it("keeps service actor summaries distinct from legacy indexer actors", () => {
    const serviceItems = certifiedFeedPage().items

    for (const item of serviceItems) {
      const actor = item.actor as Record<string, unknown>
      expect(actor).toHaveProperty("avatar", null)
      expect(actor).not.toHaveProperty("avatarCid")

      const view = item.view as Record<string, unknown>
      if (view.$type === "app.certified.feed.beta.defs#endorsementView") {
        const subject = view.subject as Record<string, unknown>
        expect(subject).toHaveProperty("avatar", null)
        expect(subject).not.toHaveProperty("avatarCid")
      }
    }

    const legacyActor = followerEventsConnection().edges[0].node.actor
    expect(legacyActor).toHaveProperty("avatarCid", null)
    expect(legacyActor).not.toHaveProperty("avatar")
  })
})
