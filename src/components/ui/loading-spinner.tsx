"use client";

import React from "react";
import { Loader2 } from "lucide-react";

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

  const [useFallback, setUseFallback] = React.useState(false);

  React.useEffect(() => {
    // Check if brandmark SVG exists
    const img = new Image();
    img.src = "/assets/certified_brandmark.svg";
    img.onerror = () => setUseFallback(true);
  }, []);

  if (useFallback) {
    // Fallback: spinning circle in accent color
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2
          className={`${sizeMap[size]} text-accent animate-spin`}
          aria-label="Loading"
        />
      </div>
    );
  }

  // Primary: pulsing brandmark
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/assets/certified_brandmark.svg"
        alt="Loading"
        className={`${sizeMap[size]} animate-pulse`}
        style={{
          animationDuration: "1.5s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          img {
            animation: none !important;
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;
