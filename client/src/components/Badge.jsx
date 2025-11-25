import React from 'react';

/**
 * Badge Component - Etiket bileşeni
 * 
 * @param {string} variant - 'success' | 'error' | 'warning' | 'info' | 'default'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {React.ReactNode} children - Badge içeriği
 */
export default function Badge({
  variant = 'default',
  size = 'md',
  children,
  className = '',
  dot = false,
  ...props
}) {
  const variantClasses = {
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    error: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    info: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    default: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const classes = [
    'inline-flex items-center gap-1.5 rounded-full border font-semibold',
    variantClasses[variant] || variantClasses.default,
    sizeClasses[size] || sizeClasses.md,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...props}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${
          variant === 'success' ? 'bg-emerald-500' :
          variant === 'error' ? 'bg-red-500' :
          variant === 'warning' ? 'bg-amber-500' :
          variant === 'info' ? 'bg-blue-500' :
          'bg-slate-500'
        }`} />
      )}
      {children}
    </span>
  );
}









