import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { getBranchPreference, preferenceToBranchId, preferenceToQuery } from '../utils/branch';

const STATUS_TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'active', label: 'Aktif' },
  { key: 'cancelled', label: 'İptal Edilmiş' },
  { key: 'kiosk', label: 'Kiosk İşlemleri' },
];

const KIOSK_ACTION_META = {
  checkout: {
    label: 'Ödünç Al',
    icon: '📖',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  return: {
    label: 'İade Et',
    icon: '↩️',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  search: {
    label: 'Arama',
    icon: '🔍',
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
};

export default function Reservations() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [reservations, setReservations] = useState([]);
  const [kioskStats, setKioskStats] = useState({ total: 0, successful: 0, failed: 0, checkouts: 0, returns: 0 });
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    book_id: '',
    member_id: '',
    book_search: '',
    member_search: '',
  });
  const [books, setBooks] = useState([]);
  const [members, setMembers] = useState([]);
  const [searchingBooks, setSearchingBooks] = useState(false);
  const [searchingMembers, setSearchingMembers] = useState(false);

  useEffect(() => {
    const handler = ev => setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  useEffect(() => {
    loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchPref, status]);

  useEffect(() => {
    const searchHandler = ev => {
      const value = ev.detail ?? '';
      setQuery(value);
      loadReservations(value);
    };
    window.addEventListener('global-search', searchHandler);
    return () => window.removeEventListener('global-search', searchHandler);
  }, [branchPref, status]);

  async function loadReservations(searchOverride = query) {
    setLoading(true);
    try {
      const params = {};
      const trimmed = searchOverride?.trim();
      if (trimmed) {
        params.q = trimmed;
      }
      const branchParam = preferenceToQuery(branchPref);
      if (branchParam !== undefined) params.branch_id = branchParam;
      
      let filtered = [];
      
      // Eğer kiosk modundaysak, kiosk loglarını getir
      if (status === 'kiosk') {
        const { data } = await api.get('/kiosk/logs', { params });
        filtered = Array.isArray(data) ? data : [];
        await loadKioskStats(params);
      } else {
        // Normal rezervasyonları getir
        const { data } = await api.get('/reservations', { params });
        filtered = Array.isArray(data) ? data : [];
        
        // Filtreleme
        if (status === 'active') {
          filtered = filtered.filter(r => r.status === 'active');
        } else if (status === 'cancelled') {
          filtered = filtered.filter(r => r.status === 'cancelled');
        }
      }
      
      setReservations(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadKioskStats(baseParams) {
    try {
      const { data } = await api.get('/kiosk/stats', { params: baseParams });
      setKioskStats({
        total: data?.total ?? 0,
        successful: data?.successful ?? 0,
        failed: data?.failed ?? 0,
        checkouts: data?.checkouts ?? 0,
        returns: data?.returns ?? 0,
      });
    } catch (err) {
      console.error(err);
      setKioskStats({ total: 0, successful: 0, failed: 0, checkouts: 0, returns: 0 });
    }
  }

  async function searchBooks(query) {
    if (!query.trim()) {
      setBooks([]);
      return;
    }
    setSearchingBooks(true);
    try {
      const params = { q: query.trim() };
      const branchParam = preferenceToQuery(branchPref);
      if (branchParam !== undefined) params.branch_id = branchParam;
      const { data } = await api.get('/books', { params });
      setBooks(Array.isArray(data) ? data.slice(0, 10) : []);
    } catch (err) {
      console.error(err);
      setBooks([]);
    } finally {
      setSearchingBooks(false);
    }
  }

  async function searchMembers(query) {
    if (!query.trim()) {
      setMembers([]);
      return;
    }
    setSearchingMembers(true);
    try {
      const params = { q: query.trim() };
      const branchParam = preferenceToQuery(branchPref);
      if (branchParam !== undefined) params.branch_id = branchParam;
      const { data } = await api.get('/members', { params });
      const items = data.items || data || [];
      setMembers(Array.isArray(items) ? items.slice(0, 10) : []);
    } catch (err) {
      console.error(err);
      setMembers([]);
    } finally {
      setSearchingMembers(false);
    }
  }

  async function handleCreate(e) {
    e?.preventDefault();
    if (!createForm.book_id || !createForm.member_id) {
      alert('Kitap ve üye seçimi zorunludur.');
      return;
    }
    try {
      const branchId = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
      await api.post('/reservations', {
        book_id: createForm.book_id,
        member_id: createForm.member_id,
        branch_id: branchId,
      });
      setShowCreate(false);
      setCreateForm({ book_id: '', member_id: '', book_search: '', member_search: '' });
      setBooks([]);
      setMembers([]);
      loadReservations();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Rezervasyon oluşturulurken hata oluştu.';
      alert(errorMsg);
    }
  }

  async function handleCancel(id) {
    if (!window.confirm('Bu rezervasyonu iptal etmek istediğinizden emin misiniz?')) return;
    try {
      await api.delete(`/reservations/${id}`);
      loadReservations();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Rezervasyon iptal edilirken hata oluştu.';
      alert(errorMsg);
    }
  }

  async function handleNotify(id) {
    try {
      await api.post(`/notify/reservations/${id}/ready`);
      alert('Bildirim gönderildi.');
    } catch (err) {
      alert(err.response?.data?.error || 'Bildirim gönderilemedi.');
    }
  }

  const activeReservations = reservations.filter(r => r.status === 'active').length;
  const cancelledReservations = reservations.filter(r => r.status === 'cancelled').length;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">CAL Kütüphane</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Rezervasyonlar</h1>
            <p className="mt-3 text-slate-500 text-sm max-w-lg">
              Kitap rezervasyonlarını yönetin, aktif ve iptal edilmiş rezervasyonları görüntüleyin.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center lg:w-[28rem]">
            <StatCard title="Aktif" value={activeReservations} variant="primary" />
            <StatCard title="İptal Edilmiş" value={cancelledReservations} variant="muted" />
          </div>
        </div>
      </section>

      {status !== 'kiosk' && (
        <section className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>📋 Yeni Rezervasyon</button>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">Arama</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Kitap adı veya üye adı ara..."
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <button className="btn-secondary" onClick={() => loadReservations()}>Ara</button>
            </div>
          </div>
          <div className="flex items-end gap-3">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  status === tab.key ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {status === 'kiosk' ? (
        <KioskLogPanel loading={loading} reservations={reservations} stats={kioskStats} />
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-4 text-sm">
            <span className="font-semibold text-slate-700">Rezervasyon Listesi</span>
            <span className="text-xs text-slate-400 ml-auto">
              Toplam {reservations.length} rezervasyon görüntüleniyor.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Kitap</th>
                  <th className="px-4 py-3 text-left">Üye</th>
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                  <th className="px-4 py-3 text-left">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-slate-500">Yükleniyor...</td>
                  </tr>
                )}
                {!loading && reservations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-slate-400">
                      Rezervasyon bulunamadı.
                    </td>
                  </tr>
                )}
                {!loading &&
                  reservations.map(reservation => (
                    <tr key={reservation.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500">{reservation.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{reservation.book_title || reservation.book?.title || '—'}</div>
                        <div className="text-xs text-slate-500">{reservation.book?.isbn || reservation.isbn || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{reservation.member_name || reservation.member?.name || '—'}</div>
                        <div className="text-xs text-slate-400">{reservation.member?.student_no || reservation.student_no || ''}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(reservation.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          reservation.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : reservation.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {reservation.status === 'active'
                            ? 'Aktif'
                            : reservation.status === 'cancelled'
                            ? 'İptal Edildi'
                            : reservation.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {reservation.status === 'active' && (
                          <button
                            className="text-sm text-rose-600 hover:text-rose-700 font-semibold"
                            onClick={() => handleCancel(reservation.id)}
                          >
                            İptal Et
                          </button>
                        )}
                        <button
                          className="text-sm text-sky-600 hover:text-sky-700 font-semibold"
                          onClick={() => handleNotify(reservation.id)}
                        >
                          Bildirim
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showCreate && (
        <Modal title="Yeni Rezervasyon Oluştur" onClose={() => {
          setShowCreate(false);
          setCreateForm({ book_id: '', member_id: '', book_search: '', member_search: '' });
          setBooks([]);
          setMembers([]);
        }}>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-5 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kitap Ara *</label>
              <div className="relative">
                <input
                  value={createForm.book_search}
                  onChange={e => {
                    setCreateForm(prev => ({ ...prev, book_search: e.target.value }));
                    searchBooks(e.target.value);
                  }}
                  placeholder="Kitap adı veya ISBN ile ara..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                {searchingBooks && (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Aranıyor...</div>
                )}
              </div>
              {books.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                  {books.map(book => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => {
                        setCreateForm(prev => ({ ...prev, book_id: book.id, book_search: book.title }));
                        setBooks([]);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 ${
                        createForm.book_id === book.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="font-semibold">{book.title}</div>
                      <div className="text-xs text-slate-500">{book.author || '—'}</div>
                    </button>
                  ))}
                </div>
              )}
              {createForm.book_id && (
                <div className="mt-2 text-xs text-emerald-600">✓ Kitap seçildi</div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Üye Ara *</label>
              <div className="relative">
                <input
                  value={createForm.member_search}
                  onChange={e => {
                    setCreateForm(prev => ({ ...prev, member_search: e.target.value }));
                    searchMembers(e.target.value);
                  }}
                  placeholder="Üye adı veya okul numarası ile ara..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                {searchingMembers && (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Aranıyor...</div>
                )}
              </div>
              {members.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                  {members.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setCreateForm(prev => ({ ...prev, member_id: member.id, member_search: member.name }));
                        setMembers([]);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 ${
                        createForm.member_id === member.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="font-semibold">{member.name}</div>
                      <div className="text-xs text-slate-500">{member.student_no || member.member_type || '—'}</div>
                    </button>
                  ))}
                </div>
              )}
              {createForm.member_id && (
                <div className="mt-2 text-xs text-emerald-600">✓ Üye seçildi</div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-light" onClick={() => {
                setShowCreate(false);
                setCreateForm({ book_id: '', member_id: '', book_search: '', member_search: '' });
                setBooks([]);
                setMembers([]);
              }}>İptal</button>
              <button type="submit" className="btn-primary" disabled={!createForm.book_id || !createForm.member_id}>📋 Rezervasyon Oluştur</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function KioskLogPanel({ loading, reservations, stats }) {
  return (
    <section className="space-y-6">
      <KioskSummary stats={stats} />
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-500">
          Yükleniyor...
        </div>
      ) : reservations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-400">
          Kiosk işlemi bulunamadı.
        </div>
      ) : (
        <div className="space-y-4">
          {reservations.map(log => (
            <KioskLogCard key={log.id} log={log} />
          ))}
        </div>
      )}
    </section>
  );
}

function KioskSummary({ stats }) {
  const cards = [
    { label: 'Toplam İşlem', value: stats.total, tone: 'bg-sky-600 text-white' },
    { label: 'Başarılı', value: stats.successful, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Başarısız', value: stats.failed, tone: 'bg-rose-100 text-rose-700' },
    { label: 'Ödünç Al', value: stats.checkouts, tone: 'bg-indigo-100 text-indigo-700' },
    { label: 'İade Et', value: stats.returns, tone: 'bg-amber-100 text-amber-700' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map(card => {
        const isPrimary = card.tone.includes('text-white');
        return (
          <div
            key={card.label}
            className={`rounded-2xl px-5 py-4 border border-slate-200 shadow-sm ${card.tone}`}
          >
            <div className={`text-xs uppercase font-semibold tracking-wide ${isPrimary ? 'text-slate-100/80' : 'text-slate-500'}`}>
              {card.label}
            </div>
            <div className={`text-2xl font-semibold mt-2 ${isPrimary ? 'text-white' : ''}`}>
              {card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KioskLogCard({ log }) {
  const actionMeta = KIOSK_ACTION_META[log.action_type] || KIOSK_ACTION_META.search;
  const success = log.success === 1 || log.success === true;
  return (
    <article className="bg-white/90 border border-slate-200 rounded-2xl shadow-lg overflow-hidden backdrop-blur">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 p-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full border ${actionMeta.badge}`}>
            <span className="text-2xl">{actionMeta.icon}</span>
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">İşlem Türü</div>
            <div className="text-xl font-bold text-slate-900">{actionMeta.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${
            success ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'
          }`}>
            {success ? 'Başarılı' : 'Başarısız'}
            <span className="text-xs text-slate-500 font-normal">#{log.id}</span>
          </span>
          <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-xs uppercase text-slate-500 font-semibold">Kitap</div>
            <div className="text-base font-semibold text-slate-900">{log.book_title || log.isbn || '—'}</div>
            {log.isbn && (
              <div className="text-xs text-slate-400">ISBN: {log.isbn}</div>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase text-slate-500 font-semibold">Üye</div>
            <div className="text-base font-semibold text-slate-900">{log.member_name || log.student_no || '—'}</div>
            {log.student_no && (
              <div className="text-xs text-slate-400">Öğrenci No: {log.student_no}</div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-xs uppercase text-slate-500 font-semibold">Zaman</div>
            <div className="text-slate-700 mt-1">{formatDateTime(log.created_at)}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <div className="text-xs uppercase text-slate-500 font-semibold">Kaynak</div>
            <div className="text-slate-700 mt-1">IP Adresi: {log.ip_address || '—'}</div>
          </div>
        </div>
        {!success && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="text-xs uppercase font-semibold tracking-wide">Hata Mesajı</div>
            <div className="mt-1">{log.error_message || 'Detay bulunmuyor.'}</div>
          </div>
        )}
      </div>
    </article>
  );
}

function StatCard({ title, value, variant }) {
  const styles =
    variant === 'primary'
      ? 'bg-blue-600 text-white shadow-lg'
      : variant === 'danger'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-slate-100 text-slate-700';
  return (
    <div className={`rounded-xl px-4 py-3 ${styles}`}>
      <p className="text-xs uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-40 px-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button className="btn-icon text-slate-500" onClick={onClose}>✖</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'long',
  timeStyle: 'short',
});

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_TIME_FORMATTER.format(date);
}
