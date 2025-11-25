import React, { useState } from 'react';

/**
 * Input Component - Geliştirilmiş input bileşeni
 * 
 * @param {string} label - Label text
 * @param {string} error - Error message
 * @param {string} helperText - Helper text
 * @param {boolean} floatingLabel - Floating label style
 * @param {React.ReactNode} icon - Left icon
 * @param {React.ReactNode} rightIcon - Right icon
 */
export default function Input({
  label,
  error,
  helperText,
  floatingLabel = false,
  icon,
  rightIcon,
  className = '',
  required = false,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = props.value !== '' && props.value !== undefined && props.value !== null;

  const inputClasses = [
    'input',
    error ? 'border-red-500 focus:ring-red-500 dark:border-red-500' : '',
    icon ? 'pl-10' : '',
    rightIcon ? 'pr-10' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const containerClasses = [
    'relative',
    floatingLabel ? 'input-floating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      {label && !floatingLabel && (
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        )}
        
        {floatingLabel && (
          <label
            className={`absolute left-4 transition-all duration-200 pointer-events-none ${
              focused || hasValue
                ? 'top-2 text-xs text-sky-600 dark:text-sky-400'
                : 'top-1/2 -translate-y-1/2 text-base text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <input
          className={inputClasses}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            {rightIcon}
          </div>
        )}
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
          <span>⚠️</span>
          {error}
        </p>
      )}
      
      {helperText && !error && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {helperText}
        </p>
      )}
    </div>
  );
}









