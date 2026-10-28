import { describe, it, expect } from "vitest"
import { parseCspReports } from "@/lib/security/csp-report"

describe("parseCspReports", () => {
  it("parses the report-uri format", () => {
    expect(
      parseCspReports({
        "csp-report": {
          "document-uri": "https://certified.app/welcome",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
          "blocked-uri": "inline",
          "source-file": "https://certified.app/welcome",
          "line-number": 12,
          "script-sample": "console.log(1)",
          disposition: "report",
        },
      }),
    ).toEqual([
      {
        documentUrl: "https://certified.app/welcome",
        directive: "script-src-elem",
        blockedUrl: "inline",
        sourceFile: "https://certified.app/welcome",
        line: 12,
        sample: "console.log(1)",
        disposition: "report",
      },
    ])
  })

  it("parses the Reporting API format and skips other report types", () => {
    const parsed = parseCspReports([
      {
        type: "csp-violation",
        url: "https://certified.app/explore",
        body: {
          documentURL: "https://certified.app/explore",
          effectiveDirective: "script-src-elem",
          blockedURL: "https://evil.example/x.js",
          disposition: "report",
        },
      },
      { type: "deprecation", body: { id: "x" } },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      documentUrl: "https://certified.app/explore",
      directive: "script-src-elem",
      blockedUrl: "https://evil.example/x.js",
      line: null,
    })
  })

  it("strips query strings and fragments from every URL", () => {
    const [v] = parseCspReports({
      "csp-report": {
        "document-uri": "https://certified.app/oauth/callback?code=SECRET&state=S#frag",
        "blocked-uri": "https://cdn.example/a.js?token=SECRET",
        "source-file": "/relative/path.js?x=SECRET",
      },
    })
    expect(v.documentUrl).toBe("https://certified.app/oauth/callback")
    expect(v.blockedUrl).toBe("https://cdn.example/a.js")
    expect(v.sourceFile).toBe("/relative/path.js")
    expect(JSON.stringify(v)).not.toContain("SECRET")
  })

  it("caps sample length", () => {
    const [v] = parseCspReports({
      "csp-report": { "script-sample": "x".repeat(500) },
    })
    expect(v.sample).toHaveLength(80)
  })

  it("ignores unknown or malformed bodies", () => {
    expect(parseCspReports(null)).toEqual([])
    expect(parseCspReports("text")).toEqual([])
    expect(parseCspReports({ other: 1 })).toEqual([])
    expect(parseCspReports([{ type: "csp-violation" }])).toEqual([])
  })
})
