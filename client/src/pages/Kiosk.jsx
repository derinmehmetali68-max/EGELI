import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import api from '../api';
import { resolveAssetUrl } from '../utils/url';
import { getThemePreference, setThemePreference } from '../utils/theme';

function Kiosk() {
  const [language, setLanguage] = useState('tr'); // 'tr' | 'en'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanInput, setScanInput] = useState('');
  const scanInputRef = useRef(null);
  const [lastScanned, setLastScanned] = useState(null);
  
  // Ödünç alma ve iade durumları
  const [mode, setMode] = useState('search'); // 'search', 'checkout', 'return'
  const [checkoutIsbn, setCheckoutIsbn] = useState('');
  const [checkoutStudentNo, setCheckoutStudentNo] = useState('');
  const [returnIsbn, setReturnIsbn] = useState('');
  const [returnStudentNo, setReturnStudentNo] = useState('');
  const [processing, setProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [pin, setPin] = useState(() => localStorage.getItem('kiosk_pin') || '');
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);
  const [theme, setTheme] = useState(() => getThemePreference());

  const t = useMemo(() => {
    const tr = {
      kiosk: 'Kiosk Modu',
      search: 'Kitap Ara',
      checkout: 'Ödünç Al',
      return: 'İade Et',
      isbn: 'Kitap ISBN',
      student: 'Öğrenci Numarası',
      lastScan: 'Son okutulan barkod',
      pinLabel: 'PIN (gerekliyse)',
      pinHint: 'Sunucuda PIN tanımlıysa işlem için gereklidir.',
      idle: 'Ekran koruyucu · Herhangi bir tuşa basın',
    };
    const en = {
      kiosk: 'Kiosk Mode',
      search: 'Search',
      checkout: 'Checkout',
      return: 'Return',
      isbn: 'Book ISBN',
      student: 'Student No',
      lastScan: 'Last scanned barcode',
      pinLabel: 'PIN (if required)',
      pinHint: 'Needed if server requires a PIN.',
      idle: 'Screensaver · Press any key',
    };
    return language === 'en' ? en : tr;
  }, [language]);

  function resetIdle() {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 60000);
  }

  useEffect(() => {
    resetIdle();
    const onAny = () => resetIdle();
    window.addEventListener('mousemove', onAny);
    window.addEventListener('keydown', onAny);
    return () => {
      window.removeEventListener('mousemove', onAny);
      window.removeEventListener('keydown', onAny);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const themeHandler = (ev) => setTheme(ev.detail ?? getThemePreference());
    window.addEventListener('theme-change', themeHandler);
    return () => window.removeEventListener('theme-change', themeHandler);
  }, []);

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemePreference(newTheme);
    setTheme(newTheme);
  }

  const handleBarcode = async (barcode) => {
    setLastScanned(barcode);
    setError(null);
    setLoading(true);
    try {
      // Bu kısımda, barkodun bir kitaba mı yoksa bir üyeye mi ait olduğunu belirlemek için
      // bir mantık kurmanız gerekecek. Şimdilik, barkodun bir kitap ISBN'i olduğunu varsayıyoruz.
      const response = await api.get(`/public/books?q=${barcode}`);
      if (response.data.length > 0) {
        setResults(response.data);
      } else {
        setError('Bu barkoda sahip kitap bulunamadı.');
      }
    } catch (err) {
      setError('Barkod işlenirken bir hata oluştu.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/public/books?q=${query}`);
      setResults(response.data);
    } catch (err) {
      setError('Kitaplar aranırken bir hata oluştu.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutBarcode = useCallback((barcode) => {
    // Eğer ISBN yoksa, ISBN olarak kullan; yoksa student_no olarak kullan
    if (!checkoutIsbn) {
      setCheckoutIsbn(barcode);
    } else if (!checkoutStudentNo) {
      setCheckoutStudentNo(barcode);
    }
  }, [checkoutIsbn, checkoutStudentNo]);

  const handleReturnBarcode = useCallback((barcode) => {
    if (!returnIsbn) {
      setReturnIsbn(barcode);
    } else if (!returnStudentNo) {
      setReturnStudentNo(barcode);
    }
  }, [returnIsbn, returnStudentNo]);

  useEffect(() => {
    const handleScan = (e) => {
      if (document.activeElement !== scanInputRef.current) {
        if (e.key === 'Enter') {
          const scannedValue = scanInput.trim();
          if (scannedValue) {
            if (mode === 'search') {
              handleBarcode(scannedValue);
            } else if (mode === 'checkout') {
              handleCheckoutBarcode(scannedValue);
            } else if (mode === 'return') {
              handleReturnBarcode(scannedValue);
            }
          }
          setScanInput('');
        } else {
          setScanInput(prev => prev + e.key);
        }
      }
    };
    window.addEventListener('keydown', handleScan);
    return () => window.removeEventListener('keydown', handleScan);
  }, [scanInput, mode, handleCheckoutBarcode, handleReturnBarcode]);

  const handleCheckout = async () => {
    if (!checkoutIsbn || !checkoutStudentNo) {
      setError('ISBN ve Öğrenci numarası zorunludur.');
      return;
    }
    
    setProcessing(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await api.post('/public/kiosk/checkout', {
        isbn: checkoutIsbn,
        student_no: checkoutStudentNo,
        pin: pin || undefined,
      });
      
      setSuccessMessage(`Ödünç verme başarılı! Son iade tarihi: ${response.data.due_date}`);
      setCheckoutIsbn('');
      setCheckoutStudentNo('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Ödünç verme sırasında bir hata oluştu.';
      setError(errorMsg);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleReturn = async () => {
    if (!returnIsbn || !returnStudentNo) {
      setError('ISBN ve Öğrenci numarası zorunludur.');
      return;
    }
    
    setProcessing(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await api.post('/public/kiosk/return', {
        isbn: returnIsbn,
        student_no: returnStudentNo,
        pin: pin || undefined,
      });
      
      setSuccessMessage('İade işlemi başarılı!');
      setReturnIsbn('');
      setReturnStudentNo('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'İade işlemi sırasında bir hata oluştu.';
      setError(errorMsg);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-white dark:from-black dark:via-slate-900 dark:to-black dark:text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white drop-shadow-sm">{t.kiosk}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="rounded-full bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-white text-xl px-5 py-3 shadow-md transition font-semibold"
            title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm"
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 mb-6">
        <label className="block text-xs uppercase text-slate-500 dark:text-slate-400 font-semibold mb-1">{t.pinLabel}</label>
        <input
          type="password"
          value={pin}
          onChange={e => {
            setPin(e.target.value);
            localStorage.setItem('kiosk_pin', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-white dark:text-black px-3 py-2 text-sm"
          placeholder="PIN"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.pinHint}</p>
      </div>

      {/* Mod Seçim Butonları */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          onClick={() => { setMode('search'); clearMessages(); }}
          className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
            mode === 'search' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600'
          }`}
        >
          🔍 Kitap Ara
        </button>
        <button
          onClick={() => { setMode('checkout'); clearMessages(); }}
          className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
            mode === 'checkout' 
              ? 'bg-green-500 text-white' 
              : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600'
          }`}
        >
          📖 Ödünç Al
        </button>
        <button
          onClick={() => { setMode('return'); clearMessages(); }}
          className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
            mode === 'return' 
              ? 'bg-orange-500 text-white' 
              : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600'
          }`}
        >
          ↩️ İade Et
        </button>
      </div>

      {/* Arama Modu */}
      {mode === 'search' && (
        <div className="max-w-3xl mx-auto mb-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg p-6">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex-1 flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Kitap adı, yazar, ISBN veya barkod girin..."
                className="flex-1 px-4 py-3 text-lg text-slate-700 dark:text-white dark:bg-slate-800 focus:outline-none"
              />
              <button
                onClick={handleSearch}
                className="px-6 py-3 bg-blue-500 text-white font-semibold hover:bg-blue-600 transition-colors"
              >
                {loading ? 'Aranıyor...' : 'Ara'}
              </button>
            </div>
            <div className="md:w-72">
              <input
                ref={scanInputRef}
                type="text"
                placeholder="Barkod okuyucu için buraya odaklanın"
                className="w-full px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-400"
                onFocus={() => setScanInput('')}
              />
            </div>
          </div>
          {lastScanned && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Son okutulan barkod: <span className="font-semibold text-slate-700 dark:text-slate-300">{lastScanned}</span>
            </p>
          )}
        </div>
      )}

      {/* Ödünç Alma Modu */}
      {mode === 'checkout' && (
        <div className="max-w-md mx-auto mb-8">
          <div className="bg-white dark:bg-slate-900 border-2 border-green-200 dark:border-green-700 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-green-700 dark:text-green-400">📖 Ödünç Alma</h2>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 dark:text-white">Kitap ISBN</label>
              <input
                type="text"
                value={checkoutIsbn}
                onChange={(e) => setCheckoutIsbn(e.target.value)}
                placeholder="Kitap barkodunu okuyun"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 dark:bg-white dark:text-black rounded-lg text-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 dark:text-white">Öğrenci Numarası</label>
              <input
                type="text"
                value={checkoutStudentNo}
                onChange={(e) => setCheckoutStudentNo(e.target.value)}
                placeholder="Öğrenci numarasını okuyun"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 dark:bg-white dark:text-black rounded-lg text-lg"
              />
            </div>
            <div className="mb-4">
              <input
                ref={scanInputRef}
                type="text"
                placeholder="Barkod okuyucu için buraya odaklanın"
                className="w-full px-4 py-2 border border-dashed border-gray-400 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-800 dark:text-white"
                onFocus={() => setScanInput('')}
              />
            </div>
            <button
              onClick={handleCheckout}
              disabled={processing || !checkoutIsbn || !checkoutStudentNo}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
                processing || !checkoutIsbn || !checkoutStudentNo
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {processing ? 'İşleniyor...' : 'Ödünç Al'}
            </button>
          </div>
        </div>
      )}

      {/* İade Modu */}
      {mode === 'return' && (
        <div className="max-w-md mx-auto mb-8">
          <div className="bg-white dark:bg-slate-900 border-2 border-orange-200 dark:border-orange-700 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-orange-700 dark:text-orange-400">↩️ İade Etme</h2>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 dark:text-white">Kitap ISBN</label>
              <input
                type="text"
                value={returnIsbn}
                onChange={(e) => setReturnIsbn(e.target.value)}
                placeholder="Kitap barkodunu okuyun"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 dark:bg-white dark:text-black rounded-lg text-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 dark:text-white">Öğrenci Numarası</label>
              <input
                type="text"
                value={returnStudentNo}
                onChange={(e) => setReturnStudentNo(e.target.value)}
                placeholder="Öğrenci numarasını okuyun"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 dark:bg-white dark:text-black rounded-lg text-lg"
              />
            </div>
            <div className="mb-4">
              <input
                ref={scanInputRef}
                type="text"
                placeholder="Barkod okuyucu için buraya odaklanın"
                className="w-full px-4 py-2 border border-dashed border-gray-400 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-800 dark:text-white"
                onFocus={() => setScanInput('')}
              />
            </div>
            <button
              onClick={handleReturn}
              disabled={processing || !returnIsbn || !returnStudentNo}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
                processing || !returnIsbn || !returnStudentNo
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              {processing ? 'İşleniyor...' : 'İade Et'}
            </button>
          </div>
        </div>
      )}

      {/* Mesajlar */}
      {error && (
        <div className="max-w-md mx-auto mb-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={clearMessages} className="text-red-700 hover:text-red-900">
              ✕
            </button>
          </div>
        </div>
      )}
      
      {successMessage && (
        <div className="max-w-md mx-auto mb-4">
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{successMessage}</span>
            <button onClick={clearMessages} className="text-green-700 hover:text-green-900">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Arama Sonuçları */}
      {mode === 'search' && (
        <div className="mt-12">
          {results.length > 0 ? (
            <div className="space-y-6">
              {results.map((book) => {
                const categoryList = String(book.category || '')
                  .split(',')
                  .map(item => item.trim())
                  .filter(Boolean);
                const availability = Number(book.available) || 0;
                const statusClass = availability > 0
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-rose-100 text-rose-700 border-rose-200';
                const coverUrl = resolveAssetUrl(book.cover_path);
                const titleInitial = (book.title || 'K').charAt(0).toUpperCase();

                return (
                  <article
                    key={`${book.id}-${book.isbn}`}
                    className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row hover:shadow-2xl transition-transform duration-300 hover:-translate-y-1"
                  >
                    <div className="md:w-56 lg:w-64 w-full md:flex-shrink-0">
                      <div className="relative w-full aspect-[2/3] overflow-hidden bg-slate-200">
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={book.title}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-300 via-slate-200 to-slate-100 text-6xl font-extrabold text-slate-500">
                            {titleInitial}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 p-6 md:p-8 flex flex-col gap-6">
                      <header className="space-y-2">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{book.title || 'Başlık belirtilmemiş'}</h2>
                        <p className="text-lg text-slate-600 dark:text-slate-300 font-medium">{book.author || 'Yazar belirtilmemiş'}</p>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                          <span>ISBN: <strong className="text-slate-700 dark:text-slate-300">{book.isbn || '—'}</strong></span>
                          {book.published_year && (
                            <span>Yayın: <strong className="text-slate-700">{book.published_year}</strong></span>
                          )}
                          {book.language && (
                            <span>Dil: <strong className="text-slate-700">{book.language}</strong></span>
                          )}
                          {book.publisher && (
                            <span>Yayınevi: <strong className="text-slate-700">{book.publisher}</strong></span>
                          )}
                        </div>
                      </header>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold ${statusClass}`}>
                          {availability > 0 ? 'Mevcut' : 'Mevcut Değil'}
                          <span className="text-xs font-normal text-slate-500">({availability} / {book.copies ?? 0})</span>
                        </span>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 text-sm font-medium">
                          📚 Toplam kopya: {book.copies ?? 0}
                        </span>
                      </div>

                      {categoryList.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-500">Kategoriler</h3>
                          <div className="flex flex-wrap gap-2">
                            {categoryList.map(category => (
                              <span key={category} className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                                {category}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                          <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Konum Bilgileri</h4>
                          <p className="text-slate-600 dark:text-slate-300">Raf: <strong className="text-slate-800 dark:text-slate-200">{book.shelf || 'Belirtilmemiş'}</strong></p>
                          <p className="text-slate-600 dark:text-slate-300">Dolap: <strong className="text-slate-800 dark:text-slate-200">{book.cabinet || 'Belirtilmemiş'}</strong></p>
                        </div>
                        <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                          <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Durum Özeti</h4>
                          <p className="text-slate-600 dark:text-slate-300">
                            {availability > 0
                              ? 'Bu kitap şu anda ödünç alınabilir. Personelden yardım alarak ödünç işlemini başlatabilirsiniz.'
                              : 'Kitap şu anda ödünçte. Teslim edildiğinde tekrar raflara yerleştirilecektir.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400">
              Arama sonucunu burada görüntüleyin.
            </p>
          )}
        </div>
      )}

      {idle && (
        <div className="fixed inset-0 bg-slate-900/80 text-white flex flex-col items-center justify-center text-center z-50" onClick={() => setIdle(false)}>
          <div className="text-6xl mb-4">⏳</div>
          <div className="text-2xl font-semibold">{t.idle}</div>
          <div className="text-sm text-slate-200 mt-2">PIN girilmişse hafızada tutulur.</div>
        </div>
      )}
      </div>
    </div>
  );
}

export default Kiosk;
