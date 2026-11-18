import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import HelpFaq from "../help-faq"

describe("HelpFaq", () => {
  it("starts with the questions of people who come to find and support work", () => {
    render(<HelpFaq />)

    const questions = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(questions.slice(0, 2)).toEqual([
      "I want to find and support work. Where do I start?",
      "What do Graph, Map and Funding show?",
    ])
  })

  it("calls the DID the Permanent ID, as Settings does", () => {
    render(<HelpFaq />)

    expect(
      screen.getByRole("button", { name: "What are my handle and my Permanent ID?" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /my DID/ })).toBeNull()
  })

  it("points the first question at Explore", () => {
    render(<HelpFaq />)

    expect(screen.getByRole("link", { name: "Open Explore", hidden: true })).toHaveAttribute(
      "href",
      "/explore",
    )
  })
})
