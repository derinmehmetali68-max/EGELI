import React from 'react';

/**
 * Button Component - Geliştirilmiş buton bileşeni
 * 
 * @param {string} variant - 'primary' | 'secondary' | 'ghost' | 'light' | 'icon'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} loading - Loading state
 * @param {boolean} disabled - Disabled state
 * @param {React.ReactNode} children - Button content
 * @param {string} className - Additional classes
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  className = '',
  icon,
  iconPosition = 'left',
  ...props
}) {
  const baseClasses = 'btn';
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    light: 'btn-light',
    icon: 'btn-icon',
  };
  const sizeClasses = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  };

  const classes = [
    baseClasses,
    variantClasses[variant] || variantClasses.primary,
    sizeClasses[size] || '',
    loading ? 'btn-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const iconElement = icon && (
    <span className={loading ? 'opacity-0' : ''}>{icon}</span>
  );

  const content = (
    <>
      {loading && (
        <svg
          className="animate-spin h-5 w-5 absolute"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {iconPosition === 'left' && iconElement}
      <span className={loading ? 'opacity-0' : ''}>{children}</span>
      {iconPosition === 'right' && iconElement}
    </>
  );

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {content}
    </button>
  );
}









