import React from "react";
import { AlertCircle } from "lucide-react";
import Button from "./button";

export interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
}) => {
  return (
    <div
      role="alert"
      className={`rounded-card border border-error/20 bg-error/5 p-6 ${className}`}
    >
      <div className="flex gap-4">
        <AlertCircle className="w-6 h-6 text-error flex-shrink-0" />
        <div className="flex-1">
          <h4 className="text-h4 text-navy mb-1">{title}</h4>
          <p className="text-body text-gray-700">{message}</p>
          {onRetry && (
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;
