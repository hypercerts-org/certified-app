"use client";

import React from "react";
import Image from "next/image";

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  fallbackInitials?: string;
  /** Stable identity string (ideally the DID) the placeholder ring's gradient
   *  is derived from. Falls back to the initials, so the ring is at least
   *  stable per name when a caller can't supply a DID. */
  seed?: string;
  className?: string;
  bordered?: boolean;
  /** "circle" (default) for people; "square" (the 2px `--radius`) for
   *  groups, so an organisation never reads as a person (DESIGN.md §4.8). */
  shape?: "circle" | "square";
}

const sizeMap = {
  xs: "h-5 w-5 text-micro",
  sm: "h-8 w-8 text-body-sm",
  md: "h-12 w-12 text-body",
  lg: "h-16 w-16 text-h4",
  xl: "h-24 w-24 text-h3",
  // 240px profile-page hero. text-display (3rem) matches the
  // !text-5xl override profile-sidebar previously applied inline.
  "2xl": "h-[240px] w-[240px] text-display",
};

// Pixel dimensions matching the Tailwind h-/w- classes above. next/image
// needs explicit width+height (or `fill`); explicit values give it the
// intrinsic aspect ratio it needs for layout-shift-free rendering.
const sizePx: Record<NonNullable<AvatarProps["size"]>, number> = {
  xs: 20,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
  "2xl": 240,
};

// Conic-gradient ring width per size (the avatar's outer padding). Scales
// with the avatar so the ring stays proportional from chip to profile hero.
const ringPx: Record<NonNullable<AvatarProps["size"]>, number> = {
  xs: 1.5,
  sm: 2,
  md: 2.5,
  lg: 3,
  xl: 3.5,
  "2xl": 6,
};

// FNV-1a — small, fast, deterministic. Pure (no Math.random), so it's safe
// to run during render and yields the same ring for the same identity on
// every device and SSR/CSR pass.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Three identity-derived hues swept into a conic gradient for the fallback
// ring. The hues are *generated* per identity, so they can't be design
// tokens — this is the one place raw hsl() is intentional (the neutral fill
// + every other surface stays on tokens).
function conicRingFor(seed: string): string {
  const h = hashSeed(seed);
  const h2 = hashSeed(seed + "x");
  const h3 = hashSeed(seed + "yy");
  // Analogous hues (within ~95°) make a calm tonal sweep rather than a
  // saturated rainbow, and the muted saturation sits with the app's soft,
  // near-monochrome palette instead of standing out as glossy.
  const a = h % 360;
  const b = (a + 28 + (h2 % 34)) % 360;
  const c = (a + 62 + (h3 % 34)) % 360;
  return `conic-gradient(from ${h % 360}deg, hsl(${a} 38% 58%), hsl(${b} 36% 55%), hsl(${c} 34% 52%), hsl(${a} 38% 58%))`;
}

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "",
  size = "md",
  fallbackInitials = "?",
  seed,
  className = "",
  bordered = false,
  shape = "circle",
}) => {
  // Load state per src, so a new src starts over without an effect: the
  // image failed / finished loading only if it's the one that's showing.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const radius = shape === "square" ? "rounded" : "rounded-full";

  const imageError = !!src && failedSrc === src;
  const loaded = !!src && loadedSrc === src;
  const showFallback = !src || imageError;
  const initials = fallbackInitials.slice(0, 2).toUpperCase();
  // The initials are a picture of the name, which is always written out
  // next to the avatar. With no `alt` they are hidden from assistive tech
  // (as an image avatar with alt="" is); with one, the avatar is an image
  // named by it.
  const labelled = alt !== "";
  const imgRole = labelled ? { role: "img" as const, "aria-label": alt } : {};

  // Placeholder: a deterministic conic-gradient ring around the neutral fill
  // + initials. `overflow-hidden` and the flat border are dropped here — the
  // ring (the outer padding showing the gradient) is the visible edge.
  if (showFallback) {
    return (
      <div
        className={`${sizeMap[size]} shrink-0 ${radius} flex items-center justify-center ${className}`}
        style={{
          padding: ringPx[size],
          background: conicRingFor(seed || fallbackInitials || alt || ""),
          // Keep the elevated separator for stacked/overlapping contexts.
          ...(bordered ? { boxShadow: "0 0 0 2px var(--bg-elevated)" } : {}),
        }}
        {...imgRole}
      >
        <div
          className={`w-full h-full ${radius} bg-[var(--color-surface-container-high)] text-[var(--fg-primary)] font-semibold flex items-center justify-center`}
          aria-hidden="true"
        >
          {initials}
        </div>
      </div>
    );
  }

  // The backdrop (transparent in light mode) keeps dark or transparent
  // logos visible against the dark canvas; see --avatar-* in tokens.css.
  const borderStyles = bordered
    ? "border-2 border-[var(--bg-elevated)] bg-[var(--avatar-backdrop)]"
    : "border border-[var(--avatar-ring)] bg-[var(--avatar-backdrop)]";

  return (
    <div
      className={`${sizeMap[size]} relative shrink-0 ${radius} overflow-hidden flex items-center justify-center ${borderStyles} ${className}`}
    >
      {/* Initials on the neutral fill until the image has loaded, so the
          avatar is never a blank circle (e.g. the top-bar account button
          on a slow connection). Removed once loaded, so a transparent
          logo doesn't show letters through it. */}
      {!loaded ? (
        <span
          className={`absolute inset-0 ${radius} bg-[var(--color-surface-container-high)] text-[var(--fg-primary)] font-semibold flex items-center justify-center`}
          aria-hidden="true"
        >
          {initials}
        </span>
      ) : null}
      <Image
        src={src as string}
        alt={alt}
        width={sizePx[size]}
        height={sizePx[size]}
        className="relative w-full h-full object-cover"
        onLoad={() => setLoadedSrc(src as string)}
        onError={() => setFailedSrc(src as string)}
        // unoptimized: avatar URLs come from many foreign sources
        // (Bluesky CDN, foreign PDS getBlob endpoints, our same-
        // origin resolve-did proxy). next.config.ts allowlist only
        // covers **.certified.app; rather than expand it to every
        // possible blob host, skip optimisation for avatars. We
        // still get layout-shift-free rendering from the explicit
        // width/height + the framework's lazy-loading default.
        unoptimized
      />
    </div>
  );
};

export default Avatar;
