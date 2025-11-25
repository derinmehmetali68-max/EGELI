import React from 'react';

/**
 * Spinner Component - Yüklenme göstergesi
 */
export function Spinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <svg
      className={`animate-spin text-sky-600 dark:text-sky-400 ${sizeClasses[size]} ${className}`}
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
  );
}

/**
 * Skeleton Component - Yükleme placeholder'ı
 */
export function Skeleton({ width, height, className = '', rounded = true }) {
  return (
    <div
      className={`
        animate-pulse bg-slate-200 dark:bg-slate-700
        ${rounded ? 'rounded' : ''}
        ${className}
      `}
      style={{
        width: width || '100%',
        height: height || '1rem',
      }}
    />
  );
}

/**
 * SkeletonText - Metin için skeleton
 */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="1rem"
          width={i === lines - 1 ? '75%' : '100%'}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonCard - Kart için skeleton
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card ${className}`}>
      <Skeleton height="2rem" width="60%" className="mb-4" />
      <SkeletonText lines={3} />
      <div className="flex gap-2 mt-4">
        <Skeleton height="2.5rem" width="100px" />
        <Skeleton height="2.5rem" width="100px" />
      </div>
    </div>
  );
}

/**
 * SkeletonTable - Tablo için skeleton
 */
export function SkeletonTable({ rows = 5, cols = 4, className = '' }) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <table className="table w-full">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <Skeleton height="1.5rem" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: cols }).map((_, colIndex) => (
                <td key={colIndex}>
                  <Skeleton height="1rem" width={colIndex === 0 ? '80%' : '100%'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * LoadingOverlay - Tam ekran yükleme
 */
export function LoadingOverlay({ message = 'Yükleniyor...', className = '' }) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm ${className}`}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
        <Spinner size="lg" />
        {message && (
          <p className="text-slate-700 dark:text-slate-300 font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}









