import React from "react";
import { CheckCircle, Clock } from "lucide-react";

export interface BadgeProps {
  variant: "verified" | "pending" | "unverified";
  children?: React.ReactNode;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  variant,
  children,
  className = "",
}) => {
  const baseStyles =
    "rounded-sm px-2 py-0.5 text-xs font-sans font-medium uppercase tracking-widest inline-flex items-center gap-1.5";

  const variantConfig = {
    verified: {
      styles: "bg-cream text-gray-600",
      icon: <CheckCircle className="h-3.5 w-3.5" />,
    },
    pending: {
      styles: "bg-cream text-gray-600",
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    unverified: {
      styles: "bg-cream text-gray-600",
      icon: null,
    },
  };

  const config = variantConfig[variant];

  return (
    <span className={`${baseStyles} ${config.styles} ${className}`}>
      {config.icon}
      {children}
    </span>
  );
};

export default Badge;
