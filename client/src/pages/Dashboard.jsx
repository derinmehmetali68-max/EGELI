import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';

const numberFormatter = new Intl.NumberFormat('tr-TR');
const DEFAULT_COORDS = { latitude: 41.0369, longitude: 29.1116 };
const DEFAULT_LOCATION_LABEL = 'Beykoz, İstanbul';
const WEATHER_CODE_MAP = {
  0: 'Açık',
  1: 'Çoğunlukla açık',
  2: 'Parçalı bulutlu',
  3: 'Bulutlu',
  45: 'Sisli',
  48: 'Donan sis',
  51: 'Hafif çise',
  53: 'Orta şiddetli çise',
  55: 'Şiddetli çise',
  56: 'Dondurucu hafif çise',
  57: 'Dondurucu şiddetli çise',
  61: 'Hafif yağmur',
  63: 'Yağmur',
  65: 'Şiddetli yağmur',
  66: 'Dondurucu hafif yağmur',
  67: 'Dondurucu şiddetli yağmur',
  71: 'Hafif kar',
  73: 'Kar',
  75: 'Yoğun kar',
  77: 'Kar taneleri',
  80: 'Hafif sağanak',
  81: 'Sağanak',
  82: 'Şiddetli sağanak',
  85: 'Kar sağanağı',
  86: 'Şiddetli kar sağanağı',
  95: 'Gök gürültülü fırtına',
  96: 'Dolu ile fırtına',
  99: 'Şiddetli dolulu fırtına',
};

const GUIDE_STEPS = [
  {
    title: '1. Envanteri Güncelleyin',
    description: 'Kitap eklemek, düzenlemek ve stokları yönetmek için “Kitaplar” bölümünü kullanın.',
    icon: '📚',
  },
  {
    title: '2. Üye Yönetimi',
    description: 'Üye kayıtlarını oluşturun, düzenleyin ve kartlarını yazdırın.',
    icon: '🧑‍🎓',
  },
  {
    title: '3. Ödünç & İade',
    description: 'Ödünç verme ve iade işlemlerini “İşlemler” veya kiosk üzerinden takip edin.',
    icon: '🔄',
  },
  {
    title: '4. Takip & Analiz',
    description: 'İstatistikler ve raporlar sekmelerinden kullanım performansını izleyin.',
    icon: '📈',
  },
  {
    title: '5. Sistem Ayarları',
    description: 'Şube, kullanıcı ve bildirim ayarlarını yöneterek sistemi özelleştirin.',
    icon: '⚙️',
  },
];

