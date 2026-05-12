"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import Brandmark from "@/components/ui/brandmark";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  className = "",
}) => {
  const sizeMap = {
    sm: "h-6 w-6",
    md: "h-12 w-12",
    lg: "h-16 w-16",
  };

  // Primary: pulsing brandmark (uses currentColor so it adapts to theme)
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ color: "var(--fg-primary)" }}
    >
      <Brandmark
        size="100%"
        title="Loading"
        className={`${sizeMap[size]} animate-pulse`}
        style={{
          animationDuration: "1.5s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      <span className="sr-only">Loading</span>
      <noscript>
        <Loader2 className={`${sizeMap[size]} animate-spin`} aria-label="Loading" />
      </noscript>
    </div>
  );
};

export default LoadingSpinner;
