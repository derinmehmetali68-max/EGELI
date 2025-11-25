import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { resolveAssetUrl } from '../utils/url';
export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchBook() {
      setLoading(true);
      try {
        const { data } = await api.get(`/books/${id}`);
        if (!cancelled) {
          setBook(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Kayıt bulunamadı.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchBook();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // useMemo hook'larını her zaman çalıştır (conditional render'dan önce)
  const [localIP, setLocalIP] = useState(() => {
    // localStorage'dan kaydedilmiş IP'yi al
    return localStorage.getItem('localIP') || '';
  });

  // IP adresini localStorage'a kaydet
  const handleIPChange = (e) => {
    const ip = e.target.value.trim();
    setLocalIP(ip);
    if (ip) {
      localStorage.setItem('localIP', ip);
    } else {
      localStorage.removeItem('localIP');
    }
  };

  const qrUrl = useMemo(() => {
    if (!book?.id) return '';
    // QR kod için tam URL oluştur - telefon için yerel IP kullan
    let baseUrl = window.location.origin;
    
    // Eğer localhost ise ve IP ayarlanmışsa, yerel IP'ye çevir
    if ((baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) && localIP) {
      const port = window.location.port || '5173';
      baseUrl = `http://${localIP}:${port}`;
    }
    
    const qrData = encodeURIComponent(`${baseUrl}/?data=book:${book.id}`);
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrData}`;
  }, [book?.id, localIP]);

  const tags = useMemo(() => {
    if (!book?.category) return [];
    return book.category.split(',').map(s => s.trim()).filter(Boolean);
  }, [book?.category]);

  const coverUrl = resolveAssetUrl(book?.cover_path);

  if (loading) {
    return <div className="text-center text-slate-500">Yükleniyor...</div>;
  }

  if (error || !book) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center space-y-4">
        <p className="text-slate-500">{error || 'Kayıt bulunamadı.'}</p>
        <button className="btn-secondary" onClick={() => navigate(-1)}>Geri Dön</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button className="btn-light" onClick={() => navigate(-1)}>← Kitap listesine dön</button>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <h1 className="text-2xl font-semibold text-slate-900">{book.title}</h1>
          <p className="text-sm text-slate-500 mt-1">ID #{book.id} · ISBN {book.isbn || '—'}</p>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center min-h-[500px]">
              {coverUrl ? (
                <img 
                  src={coverUrl} 
                  alt={book.title} 
                  className="max-h-[500px] w-full max-w-md rounded shadow-lg object-contain"
                  style={{
                    imageRendering: 'auto',
                  }}
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
              ) : null}
              <div className="text-slate-400 text-sm" style={{display: coverUrl ? 'none' : 'block'}}>Kapak bulunamadı</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center space-y-3">
              <div className="text-xs uppercase tracking-widest text-slate-400">QR Kod</div>
              <img src={qrUrl} alt="QR kod" className="mx-auto h-40 w-40 object-contain" />
              <div className="text-left">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Telefon için Yerel IP (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={localIP}
                  onChange={handleIPChange}
                  placeholder="192.168.1.100"
                  className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Telefondan erişim için bilgisayarınızın yerel IP adresini girin. IP'nizi bulmak için: Windows'ta komut satırına `ipconfig` yazın ve "IPv4" adresini kopyalayın.
                </p>
              </div>
              <p className="text-xs text-slate-400 mt-2">Ödünç verme sırasında hızlı erişim için tarayabilirsiniz.</p>
            </div>
          </div>
          <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-6">
            <section>
              <h2 className="text-sm font-semibold uppercase text-slate-500 tracking-wide mb-3">Temel Bilgiler</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <DetailRow label="ISBN" value={book.isbn || '—'} />
                <DetailRow label="Yazar(lar)" value={book.author || '—'} />
                <DetailRow label="Yayınevi" value={book.publisher || '—'} />
                <DetailRow label="Yayın Tarihi" value={book.published_year || '—'} />
                <DetailRow label="Sayfa Sayısı" value={book.page_count ? `${book.page_count} sayfa` : '—'} />
                <DetailRow label="Dil" value={book.language || '—'} />
                <DetailRow label="Kategori" value={tags && tags.length ? tags.join(', ') : '—'} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase text-slate-500 tracking-wide mb-3">Envanter</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <DetailRow label="Toplam Adet" value={book.copies ?? 0} />
                <DetailRow label="Mevcut" value={book.available ?? 0} />
                <DetailRow label="Raf" value={book.shelf || '—'} />
                <DetailRow label="Dolap" value={book.cabinet || '—'} />
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-400 font-semibold tracking-wide">{label}</div>
      <div className="mt-1 text-slate-700 font-medium">{value}</div>
    </div>
  );
}
