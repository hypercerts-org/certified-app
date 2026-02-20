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
      styles: "bg-[#E8F5E9] text-[#1B7A3D]",
      icon: <CheckCircle className="h-4 w-4" />,
    },
    pending: {
      styles: "bg-[#FFF3E0] text-[#B37100]",
      icon: <Clock className="h-4 w-4" />,
    },
    unverified: {
      styles: "bg-gray-50 text-gray-400 border border-gray-200",
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
