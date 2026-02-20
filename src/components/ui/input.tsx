import React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-body-sm font-medium text-navy mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`h-12 w-full border-[1.5px] ${
            error ? "border-error" : "border-gray-200"
          } rounded-button px-4 text-body text-gray-700 placeholder:text-gray-400 focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none transition-all duration-200 ${className}`}
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

Input.displayName = "Input";

export default Input;
