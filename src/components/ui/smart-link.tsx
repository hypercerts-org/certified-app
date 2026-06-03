"use client"

import { Link as LinkIcon, type LucideIcon } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

/**
 * SmartLink — renders a URL with a brand-appropriate icon and a short
 * human-friendly display string.
 *
 * Brand icons are the official Simple Icons marks
 * (https://simpleicons.org), inlined as 24×24 single-path SVGs so they
 * inherit currentColor and don't pull in a runtime dependency. Lucide
 * is kept only for the generic-link fallback.
 *
 * Renders an icon as the *first* child of the parent element followed
 * by an <a> tag. This makes the icon a direct child of the surrounding
 * <li> (or whatever wraps the component), so existing sidebar rules
 * like `.profile-sidebar__details li > svg` continue to apply.
 *
 * The URL must use http: or https: — other schemes return null.
 */

type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>

interface ServiceMatch {
  Icon: IconComponent
  display: string
}

interface SmartLinkProps {
  url: string
  className?: string
}

const ICON_PROPS = {
  size: 16,
  strokeWidth: 1.75,
  "aria-hidden": true as const,
}

// Focus ring that must apply even when a caller passes a custom className.
// Appended (not substituted) so the keyboard-focus affordance can never be
// dropped by an override that forgets it.
const FOCUS_RING =
  "rounded focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"

export default function SmartLink({ url, className }: SmartLinkProps) {
  const href = normaliseHref(url)
  if (!href) {
    return <span className={className}>{url}</span>
  }

  let parsed: URL
  try {
    parsed = new URL(href)
  } catch {
    return <span className={className}>{url}</span>
  }

  const match = detectService(parsed)
  const { Icon, display } = match

  const anchorClass = `${
    className ?? "profile-sidebar__detail-link smart-link__anchor"
  } ${FOCUS_RING}`

  return (
    <>
      <Icon {...ICON_PROPS} />
      <a
        href={href}
        className={anchorClass}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
      >
        {display}
        {/* External links open a new tab; announce it for AT users. The
            sighted cue is the new-tab behaviour itself + the title. */}
        <span className="sr-only"> (opens in new tab)</span>
      </a>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* URL normalisation                                                          */
/* -------------------------------------------------------------------------- */

function normaliseHref(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) return null
    return trimmed
  }
  return `https://${trimmed}`
}

/* -------------------------------------------------------------------------- */
/* Service detection                                                          */
/* -------------------------------------------------------------------------- */

