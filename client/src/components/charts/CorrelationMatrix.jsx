import React, { useMemo, useState } from 'react';

/**
 * CorrelationMatrix - Kategori ilişkilerini gösteren matris
 * Hangi kategorilerin birlikte okunduğunu görselleştirir
 * 
 * @param {Array<{category1: string, category2: string, value: number}>} data - Korelasyon verisi
 * @param {Array<string>} categories - Kategori listesi
 */
export default function CorrelationMatrix({ data, categories, title = 'Kategori İlişkileri' }) {
    const [hoveredCell, setHoveredCell] = useState(null);

    // Veriyi matris formatına dönüştür
    const matrix = useMemo(() => {
        const map = new Map();
        data.forEach(item => {
            map.set(`${item.category1}-${item.category2}`, item.value);
            map.set(`${item.category2}-${item.category1}`, item.value); // Simetrik
        });
        return map;
    }, [data]);

    const cellSize = 40;
    const labelWidth = 120;
    const width = categories.length * cellSize + labelWidth;
    const height = categories.length * cellSize + labelWidth;

    // Renk hesaplama (0-1 arası değer için)
    const getColor = (value) => {
        if (value === undefined || value === 0) return '#F8FAFC'; // Slate 50

        // Mor tonları (Purple)
        const intensity = Math.round(value * 255);
        // Açık mor -> Koyu mor
        return `rgba(147, 51, 234, ${0.1 + value * 0.9})`;
    };

    return (
        <div className="space-y-4 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[600px]">
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Düşük İlişki</span>
                    <div className="flex gap-0.5">
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map((val, i) => (
                            <div
                                key={i}
                                className="w-4 h-4 rounded-sm"
                                style={{ backgroundColor: `rgba(147, 51, 234, ${val})` }}
                            />
                        ))}
                    </div>
                    <span>Yüksek İlişki</span>
                </div>
            </div>

            <div className="relative bg-white rounded-xl border border-slate-200 p-4 inline-block">
                <svg width={width} height={height} className="font-sans text-xs">
                    {/* Sütun Başlıkları (Dikey) */}
                    <g transform={`translate(${labelWidth}, ${labelWidth - 10})`}>
                        {categories.map((cat, i) => (
                            <text
                                key={`col-${i}`}
                                x={i * cellSize + cellSize / 2}
                                y={0}
                                transform={`rotate(-45, ${i * cellSize + cellSize / 2}, 0)`}
                                textAnchor="start"
                                className="fill-slate-500 font-medium"
                            >
                                {cat}
                            </text>
                        ))}
                    </g>

                    {/* Satır Başlıkları ve Hücreler */}
                    <g transform={`translate(0, ${labelWidth})`}>
                        {categories.map((rowCat, i) => (
                            <g key={`row-${i}`}>
                                {/* Satır Etiketi */}
                                <text
                                    x={labelWidth - 10}
                                    y={i * cellSize + cellSize / 2 + 4}
                                    textAnchor="end"
                                    className="fill-slate-600 font-medium"
                                >
                                    {rowCat}
                                </text>

                                {/* Hücreler */}
                                {categories.map((colCat, j) => {
                                    const isDiagonal = i === j;
                                    const value = isDiagonal ? 1 : (matrix.get(`${rowCat}-${colCat}`) || 0);
                                    const isHovered = hoveredCell?.row === i && hoveredCell?.col === j;

                                    return (
                                        <g key={`cell-${i}-${j}`}>
                                            <rect
                                                x={labelWidth + j * cellSize}
                                                y={i * cellSize}
                                                width={cellSize - 2}
                                                height={cellSize - 2}
                                                rx={4}
                                                fill={isDiagonal ? '#F1F5F9' : getColor(value)}
                                                className={`transition-all cursor-pointer ${isHovered ? 'stroke-purple-500 stroke-2' : ''
                                                    }`}
                                                onMouseEnter={() => setHoveredCell({ row: i, col: j, value })}
                                                onMouseLeave={() => setHoveredCell(null)}
                                            />
                                            {/* Değer (sadece yeterince büyükse göster) */}
                                            {!isDiagonal && value > 0.2 && (
                                                <text
                                                    x={labelWidth + j * cellSize + cellSize / 2}
                                                    y={i * cellSize + cellSize / 2 + 4}
                                                    textAnchor="middle"
                                                    className={`pointer-events-none font-bold ${value > 0.5 ? 'fill-white' : 'fill-slate-700'}`}
                                                >
                                                    {value.toFixed(1)}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        ))}
                    </g>
                </svg>

                {/* Tooltip */}
                {hoveredCell && (
                    <div
                        className="absolute z-10 bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-xs pointer-events-none"
                        style={{
                            left: labelWidth + hoveredCell.col * cellSize + cellSize,
                            top: labelWidth + hoveredCell.row * cellSize,
                        }}
                    >
                        <div className="font-semibold mb-1">
                            {categories[hoveredCell.row]} & {categories[hoveredCell.col]}
                        </div>
                        {hoveredCell.row === hoveredCell.col ? (
                            <span className="text-slate-400">Aynı kategori</span>
                        ) : (
                            <div className="text-purple-300">
                                İlişki Gücü: <span className="font-bold text-white">{hoveredCell.value?.toFixed(2) || '0.00'}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
