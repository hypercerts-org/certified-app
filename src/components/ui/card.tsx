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
    "bg-white border border-gray-100 rounded-sm p-6";

  const hoverStyles = hoverable
    ? "transition-all duration-150 hover:border-gray-200"
    : "";

  return (
    <div className={`${baseStyles} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};

export default Card;