function detectService(url: URL): ServiceMatch {
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const segments = url.pathname.split("/").filter(Boolean)
  const first = segments[0] ?? ""
  const second = segments[1] ?? ""

  // X (formerly Twitter) — host can be x.com OR the legacy twitter.com
  // but the icon is always the X mark per the post-rebrand identity.
  if (host === "x.com" || host === "twitter.com") {
    if (first && !RESERVED_TWITTER.has(first.toLowerCase())) {
      return { Icon: XIcon, display: `@${first}` }
    }
    return { Icon: XIcon, display: "x.com" }
  }

  if (host === "github.com") {
    if (first && second) return { Icon: GitHubIcon, display: `${first}/${second}` }
    if (first) return { Icon: GitHubIcon, display: first }
    return { Icon: GitHubIcon, display: "github.com" }
  }

  if (host === "bsky.app" || host === "bsky.social") {
    if (first === "profile" && second) {
      const handle = second.startsWith("@") ? second.slice(1) : second
      return { Icon: BlueskyIcon, display: `@${handle}` }
    }
    return { Icon: BlueskyIcon, display: host }
  }

  if (host === "instagram.com") {
    if (first) return { Icon: InstagramIcon, display: `@${first.replace(/^@/, "")}` }
    return { Icon: InstagramIcon, display: host }
  }

  if (host === "linkedin.com") {
    if ((first === "in" || first === "company" || first === "school") && second) {
      return { Icon: LinkedInIcon, display: second }
    }
    return { Icon: LinkedInIcon, display: "linkedin.com" }
  }

  if (host === "youtube.com" || host === "youtu.be") {
    if (first.startsWith("@")) return { Icon: YouTubeIcon, display: first }
    if (first === "c" || first === "channel" || first === "user") {
      if (second) return { Icon: YouTubeIcon, display: `@${second}` }
    }
    if (host === "youtu.be" && first) return { Icon: YouTubeIcon, display: first }
    return { Icon: YouTubeIcon, display: "youtube.com" }
  }

  const isMastodonHost =
    host === "mastodon.social" ||
    host.startsWith("mastodon.") ||
    (host.endsWith(".social") && host !== "bsky.social")
  if (isMastodonHost && first.startsWith("@")) {
    const user = first.slice(1)
    return { Icon: MastodonIcon, display: `@${user}@${host}` }
  }

  if (host === "t.me" || host === "telegram.org" || host === "telegram.me") {
    if (first) return { Icon: TelegramIcon, display: `@${first.replace(/^@/, "")}` }
    return { Icon: TelegramIcon, display: host }
  }

  if (host === "facebook.com" || host === "fb.com") {
    if (first) return { Icon: FacebookIcon, display: first }
    return { Icon: FacebookIcon, display: "facebook.com" }
  }

  if (host === "tiktok.com") {
    if (first.startsWith("@")) return { Icon: TikTokIcon, display: first }
    if (first) return { Icon: TikTokIcon, display: `@${first}` }
    return { Icon: TikTokIcon, display: host }
  }

  if (host === "medium.com") {
    if (first.startsWith("@")) return { Icon: MediumIcon, display: first }
    if (first) return { Icon: MediumIcon, display: first }
    return { Icon: MediumIcon, display: host }
  }
  if (host.endsWith(".medium.com")) {
    const sub = host.slice(0, -".medium.com".length)
    return { Icon: MediumIcon, display: `@${sub}` }
  }

  if (host === "threads.net" || host === "threads.com") {
    if (first.startsWith("@")) return { Icon: ThreadsIcon, display: first }
    if (first) return { Icon: ThreadsIcon, display: `@${first}` }
    return { Icon: ThreadsIcon, display: host }
  }

  if (host === "discord.gg") {
    return { Icon: DiscordIcon, display: "discord invite" }
  }
  if (host === "discord.com" && first === "invite") {
    return { Icon: DiscordIcon, display: "discord invite" }
  }
  if (host === "discord.com" || host === "discordapp.com") {
    return { Icon: DiscordIcon, display: "discord.com" }
  }

  if (host === "twitch.tv") {
    if (first) return { Icon: TwitchIcon, display: `@${first}` }
    return { Icon: TwitchIcon, display: host }
  }

  // Fallback for unrecognised hosts: just the bare hostname. Drop the
  // first path segment — it's almost never meaningful enough at a glance
  // to justify the extra characters in a sidebar list.
  return { Icon: LinkIcon, display: host }
}

const RESERVED_TWITTER = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "i",
  "search",
  "settings",
  "compose",
])

/* -------------------------------------------------------------------------- */
/* Official brand SVGs from Simple Icons (https://simpleicons.org).            */
/* All marks are single-path, 24×24 viewBox, currentColor fill.               */
/* -------------------------------------------------------------------------- */

interface BrandIconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function BrandIcon({ size = 16, children, ...rest }: BrandIconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      {...rest}
    >
      {children}
    </svg>
  )
}

function XIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </BrandIcon>
  )
}

function GitHubIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </BrandIcon>
  )
}

function LinkedInIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </BrandIcon>
  )
}

function BlueskyIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.296 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
    </BrandIcon>
  )
}

function InstagramIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421C8.279 2.224 8.668 2.21 12 2.21zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </BrandIcon>
  )
}

function YouTubeIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </BrandIcon>
  )
}

function MastodonIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.812 1.012 3.12z" />
    </BrandIcon>
  )
}

function TelegramIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </BrandIcon>
  )
}

function FacebookIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </BrandIcon>
  )
}

function TikTokIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </BrandIcon>
  )
}

function MediumIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
    </BrandIcon>
  )
}

function ThreadsIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
    </BrandIcon>
  )
}

function DiscordIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z" />
    </BrandIcon>
  )
}

function TwitchIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </BrandIcon>
  )
}
