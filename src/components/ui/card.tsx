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
    "bg-white border border-gray-200 rounded-card shadow-elevation-1 p-6";

  const hoverStyles = hoverable
    ? "transition-all duration-[250ms] ease-out hover:shadow-elevation-2 hover:-translate-y-0.5"
    : "";

  return (
    <div className={`${baseStyles} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};

export default Card;
