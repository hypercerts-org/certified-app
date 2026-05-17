"use client"

import {
  Facebook,
  Github,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  Twitch,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

/**
 * SmartLink — renders a URL with a brand-appropriate icon and a short
 * human-friendly display string.
 *
 * Renders an icon as the *first* child of the parent element followed by an
 * <a> tag. This makes the icon a direct child of the surrounding <li> (or
 * whatever wraps the component), so existing sidebar rules like
 * `.profile-sidebar__details li > svg` continue to apply.
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

export default function SmartLink({ url, className }: SmartLinkProps) {
  const href = normaliseHref(url)
  if (!href) {
    // Non-http(s) — render as plain text instead of an unsafe link.
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

  return (
    <>
      <Icon {...ICON_PROPS} />
      <a
        href={href}
        className={className ?? "profile-sidebar__detail-link smart-link__anchor"}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
      >
        {display}
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

  // If it starts with a protocol, only allow http(s).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) return null
    return trimmed
  }

  // No scheme — assume https.
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

  // x.com / twitter.com → @handle
  if (host === "x.com" || host === "twitter.com") {
    if (first && !RESERVED_TWITTER.has(first.toLowerCase())) {
      return { Icon: Twitter, display: `@${first}` }
    }
    return { Icon: Twitter, display: host }
  }

  // github.com → github.com/owner or github.com/owner/repo
  if (host === "github.com") {
    if (first && second) return { Icon: Github, display: `github.com/${first}/${second}` }
    if (first) return { Icon: Github, display: `github.com/${first}` }
    return { Icon: Github, display: "github.com" }
  }

  // bsky.app / bsky.social → @handle (from /profile/<handle>)
  if (host === "bsky.app" || host === "bsky.social") {
    if (first === "profile" && second) {
      const handle = second.startsWith("@") ? second.slice(1) : second
      return { Icon: BlueskyIcon, display: `@${handle}` }
    }
    return { Icon: BlueskyIcon, display: host }
  }

  // instagram.com → @handle
  if (host === "instagram.com") {
    if (first) return { Icon: Instagram, display: `@${first.replace(/^@/, "")}` }
    return { Icon: Instagram, display: host }
  }

  // linkedin.com → linkedin.com/in/<slug> or /company/<slug>
  if (host === "linkedin.com") {
    if ((first === "in" || first === "company" || first === "school") && second) {
      return { Icon: Linkedin, display: `linkedin.com/${first}/${second}` }
    }
    return { Icon: Linkedin, display: "linkedin.com" }
  }

  // youtube.com / youtu.be → channel / @handle
  if (host === "youtube.com" || host === "youtu.be") {
    if (first.startsWith("@")) return { Icon: Youtube, display: first }
    if (first === "c" || first === "channel" || first === "user") {
      if (second) return { Icon: Youtube, display: `@${second}` }
    }
    if (host === "youtu.be" && first) return { Icon: Youtube, display: `youtu.be/${first}` }
    return { Icon: Youtube, display: "youtube.com" }
  }

  // Mastodon-style: mastodon.* / *.social → @user@host
  const isMastodonHost =
    host === "mastodon.social" ||
    host.startsWith("mastodon.") ||
    (host.endsWith(".social") && host !== "bsky.social")
  if (isMastodonHost && first.startsWith("@")) {
    const user = first.slice(1)
    return { Icon: MastodonIcon, display: `@${user}@${host}` }
  }

  // Telegram: t.me / telegram.org → @handle
  if (host === "t.me" || host === "telegram.org" || host === "telegram.me") {
    if (first) return { Icon: TelegramIcon, display: `@${first.replace(/^@/, "")}` }
    return { Icon: TelegramIcon, display: host }
  }

  // facebook.com → facebook.com/<slug>
  if (host === "facebook.com" || host === "fb.com") {
    if (first) return { Icon: Facebook, display: `facebook.com/${first}` }
    return { Icon: Facebook, display: "facebook.com" }
  }

  // tiktok.com → @handle
  if (host === "tiktok.com") {
    if (first.startsWith("@")) return { Icon: TiktokIcon, display: first }
    if (first) return { Icon: TiktokIcon, display: `@${first}` }
    return { Icon: TiktokIcon, display: host }
  }

  // medium.com → @handle or medium.com/@handle or /publication
  if (host === "medium.com") {
    if (first.startsWith("@")) return { Icon: LinkIcon, display: first }
    if (first) return { Icon: LinkIcon, display: `medium.com/${first}` }
    return { Icon: LinkIcon, display: host }
  }
  // user.medium.com subdomain
  if (host.endsWith(".medium.com")) {
    const sub = host.slice(0, -".medium.com".length)
    return { Icon: LinkIcon, display: `@${sub}` }
  }

  // Threads
  if (host === "threads.net" || host === "threads.com") {
    if (first.startsWith("@")) return { Icon: ThreadsIcon, display: first }
    if (first) return { Icon: ThreadsIcon, display: `@${first}` }
    return { Icon: ThreadsIcon, display: host }
  }

  // Discord invites
  if (host === "discord.gg") {
    return { Icon: DiscordIcon, display: "discord invite" }
  }
  if (host === "discord.com" && first === "invite") {
    return { Icon: DiscordIcon, display: "discord invite" }
  }
  if (host === "discord.com" || host === "discordapp.com") {
    return { Icon: DiscordIcon, display: "discord.com" }
  }

  // Twitch
  if (host === "twitch.tv") {
    if (first) return { Icon: Twitch, display: `@${first}` }
    return { Icon: Twitch, display: host }
  }

  // Fallback: hostname[/first segment]
  const display = first ? `${host}/${first}` : host
  return { Icon: LinkIcon, display }
}

/**
 * Twitter reserved paths — slugs that aren't user handles. Keep the list
 * short; for unmatched cases we'd rather show the wrong handle than a
 * generic fallback.
 */
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
/* Inline brand SVGs (single-color, currentColor)                              */
/* -------------------------------------------------------------------------- */

function BlueskyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" {...props}>
      <path d="M6.3 4.5C9 6.5 11.9 10.6 13 12.9c1.1-2.3 4-6.4 6.7-8.4 1.9-1.4 5-2.6 5-1 0 1-.2 5.7-.4 6.5-.5 2.6-3.1 3.3-5.5 2.9 4.2.7 5.2 3 2.9 5.4-4.3 4.5-6.2-1.2-6.7-2.6 0-.2-.1-.3-.1-.3s-.1.1-.1.3c-.5 1.5-2.4 7.2-6.7 2.7-2.3-2.3-1.2-4.7 3-5.4-2.5.4-5-.3-5.6-3-.2-.7-.4-5.4-.4-6.4 0-1.5 3.1-.3 5 1z" />
    </svg>
  )
}

function MastodonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" {...props}>
      <path d="M21.6 8c-.3-2.3-2.3-4-4.6-4.4-.4-.1-1.9-.3-5.4-.3h0c-3.5 0-4.3.2-4.7.3C4.7 4 2.6 5.5 2.1 7.9 1.9 9 1.9 10.3 1.9 11.6c.1 1.7.1 3.5.3 5.2.4 2.8 3 4.5 5.7 4.8 1 .1 2 .2 2.9.3 1.6.1 3.2 0 4.7-.3v-2.1c-1 .3-2.5.6-3.9.5-2.7-.1-3-1.4-3-2.5 1.4.3 2.9.4 4.3.4.6 0 1.2 0 1.8-.1 1.9-.1 3.7-.3 4.5-.7 1.3-.7 2.3-1.8 2.5-3.2.2-.9.2-1.8.2-2.6 0-.7 0-2-.3-3.3zm-3.1 5.7h-2.2v-5.5c0-1.2-.5-1.8-1.5-1.8s-1.5.6-1.5 1.8v3h-2.2v-3c0-1.2-.5-1.8-1.5-1.8s-1.5.6-1.5 1.8v5.5H5.9V8.1c0-1.2.3-2.1.9-2.8.6-.7 1.4-1 2.5-1 1.2 0 2.2.5 2.8 1.4l.5.9.5-.9c.6-.9 1.6-1.4 2.8-1.4 1 0 1.9.3 2.5 1 .6.7.9 1.6.9 2.8v5.6z" />
    </svg>
  )
}

function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" {...props}>
      <path d="M12 0a12 12 0 100 24 12 12 0 000-24zm5.6 7.7L15.7 17c-.1.6-.5.8-1.1.5l-3-2.2-1.5 1.4c-.2.2-.3.3-.6.3l.2-3 5.6-5c.2-.2-.1-.3-.3-.1L8 13.5l-2.9-.9c-.6-.2-.6-.7.1-1l11.6-4.5c.5-.2 1 .1.8.6z" />
    </svg>
  )
}

function TiktokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" {...props}>
      <path d="M19.6 6.7a5.4 5.4 0 01-3.2-1V15a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.1v2.7a3 3 0 102.1 2.9V2h2.7c.1.4.3 2.4 2.7 4 .6.4 1.4.6 2.2.6v2.6c-.6 0-1.1-.1-1.7-.2v.1z" />
    </svg>
  )
}

function ThreadsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" {...props}>
      <path d="M17.5 11.1c-.1 0-.2-.1-.3-.1-.2-2.9-1.8-4.6-4.4-4.6-1.6 0-2.9.7-3.7 1.9l1.5 1c.6-.9 1.5-1.1 2.2-1.1 1.4 0 2.1.9 2.3 2.3-.8-.2-1.6-.2-2.6-.2-2.7.2-4.4 1.7-4.3 3.9 0 1.1.6 2 1.5 2.6.8.5 1.8.8 2.9.7 1.4-.1 2.5-.6 3.3-1.6.6-.7 1-1.7 1.2-2.9 1 .6 1.7 1.4 2.1 2.4.6 1.7-.4 4.6-3.6 4.6-2.8.1-5.3-2-5.3-6.5s2.4-6.5 5.3-6.5c1.9 0 3.7.9 4.6 2.6l1.7-1.2c-1.3-2.2-3.6-3.4-6.3-3.4-4.1 0-7.2 2.9-7.2 8.5s3.1 8.5 7.2 8.5c4.4 0 6-3.2 6-5.7 0-1.5-.6-3-1.9-4.2z" />
    </svg>
  )
}

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" {...props}>
      <path d="M19.6 4.5A19 19 0 0015 3l-.2.2c1.5.4 2.8.9 4 1.7-1.5-.8-3.2-1.3-5-1.5h-2c-2 .2-3.8.8-5.5 1.7C7.6 4.3 9 3.7 10.3 3.3L10.1 3a19.4 19.4 0 00-4.6 1.5C2.4 9 1.5 13.5 1.9 17.9a19.6 19.6 0 005.9 3l.7-1c-1.1-.4-2.2-.9-3.2-1.5l.8-.6c4 1.9 8.4 1.9 12.4 0 .3.2.5.4.8.6-1 .6-2.1 1.1-3.3 1.5l.7 1a19.5 19.5 0 005.9-3c.5-5-1-9.5-3.9-13.4zM8.5 15.2c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.2-1.1-2.2-2.4 0-1.3 1-2.4 2.2-2.4 1.2 0 2.1 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4z" />
    </svg>
  )
}
