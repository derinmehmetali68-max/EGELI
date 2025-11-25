import React from 'react';
import EmptyState from './EmptyState';

/**
 * Table Component - Geliştirilmiş tablo bileşeni
 * 
 * @param {boolean} stickyHeader - Sticky header
 * @param {boolean} striped - Zebra pattern
 * @param {boolean} hover - Hover effects
 * @param {Array} columns - Column definitions
 * @param {Array} data - Table data
 * @param {function} onRowClick - Row click handler
 * @param {React.ReactNode} emptyState - Custom empty state
 */
export default function Table({
  columns = [],
  data = [],
  stickyHeader = false,
  striped = false,
  hover = true,
  onRowClick,
  emptyState,
  className = '',
  ...props
}) {
  const tableClasses = [
    'table w-full border-collapse',
    stickyHeader ? 'table-sticky' : '',
    striped ? 'table-striped' : '',
    hover ? 'table-hover' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (data.length === 0) {
    return emptyState || (
      <EmptyState
        icon="📋"
        title="Veri bulunamadı"
        description="Bu tabloda görüntülenecek veri yok."
      />
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={tableClasses} {...props}>
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.key || index}
                className={col.className || ''}
                style={col.style}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              onClick={() => onRowClick?.(row, rowIndex)}
              className={onRowClick ? 'cursor-pointer' : ''}
            >
              {columns.map((col, colIndex) => (
                <td
                  key={col.key || colIndex}
                  className={col.cellClassName || ''}
                  style={col.cellStyle}
                >
                  {col.render
                    ? col.render(row[col.key], row, rowIndex)
                    : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}









