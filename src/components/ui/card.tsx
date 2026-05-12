import React from "react";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  className = "",
  hoverable = false,
}) => {
  const baseStyles =
    "bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded p-6";

  const hoverStyles = hoverable
    ? "transition-all duration-150 hover:border-[var(--border-hover)]"
    : "";

  return (
    <div className={`${baseStyles} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};

export default Card;
