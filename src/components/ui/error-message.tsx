import React from "react";
import { AlertCircle } from "lucide-react";
import Button from "./button";

export interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 p-6 ${className}`}
    >
      <div className="flex items-center gap-2 text-error">
        <AlertCircle className="w-5 h-5" />
        <p className="text-body text-error">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
};

export default ErrorMessage;
