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
      className={`rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-6 ${className}`}
    >
      <div className="flex gap-4">
        <AlertCircle className="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" aria-hidden="true" />
        {/* min-w-0 + break-words keep long unbroken messages (URLs, DIDs)
            inside the box. The title is a <p>, not a heading, so the alert
            doesn't skip levels wherever it's placed. */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">{title}</p>
          <p className="text-sm text-[var(--fg-secondary)] break-words">{message}</p>
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
