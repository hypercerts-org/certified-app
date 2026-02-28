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
    "bg-white border border-[rgba(15,37,68,0.1)] rounded p-6";

  const hoverStyles = hoverable
    ? "transition-all duration-150 hover:border-[rgba(15,37,68,0.18)]"
    : "";

  return (
    <div className={`${baseStyles} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};

export default Card;
