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
          <label className="block mb-1.5 font-sans text-xs uppercase tracking-[0.12em] text-gray-400">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`h-11 w-full border ${
            error ? "border-error/40" : "border-gray-200"
          } rounded-sm bg-white px-4 text-sm font-sans text-gray-700 placeholder:text-gray-400 focus:border-black focus:outline-none transition-all duration-150 ${className}`}
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

Input.displayName = "Input";

export default Input;
