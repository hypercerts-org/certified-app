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
          <label className="block mb-1.5 font-sans text-xs uppercase tracking-[0.12em] text-gray-400">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={`w-full border ${
            error ? "border-error/40" : "border-gray-200"
          } rounded-sm bg-white px-4 py-3 text-sm font-sans text-gray-700 placeholder:text-gray-400 focus:border-black focus:outline-none transition-all duration-150 resize-y ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs font-sans text-error">{error}</p>
        )}
        {!error && helperText && (
          <p className="mt-1.5 text-xs font-sans text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
