"use client";

import React from "react";
import Image from "next/image";

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  fallbackInitials?: string;
  className?: string;
  bordered?: boolean;
}

const sizeMap = {
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
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
  "2xl": 240,
};

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "",
  size = "md",
  fallbackInitials = "?",
  className = "",
  bordered = false,
}) => {
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => { setImageError(false) }, [src]);

  const borderStyles = bordered
    ? "border-2 border-[var(--bg-elevated)]"
    : "border border-[var(--border-subtle)]";

  const showFallback = !src || imageError;
  const px = sizePx[size];

  return (
    <div
      className={`${sizeMap[size]} shrink-0 rounded-full overflow-hidden flex items-center justify-center ${borderStyles} ${className}`}
    >
      {showFallback ? (
        <div className="w-full h-full bg-[var(--color-surface-container-high)] text-[var(--fg-primary)] font-semibold flex items-center justify-center">
          {fallbackInitials.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <Image
          src={src as string}
          alt={alt}
          width={px}
          height={px}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
          // unoptimized: avatar URLs come from many foreign sources
          // (Bluesky CDN, foreign PDS getBlob endpoints, our same-
          // origin resolve-did proxy). next.config.ts allowlist only
          // covers **.certified.app; rather than expand it to every
          // possible blob host, skip optimisation for avatars. We
          // still get layout-shift-free rendering from the explicit
          // width/height + the framework's lazy-loading default.
          unoptimized
        />
      )}
    </div>
  );
};

export default Avatar;
