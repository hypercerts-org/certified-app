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
    "rounded-full px-3 py-1 text-body-sm font-medium inline-flex items-center gap-1.5";

  const variantConfig = {
    verified: {
      styles: "bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]",
      icon: <CheckCircle className="h-4 w-4" aria-hidden="true" />,
    },
    pending: {
      styles: "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)]",
      icon: <Clock className="h-4 w-4" aria-hidden="true" />,
    },
    unverified: {
      styles:
        "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)] border border-[var(--badge-neutral-border)]",
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
