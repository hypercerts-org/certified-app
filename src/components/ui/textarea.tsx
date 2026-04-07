import React, { useId } from "react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  rows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, rows = 3, className = "", id, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id || autoId;
    const errorId = error ? `${textareaId}-error` : undefined;
    const helperId = !error && helperText ? `${textareaId}-helper` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="app-card__label block mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full border ${
            error ? "border-error/40" : "border-[rgba(15,37,68,0.15)]"
          } rounded bg-white px-4 py-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-accent focus:ring-1 focus:ring-accent/20 focus:outline-none transition-all duration-150 resize-y ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-error">{error}</p>
        )}
        {!error && helperText && (
          <p id={helperId} className="mt-1.5 text-xs text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
