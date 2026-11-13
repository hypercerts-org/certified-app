import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import type { CONNECTED_APPS } from "@/lib/constants/apps"
import SsoAppLink from "./sso-app-link"

export type ConnectedApp = (typeof CONNECTED_APPS)[number]

export type AppTileSize = "sm" | "lg"

export interface AppTileProps {
  app: ConnectedApp
  /**
   * `sm`: compact padding, for the short list on Home. `lg`: roomier
   * padding and a larger name, for the /apps directory. Both put the logo
   * on the same 44px plate.
   */
  size?: AppTileSize
  /** Adds the app's longer description under the name (the /apps page). */
  showLongDescription?: boolean
}

const tileBase =
  // One object surface (DESIGN.md §9.4 elevated): no shadow; on hover the
  // shared tint (`.hover-tint`) and a darker border (hover devices only)
  // and a small press.
  "hover-tint group flex h-full w-full flex-col rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] text-inherit no-underline " +
  "transition-[border-color,transform] duration-fast ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "select-none [-webkit-touch-callout:none] hover:border-[var(--border-hover)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"

const tileBySize: Record<AppTileSize, string> = {
  sm: "p-3",
  lg: "p-4 md:p-5",
}

/**
 * One partner app as a tile: logo, name, one-line description and an
 * "opens elsewhere" arrow; on /apps also the longer description. The whole
 * tile is the link, through `<SsoAppLink>`, which opens a new tab and signs
 * a signed-in viewer straight in where the app supports it.
 *
 * Shared by Home's Apps section (`size="sm"`) and the /apps directory
 * (`size="lg"`). It has no hooks of its own, so /apps can render it from a
 * server component; only the link is a client island.
 */
export default function AppTile({
  app,
  size = "sm",
  showLongDescription = false,
}: AppTileProps) {
  const isLarge = size === "lg"
  const monochromeLogo = "monochromeLogo" in app && app.monochromeLogo

  return (
    <SsoAppLink
      url={app.url}
      ssoHandleUrl={"ssoHandleUrl" in app ? app.ssoHandleUrl : undefined}
      className={`${tileBase} ${tileBySize[size]}`}
    >
      {/* Everything top-aligns against the fixed logo box, the arrow
          included: the names in a row of /apps tiles line up whatever the
          tagline's length, and the arrow sits level with the name rather
          than in the middle of the text. */}
      <span className={`flex items-start gap-3 ${isLarge ? "md:gap-4" : ""}`}>
        {/* Every logo on one 44px plate in --bg-sunken (it follows the
            theme), fitted 4px inside it the same way for every app, so a
            logo with a transparent ground reads as the same size and
            weight as a full-bleed one. A black one-colour mark
            (`monochromeLogo`) flips to white in dark mode, where the plate
            is near-black. */}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[var(--bg-sunken)] p-1">
          <Image
            src={app.logo}
            alt=""
            width={36}
            height={36}
            className={`h-full w-full rounded object-contain ${monochromeLogo ? "dark:invert" : ""}`}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={`font-semibold text-[var(--fg-primary)] ${isLarge ? "text-body leading-snug" : "text-body-sm"}`}
          >
            {app.name}
          </span>
          {/* From 800px, where /apps tiles sit side by side, the tagline
              keeps room for its two lines, so the long descriptions below
              start at one height across the row. Balanced, so a tagline
              that wraps splits evenly instead of leaving one word on the
              second line; the inner block carries the balance, since the
              clamp makes the outer span a -webkit-box. */}
          <span
            className={`line-clamp-2 text-ui text-[var(--fg-muted)] ${isLarge ? "md:min-h-[2.9em]" : ""}`}
          >
            <span className="block text-balance">{app.desc}</span>
          </span>
        </span>
        <ArrowUpRight
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-[var(--fg-muted)] transition-colors duration-fast group-hover:text-[var(--fg-primary)]"
        />
      </span>
      {showLongDescription ? (
        <span className="mt-3 block max-w-measure text-body-sm text-[var(--fg-secondary)] text-pretty">
          {app.longDesc}
        </span>
      ) : null}
    </SsoAppLink>
  )
}
