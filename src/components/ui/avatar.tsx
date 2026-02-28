import React from "react";

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "sm" | "md" | "lg" | "xl";
  fallbackInitials?: string;
  className?: string;
  bordered?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "",
  size = "md",
  fallbackInitials = "?",
  className = "",
  bordered = false,
}) => {
  const [imageError, setImageError] = React.useState(false);

  const sizeMap = {
    sm: "h-8 w-8 text-body-sm",
    md: "h-12 w-12 text-body",
    lg: "h-16 w-16 text-h4",
    xl: "h-24 w-24 text-h3",
  };

  const borderStyles = bordered ? "border-2 border-white" : "";

  const showFallback = !src || imageError;

  return (
    <div
      className={`${sizeMap[size]} rounded-full overflow-hidden flex items-center justify-center ${borderStyles} ${className}`}
    >
      {showFallback ? (
        <div className="w-full h-full bg-navy text-white font-semibold flex items-center justify-center">
          {fallbackInitials.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  );
};

export default Avatar;
