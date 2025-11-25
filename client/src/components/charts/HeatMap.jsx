import React, { useMemo, useState } from 'react';

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * HeatMap - Isı haritası bileşeni
 * Gün ve saatlere göre ödünç alma aktivitesini görselleştirir
 * 
 * @param {Array<Array<number>>} data - 7x24 matris (gün x saat)
 * @param {number} cellSize - Her hücrenin boyutu (px)
 * @param {string} title - Başlık
 */
export default function HeatMap({ data, cellSize = 35, title = 'Ödünç Alma Aktivitesi' }) {
    const [hoveredCell, setHoveredCell] = useState(null);

    // Maksimum değeri bul ve normalize et
    const { normalizedData, maxValue, minValue } = useMemo(() => {
        let max = 0;
        let min = Infinity;

        data.forEach(row => {
            row.forEach(val => {
                if (val > max) max = val;
                if (val < min) min = val;
            });
        });

        const normalized = data.map(row =>
            row.map(val => {
                if (max === min) return 0;
                return (val - min) / (max - min);
            })
        );

        return {
            normalizedData: normalized,
            maxValue: max,
            minValue: min,
        };
    }, [data]);

    // Renk hesaplama - Açık maviden koyu maviye gradient
    const getColor = (normalizedValue, actualValue) => {
        if (actualValue === 0) {
            return '#F1F5F9'; // Gri - hiç aktivite yok
        }

        // Mavi tonları gradient: açık mavi -> koyu mavi
        const hue = 210; // Mavi
        const saturation = 100;
        const lightness = 95 - (normalizedValue * 60); // 95% -> 35%

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    const width = HOURS.length * cellSize + 60; // +60 for labels
    const height = DAYS.length * cellSize + 40; // +40 for labels

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Az</span>
                    <div className="flex gap-0.5">
                        {[0, 0.25, 0.5, 0.75, 1].map((val, i) => (
                            <div
                                key={i}
                                className="w-4 h-4 rounded-sm"
                                style={{ backgroundColor: getColor(val, val > 0 ? 1 : 0) }}
                            />
                        ))}
                    </div>
                    <span>Çok</span>
                    {maxValue > 0 && (
                        <span className="ml-2 font-semibold">Max: {maxValue}</span>
                    )}
                </div>
            </div>

            <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 overflow-x-auto">
                <svg width={width} height={height} className="font-sans">
                    {/* Saat başlıkları */}
                    <g>
                        {HOURS.map((hour, i) => (
                            <text
                                key={`hour-${hour}`}
                                x={60 + i * cellSize + cellSize / 2}
                                y={15}
                                textAnchor="middle"
                                className="text-[10px] fill-slate-500 dark:fill-slate-400"
                            >
                                {hour}:00
                            </text>
                        ))}
                    </g>

                    {/* Gün başlıkları ve hücreler */}
                    {DAYS.map((day, dayIndex) => (
                        <g key={`day-${dayIndex}`}>
                            {/* Gün etiketi */}
                            <text
                                x={50}
                                y={30 + dayIndex * cellSize + cellSize / 2 + 5}
                                textAnchor="end"
                                className="text-xs fill-slate-600 dark:fill-slate-300 font-medium"
                            >
                                {day}
                            </text>

                            {/* Saat hücreleri */}
                            {HOURS.map((hour, hourIndex) => {
                                const value = data[dayIndex][hourIndex];
                                const normalizedValue = normalizedData[dayIndex][hourIndex];
                                const isHovered = hoveredCell?.day === dayIndex && hoveredCell?.hour === hourIndex;

                                return (
                                    <g key={`cell-${dayIndex}-${hourIndex}`}>
                                        <rect
                                            x={60 + hourIndex * cellSize}
                                            y={20 + dayIndex * cellSize}
                                            width={cellSize - 2}
                                            height={cellSize - 2}
                                            rx={4}
                                            fill={getColor(normalizedValue, value)}
                                            className={`transition-all cursor-pointer ${isHovered ? 'stroke-slate-900 dark:stroke-white stroke-2' : 'stroke-slate-100 dark:stroke-slate-700'
                                                }`}
                                            onMouseEnter={() => setHoveredCell({ day: dayIndex, hour: hourIndex })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                        />
                                        {/* Değer göster (eğer varsa) */}
                                        {value > 0 && (
                                            <text
                                                x={60 + hourIndex * cellSize + cellSize / 2}
                                                y={20 + dayIndex * cellSize + cellSize / 2 + 4}
                                                textAnchor="middle"
                                                className={`text-[10px] font-semibold pointer-events-none ${normalizedValue > 0.5 ? 'fill-white' : 'fill-slate-700 dark:fill-slate-300'
                                                    }`}
                                            >
                                                {value}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    ))}
                </svg>

                {/* Hover tooltip */}
                {hoveredCell && (
                    <div className="absolute top-2 right-2 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
                        <div className="font-semibold">{DAYS[hoveredCell.day]}</div>
                        <div className="text-slate-300">Saat: {hoveredCell.hour}:00 - {hoveredCell.hour + 1}:00</div>
                        <div className="text-sky-400 font-bold mt-1">
                            {data[hoveredCell.day][hoveredCell.hour]} ödünç
                        </div>
                    </div>
                )}
            </div>

            {maxValue === 0 && (
                <div className="text-center text-slate-500 py-8">
                    Henüz ödünç alma verisi bulunmuyor.
                </div>
            )}
        </div>
    );
}
