import React, { useMemo, useState } from 'react';

/**
 * ShelfMap - Raf Doluluk Haritası
 * Kütüphane raflarının doluluk oranlarını görselleştirir
 * 
 * @param {Array<{shelf: string, total: number, capacity: number}>} data - Raf verileri
 * @param {string} title - Başlık
 */
export default function ShelfMap({ data, title = 'Raf Doluluk Durumu' }) {
    const [hoveredShelf, setHoveredShelf] = useState(null);

    // Rafları grupla (Örn: A1, A2, B1, B2 -> A ve B blokları)
    const shelves = useMemo(() => {
        // Varsayılan kapasite (eğer veri yoksa)
        const DEFAULT_CAPACITY = 50;

        return data.map(item => ({
            ...item,
            capacity: item.capacity || DEFAULT_CAPACITY,
            occupancyRate: Math.min(100, (item.total / (item.capacity || DEFAULT_CAPACITY)) * 100)
        })).sort((a, b) => a.shelf.localeCompare(b.shelf));
    }, [data]);

    // Renk hesaplama
    const getColor = (rate) => {
        if (rate >= 90) return '#EF4444'; // Kırmızı (Dolu)
        if (rate >= 70) return '#F97316'; // Turuncu (Yoğun)
        if (rate >= 40) return '#EAB308'; // Sarı (Orta)
        return '#22C55E'; // Yeşil (Müsait)
    };

    const getStatusText = (rate) => {
        if (rate >= 90) return 'Dolu';
        if (rate >= 70) return 'Yoğun';
        if (rate >= 40) return 'Orta';
        return 'Müsait';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <div className="flex items-center gap-3 text-xs font-medium">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-slate-600">Müsait (%0-40)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <span className="text-slate-600">Orta (%40-70)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                        <span className="text-slate-600">Yoğun (%70-90)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span className="text-slate-600">Dolu (%90+)</span>
                    </div>
                </div>
            </div>

            {shelves.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <div className="text-4xl mb-3">🏢</div>
                    <h4 className="text-slate-900 font-medium">Raf Bilgisi Bulunamadı</h4>
                    <p className="text-slate-500 text-sm mt-1">Kitaplarınıza raf bilgisi (Örn: A-1, B-3) ekleyerek bu haritayı kullanabilirsiniz.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {shelves.map((shelf) => (
                        <div
                            key={shelf.shelf}
                            className="relative group"
                            onMouseEnter={() => setHoveredShelf(shelf)}
                            onMouseLeave={() => setHoveredShelf(null)}
                        >
                            {/* Raf Görünümü */}
                            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden">
                                {/* Doluluk Barı (Arkaplan) */}
                                <div
                                    className="absolute bottom-0 left-0 w-full transition-all duration-500 opacity-10"
                                    style={{
                                        height: `${shelf.occupancyRate}%`,
                                        backgroundColor: getColor(shelf.occupancyRate)
                                    }}
                                />

                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <span className="text-lg font-bold text-slate-700">{shelf.shelf}</span>
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: getColor(shelf.occupancyRate) }}
                                    />
                                </div>

                                <div className="space-y-1 relative z-10">
                                    <div className="text-xs text-slate-500">Doluluk</div>
                                    <div className="flex items-end gap-1">
                                        <span className="text-xl font-bold text-slate-900">{shelf.total}</span>
                                        <span className="text-xs text-slate-400 mb-1">/ {shelf.capacity}</span>
                                    </div>
                                </div>

                                {/* Kitaplar (Görsel Efekt) */}
                                <div className="flex gap-0.5 mt-3 h-8 items-end opacity-50">
                                    {Array.from({ length: Math.min(10, Math.ceil(shelf.occupancyRate / 10)) }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="flex-1 rounded-t-sm"
                                            style={{
                                                height: `${30 + Math.random() * 70}%`,
                                                backgroundColor: getColor(shelf.occupancyRate)
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                <div className="font-bold text-sm mb-1">Raf {shelf.shelf}</div>
                                <div className="flex justify-between py-1 border-b border-slate-700">
                                    <span className="text-slate-400">Durum:</span>
                                    <span style={{ color: getColor(shelf.occupancyRate) }}>{getStatusText(shelf.occupancyRate)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-700">
                                    <span className="text-slate-400">Kitap Sayısı:</span>
                                    <span>{shelf.total}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-400">Doluluk:</span>
                                    <span>%{shelf.occupancyRate.toFixed(1)}</span>
                                </div>
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 border-4 border-transparent border-t-slate-900"></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
