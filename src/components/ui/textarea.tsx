import React from "react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  rows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, rows = 3, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-body-sm font-medium text-navy mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={`w-full border-[1.5px] ${
            error ? "border-error" : "border-gray-200"
          } rounded-button px-4 py-3 text-body text-gray-700 placeholder:text-gray-400 focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none transition-all duration-200 resize-y ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-body-sm text-error">{error}</p>
        )}
        {!error && helperText && (
          <p className="mt-1.5 text-body-sm text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