export default function Dashboard() {
  const [now, setNow] = useState(() => new Date());
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const [summary, setSummary] = useState({
    books: 0,
    members: 0,
    activeLoans: 0,
    overdueLoans: 0,
    dueToday: 0,
  });
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [locationLabel, setLocationLabel] = useState('Konum belirleniyor...');
  const [usingCoordsLabel, setUsingCoordsLabel] = useState(false);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoadingSummary(true);
    const params = {};
    Promise.all([
      api.get('/books', { params }),
      api.get('/members', { params }),
      api.get('/loans', { params }),
    ])
      .then(([booksRes, membersRes, loansRes]) => {
        const booksArray = Array.isArray(booksRes.data?.items)
          ? booksRes.data.items
          : Array.isArray(booksRes.data)
            ? booksRes.data
            : [];
        const membersArray = Array.isArray(membersRes.data?.items)
          ? membersRes.data.items
          : Array.isArray(membersRes.data)
            ? membersRes.data
            : [];
        const loansArray = Array.isArray(loansRes.data?.items)
          ? loansRes.data.items
          : Array.isArray(loansRes.data)
            ? loansRes.data
            : [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        let activeLoans = 0;
        let overdueLoans = 0;
        let dueToday = 0;

        loansArray.forEach(loan => {
          const isReturned = Boolean(loan.return_date);
          if (!isReturned) {
            activeLoans += 1;
            const dueDate = loan.due_date ? new Date(loan.due_date) : null;
            if (dueDate) {
              const dueTime = new Date(dueDate);
              dueTime.setHours(0, 0, 0, 0);
              if (dueTime < today) {
                overdueLoans += 1;
              } else if (dueTime >= today && dueTime < tomorrow) {
                dueToday += 1;
              }
            }
          }
        });

        setSummary({
          books: booksArray.length,
          members: membersArray.length,
          activeLoans,
          overdueLoans,
          dueToday,
        });
      })
      .catch(() => {
        setSummary({
          books: 0,
          members: 0,
          activeLoans: 0,
          overdueLoans: 0,
          dueToday: 0,
        });
      })
      .finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setCoords(DEFAULT_COORDS);
      setLocationLabel(`${DEFAULT_LOCATION_LABEL} (varsayılan)`);
      setUsingCoordsLabel(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude || DEFAULT_COORDS.latitude;
        const longitude = position.coords.longitude || DEFAULT_COORDS.longitude;
        setCoords({ latitude, longitude });
        setLocationLabel(`Enlem ${latitude.toFixed(2)}°, Boylam ${longitude.toFixed(2)}°`);
        setUsingCoordsLabel(true);
      },
      () => {
        setCoords(DEFAULT_COORDS);
        setLocationLabel(`${DEFAULT_LOCATION_LABEL} (varsayılan)`);
        setUsingCoordsLabel(false);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWeather() {
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const query = new URLSearchParams({
          latitude: coords.latitude.toFixed(4),
          longitude: coords.longitude.toFixed(4),
          current_weather: 'true',
          timezone: 'auto',
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`);
        if (!response.ok) {
          throw new Error('Hava durumu bilgisi alınamadı.');
        }
        const data = await response.json();
        if (cancelled) return;

        if (data?.current_weather) {
          setWeather({
            temperature: data.current_weather.temperature,
            windspeed: data.current_weather.windspeed,
            weathercode: data.current_weather.weathercode,
            time: data.current_weather.time,
            timezone: data.timezone,
          });
          if (usingCoordsLabel && data?.timezone) {
            const nice = data.timezone.split('/').pop()?.replace(/_/g, ' ') ?? data.timezone;
            setLocationLabel(nice);
            setUsingCoordsLabel(false);
          }
        } else {
          setWeather(null);
          setWeatherError('Hava durumu bilgisi bulunamadı.');
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherError(error.message);
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false);
        }
      }
    }
    loadWeather();
    return () => {
      cancelled = true;
    };
  }, [coords, usingCoordsLabel]);

  const timeString = useMemo(() => {
    return new Intl.DateTimeFormat('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);
  }, [now]);

  const dateString = useMemo(() => {
    return new Intl.DateTimeFormat('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
  }, [now]);

  const monthYearString = useMemo(() => {
    return new Intl.DateTimeFormat('tr-TR', {
      month: 'long',
      year: 'numeric',
    }).format(now);
  }, [now]);

  const calendarDays = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Pazartesi=0
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, month, day));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const weekdayLabels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const coordsDisplay = useMemo(() => `${coords.latitude.toFixed(2)}°, ${coords.longitude.toFixed(2)}°`, [coords]);
  const weatherDescription = useMemo(() => {
    if (!weather) return '';
    return WEATHER_CODE_MAP[weather.weathercode] ?? 'Durum bilinmiyor';
  }, [weather]);
  const weatherUpdatedAt = useMemo(() => {
    if (!weather?.time) return '';
    const parsed = new Date(weather.time);
    if (Number.isNaN(parsed.getTime())) return weather.time;
    return parsed.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }, [weather]);
  const summaryCards = useMemo(() => ([
    {
      label: 'Toplam Kitap',
      value: loadingSummary ? '...' : numberFormatter.format(summary.books),
      accent: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      icon: '📚',
      detail: 'Envanterde kayıtlı kitap sayısı',
    },
    {
      label: 'Toplam Üye',
      value: loadingSummary ? '...' : numberFormatter.format(summary.members),
      accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      icon: '👥',
      detail: 'Aktif kayıtlı üye sayısı',
    },
    {
      label: 'Aktif Ödünç',
      value: loadingSummary ? '...' : numberFormatter.format(summary.activeLoans),
      accent: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
      icon: '🔄',
      detail: 'Şu anda kullanıcıda bulunan kitaplar',
    },
    {
      label: 'Gecikmiş Ödünç',
      value: loadingSummary ? '...' : numberFormatter.format(summary.overdueLoans),
      accent: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      icon: '⚠️',
      detail: 'Teslim tarihi geçmiş işlemler',
    },
    {
      label: 'Bugün Teslim',
      value: loadingSummary ? '...' : numberFormatter.format(summary.dueToday),
      accent: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      icon: '📅',
      detail: 'Bugün iadesi beklenen kitaplar',
    },
  ]), [loadingSummary, summary]);

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="card relative overflow-hidden p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-50 via-white to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-900 opacity-50 pointer-events-none" />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-2">Beykoz Cumhuriyet Anadolu Lisesi</p>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">Kütüphane Paneli</h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl">
            Hoş geldiniz. Kütüphane operasyonlarını buradan yönetebilir, istatistikleri takip edebilir ve günlük işlemleri gerçekleştirebilirsiniz.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_minmax(300px,1fr)]">
        <section className="relative rounded-3xl overflow-hidden shadow-2xl group">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507842217121-9e93c8aaf27c?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay" />

          <div className="relative h-full p-8 lg:p-12 flex flex-col justify-center text-white">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-300">Canlı Zaman</p>
            </div>

            <div className="space-y-2">
              <span className="block text-7xl lg:text-8xl font-bold tabular-nums tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                {timeString}
              </span>
              <p className="text-2xl lg:text-3xl font-medium text-slate-300 capitalize border-l-4 border-sky-500 pl-4">
                {dateString}
              </p>
            </div>
          </div>
        </section>

        <section className="card p-0 overflow-hidden bg-slate-900 text-white border-none">
          <div className="p-6 bg-white/5 backdrop-blur-sm border-b border-white/10">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Bu Ayın Takvimi</p>
            <p className="text-lg font-semibold mt-1 capitalize">{monthYearString}</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-slate-500 mb-4">
              {weekdayLabels.map(label => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-sm">
              {calendarDays.map((dateObj, index) => {
                if (!dateObj) {
                  return <span key={`empty-${index}`} className="aspect-square rounded-lg bg-white/5" />;
                }
                const cellKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
                const isToday = cellKey === todayKey;
                return (
                  <div
                    key={cellKey}
                    className={`aspect-square flex items-center justify-center rounded-lg transition-all ${isToday
                        ? 'bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/30 scale-110'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                  >
                    {dateObj.getDate()}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card flex flex-col justify-between group hover:border-sky-200 dark:hover:border-sky-800 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Canlı Konum</h3>
              <span className="p-2 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
              {locationLabel}
            </p>
            <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-2 bg-slate-100 dark:bg-slate-800 inline-block px-2 py-1 rounded">
              {coordsDisplay}
            </p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
            Konum bilgisi tarayıcı izinlerine göre alınır.
          </p>
        </div>

        <div className="relative rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 text-white p-8">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-black/10 rounded-full blur-2xl" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/80">Hava Durumu</h3>
              {weatherLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            </div>

            {weatherError ? (
              <p className="text-white/90">{weatherError}</p>
            ) : weather ? (
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-6xl font-bold tracking-tighter mb-2">{Math.round(weather.temperature)}°</div>
                  <div className="text-xl font-medium text-white/90 capitalize">{weatherDescription}</div>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-sm text-white/80 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                    💨 {Math.round(weather.windspeed)} km/sa
                  </div>
                  <div className="text-xs text-white/60 mt-2">
                    Son güncelleme: {weatherUpdatedAt}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-white/90">Veri yok</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {summaryCards.map((card, index) => (
          <div
            key={card.label}
            className="card hover:shadow-md transition-all duration-300 group animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl ${card.accent} transition-transform group-hover:scale-110`}>
                <span className="text-xl">{card.icon}</span>
              </div>
            </div>
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight block mb-1">
                {card.value}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {card.label}
              </span>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2">
                {card.detail}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="card p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <span className="text-2xl">🚀</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Hızlı Başlangıç Kılavuzu</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sistemi verimli kullanmak için önerilen adımlar
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {GUIDE_STEPS.map((step, index) => (
            <div
              key={step.title}
              className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-sky-200 dark:hover:border-sky-800 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-all duration-300 cursor-default"
            >
              <div className="flex items-center gap-4 mb-4">
                <span className="text-3xl group-hover:scale-110 transition-transform duration-300 filter grayscale group-hover:grayscale-0">
                  {step.icon}
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-sky-700 dark:group-hover:text-sky-400 transition-colors">
                  {step.title}
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
