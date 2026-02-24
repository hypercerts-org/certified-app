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
      className={`rounded border border-error/20 bg-error/5 p-6 ${className}`}
    >
      <div className="flex gap-4">
        <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-mono text-sm font-semibold text-navy uppercase tracking-wider mb-1">{title}</h4>
          <p className="text-sm text-gray-700">{message}</p>
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
