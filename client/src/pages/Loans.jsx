import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { getBranchPreference, preferenceToBranchId, preferenceToQuery } from '../utils/branch';
import { withAuth } from '../utils/url';
import { Modal, Input, Button, Badge, useToast, EmptyState, SkeletonTable } from '../components';
import { validateForm } from '../utils/validation';

const STATUS_TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'active', label: 'Ödünçte' },
  { key: 'returned', label: 'İade Edilmiş' },
];

const defaultDueDate = (days = 14) => {
  const base = new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
};

export default function Loans() {
  const { success, error: showError, warning, info } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [rawLoans, setRawLoans] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [settings, setSettings] = useState({ loan_days_default: '14' });
  const [checkoutForm, setCheckoutForm] = useState({
    isbn: '',
    student_no: '',
    due_date: '',
  });
  const [checkoutErrors, setCheckoutErrors] = useState({});
  const [returnForm, setReturnForm] = useState({
    isbn: '',
    student_no: '',
  });
  const [returnErrors, setReturnErrors] = useState({});
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [extendingLoanId, setExtendingLoanId] = useState(null);
  const [extendConfirm, setExtendConfirm] = useState(null);

  useEffect(() => {
    const handler = ev => setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings(r.data || { loan_days_default: '14' });
      const days = Number(r.data?.loan_days_default) || 14;
      setCheckoutForm(prev => ({ ...prev, due_date: defaultDueDate(days) }));
    }).catch(() => {
      setCheckoutForm(prev => ({ ...prev, due_date: defaultDueDate(14) }));
    });
  }, []);

  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'overdue') {
      setShowOverdue(true);
      // URL'yi temizle
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    loadLoans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchPref, status]);

  useEffect(() => {
    const searchHandler = ev => {
      const value = ev.detail ?? '';
      setQuery(value);
      loadLoans(value);
    };
    window.addEventListener('global-search', searchHandler);
    return () => window.removeEventListener('global-search', searchHandler);
  }, [branchPref, status]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const branchParam = preferenceToQuery(branchPref);
  const overduePdfUrl = useMemo(() => {
    const params = {};
    if (branchParam !== undefined) params.branch_id = branchParam;
    return withAuth('/reports/overdue.pdf', params);
  }, [branchParam]);
  const loansPdfUrl = useMemo(() => {
    const params = {};
    if (branchParam !== undefined) params.branch_id = branchParam;
    if (query.trim()) params.q = query.trim();
    if (status !== 'all') params.status = status;
    return withAuth('/reports/loans.pdf', params);
  }, [branchParam, query, status]);

  async function loadLoans(searchOverride = query) {
    setLoading(true);
    try {
      const params = {};
      if (searchOverride?.trim()) params.q = searchOverride.trim();
      if (branchParam !== undefined) params.branch_id = branchParam;
      if (status !== 'all') params.status = status;
      const { data } = await api.get('/loans', { params });
      setRawLoans(data);
      setLoans(data);
      setSelectedRows(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function overdueLoans() {
    return rawLoans.filter(loan => {
      if (loan.return_date) return false;
      const info = calculateRemainingInfo(loan.due_date, nowTick);
      return info?.overdue;
    });
  }

  function toggleRow(id) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedRows.size === loans.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(loans.map(l => l.id)));
    }
  }

  async function handleCheckout(e) {
    e?.preventDefault();
    if (!checkoutForm.isbn || !checkoutForm.student_no) {
      showError('ISBN ve okul numarası zorunludur');
      return;
    }

    // Validation
    const validationSchema = {
      isbn: { required: true, requiredMessage: 'ISBN zorunludur' },
      student_no: { required: true, requiredMessage: 'Öğrenci numarası zorunludur' },
      due_date: { required: true, requiredMessage: 'Teslim tarihi zorunludur', date: true },
    };

    const validation = validateForm(checkoutForm, validationSchema);
    if (!validation.isValid) {
      setCheckoutErrors(validation.errors);
      showError('Lütfen form hatalarını düzeltin');
      return;
    }

    setCheckoutErrors({});
    try {
      const branchId = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
      await api.post('/loans/checkout', {
        isbn: checkoutForm.isbn,
        student_no: checkoutForm.student_no,
        due_date: checkoutForm.due_date,
        branch_id: branchId,
      });
      setShowCheckout(false);
      const days = getDefaultLoanDays(settings);
      setCheckoutForm({ isbn: '', student_no: '', due_date: defaultDueDate(days) });
      loadLoans();
    } catch (err) {
      const data = err.response?.data || {};
      let errorMsg =
        data.error || data.detail || err.message || 'Ödünç verme sırasında hata oluştu.';
      if (data.overdue_loans) {
        errorMsg += `\nGecikmiş işlem: ${data.overdue_loans}`;
      }
      if (data.active_loans !== undefined && data.limit !== undefined) {
        errorMsg += `\nAktif ödünç: ${data.active_loans} / Limit: ${data.limit}`;
      }
      if (data.note) {
        errorMsg += `\nNot: ${data.note}`;
      }
      console.error('Checkout hatası:', err.response?.data || err);
      showError(errorMsg);
    }
  }

  async function handleReturn(e) {
    e?.preventDefault();
    if (!returnForm.isbn || !returnForm.student_no) {
      showError('ISBN ve okul numarası zorunludur');
      return;
    }

    // Validation
    const validationSchema = {
      isbn: { required: true, requiredMessage: 'ISBN zorunludur' },
      student_no: { required: true, requiredMessage: 'Öğrenci numarası zorunludur' },
      due_date: { required: true, requiredMessage: 'Teslim tarihi zorunludur', date: true },
    };

    const validation = validateForm(checkoutForm, validationSchema);
    if (!validation.isValid) {
      setCheckoutErrors(validation.errors);
      showError('Lütfen form hatalarını düzeltin');
      return;
    }

    setCheckoutErrors({});
    try {
      await api.post('/loans/return', {
        isbn: returnForm.isbn,
        student_no: returnForm.student_no,
      });
      setShowReturn(false);
      setReturnForm({ isbn: '', student_no: '' });
      setReturnErrors({});
      setCheckResult(null);
      loadLoans();
      success('Kitap başarıyla iade alındı!');
    } catch (err) {
      console.error('Return hatası - tam detay:', err);
      console.error('Return hatası - response:', err.response);
      console.error('Return hatası - response data:', err.response?.data);
      console.error('Return hatası - response data stringified:', JSON.stringify(err.response?.data, null, 2));
      console.error('Return hatası - error message:', err.message);
      console.error('Return hatası - status:', err.response?.status);
      console.error('Return hatası - statusText:', err.response?.statusText);
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'İade alınırken hata oluştu.';
      console.error('Return hatası - Gösterilecek mesaj:', errorMsg);
      showError(`İade Hatası: ${errorMsg}`);
    }
  }

  async function handleExtend(loan, days = 15) {
    if (!loan?.id) return;
    setExtendConfirm({ loan, days });
  }

  async function confirmExtend() {
    if (!extendConfirm) return;
    const { loan, days } = extendConfirm;
    try {
      setExtendingLoanId(loan.id);
      await api.post(`/loans/${loan.id}/extend`, { days });
      await loadLoans();
    } catch (err) {
      console.error('Süre uzatma hatası:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Süre uzatılamadı.';
      showError(errorMsg);
    } finally {
      setExtendingLoanId(null);
    }
  }

  async function handleCheckLoan() {
    if (!returnForm.isbn || !returnForm.student_no) {
      showError('ISBN ve okul numarası gerekli');
      return;
    }

    // Validation
    const validationSchema = {
      isbn: { required: true, requiredMessage: 'ISBN zorunludur' },
      student_no: { required: true, requiredMessage: 'Öğrenci numarası zorunludur' },
    };

    const validation = validateForm(returnForm, validationSchema);
    if (!validation.isValid) {
      setReturnErrors(validation.errors);
      showError('Lütfen form hatalarını düzeltin');
      return;
    }

    setReturnErrors({});
    setChecking(true);
    try {
      const { data } = await api.post('/loans/check', {
        isbn: returnForm.isbn,
        student_no: returnForm.student_no,
      });
      setCheckResult(data);
    } catch (err) {
      console.error('Check hatası - tam detay:', err);
      console.error('Check hatası - response:', err.response);
      console.error('Check hatası - response data:', err.response?.data);
      console.error('Check hatası - response data stringified:', JSON.stringify(err.response?.data, null, 2));
      console.error('Check hatası - error message:', err.message);
      console.error('Check hatası - status:', err.response?.status);
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Aktif işlem bulunamadı.';
      console.error('Check hatası - Gösterilecek mesaj:', errorMsg);
      setCheckResult({ error: errorMsg });
    } finally {
      setChecking(false);
    }
  }

  const totalLoans = rawLoans.length;
  const activeLoans = rawLoans.filter(l => !l.return_date).length;
  const overdueCount = overdueLoans().length;

  return (
    <div className="space-y-3 w-full">
      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 rounded-xl shadow-sm border border-slate-200 p-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">CAL Kütüphane</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Ödünç İşlemleri</h1>
            <p className="mt-3 text-slate-500 text-sm max-w-lg">
              Kitap ödünç verme ve iade süreçlerini yönetin, geciken kitapları kolayca kontrol edin.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center lg:w-[28rem]">
            <StatCard title="Aktif Ödünç" value={activeLoans} variant="primary" />
            <StatCard title="Geciken" value={overdueCount} variant="danger" />
            <StatCard title="Toplam İşlem" value={totalLoans} variant="muted" />
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setShowCheckout(true)}>📘 Ödünç Ver</button>
        <button className="btn-secondary" onClick={() => setShowReturn(true)}>↩️ İade Al</button>
        <button className="btn-secondary" onClick={() => setShowOverdue(true)}>⚠️ Geciken Kitaplar</button>
        <a className="btn-secondary" href={loansPdfUrl} target="_blank" rel="noreferrer">📝 PDF İndir</a>
        <a className="btn-secondary" href={overduePdfUrl} target="_blank" rel="noreferrer">⚠️ Gecikenler PDF</a>
      </section>

      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 border border-slate-200 rounded-lg shadow-sm p-3 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">Arama</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Kitap adı, üye adı veya numara ara..."
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <button className="btn-secondary" onClick={() => loadLoans()}>Ara</button>
            </div>
          </div>
          <div className="flex items-end gap-3">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${status === tab.key ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-4 text-sm">
          <span className="font-semibold text-slate-700">İşlem Listesi</span>
          <span className="text-xs text-slate-400 ml-auto">Toplam {loans.length} işlem görüntüleniyor.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selectedRows.size === loans.length && loans.length > 0} onChange={toggleAll} />
                </th>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Kitap</th>
                <th className="px-4 py-3 text-left">Üye</th>
                <th className="px-4 py-3 text-left">Veriliş Tarihi</th>
                <th className="px-4 py-3 text-left">Son Teslim</th>
                <th className="px-4 py-3 text-left">Kalan Süre</th>
                <th className="px-4 py-3 text-left">İade Tarihi</th>
                <th className="px-4 py-3 text-left">Durum</th>
                <th className="px-4 py-3 text-left">İşlemler</th>
              </tr>
            </thead>
            {loading ? (
              <tbody>
                <tr>
                  <td colSpan={10} className="px-4 py-8">
                    <SkeletonTable rows={5} cols={10} />
                  </td>
                </tr>
              </tbody>
            ) : loans.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={10} className="px-4 py-8">
                    <EmptyState
                      icon="📚"
                      title="İşlem bulunamadı"
                      description="Henüz ödünç işlemi yok. İlk işlemi başlatmak için 'Ödünç Ver' butonuna tıklayın."
                      action={
                        <Button variant="primary" onClick={() => setShowCheckout(true)}>
                          📘 Ödünç Ver
                        </Button>
                      }
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {!loading &&
                  loans.map(loan => {
                    const remainingBadge = getRemainingBadge(loan.due_date, nowTick);
                    const isOverdue =
                      !loan.return_date &&
                      (remainingBadge?.overdue ??
                        (loan.due_date ? new Date(loan.due_date) < new Date() : false));
                    return (
                      <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedRows.has(loan.id)} onChange={() => toggleRow(loan.id)} />
                        </td>
                        <td className="px-4 py-3 text-slate-500">{loan.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{loan.book_title}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {loan.member_name}
                          <div className="text-xs text-slate-400">{loan.student_no || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{formatDate(loan.loan_date, { includeTime: false })}</div>
                          <div className="text-xs text-slate-400">{formatTime(loan.loan_date)}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{formatDate(loan.due_date, { includeTime: false })}</div>
                          <div className="text-xs text-slate-400">{formatTime(loan.due_date)}</div>
                        </td>
                        <td className="px-4 py-3">
                          {remainingBadge ? (
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${remainingBadge.className}`}>
                              {remainingBadge.text}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{formatDate(loan.return_date, { includeTime: false })}</div>
                          <div className="text-xs text-slate-400">{formatTime(loan.return_date)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              loan.return_date ? 'success' :
                                isOverdue ? 'error' :
                                  'info'
                            }
                            dot
                          >
                            {loan.return_date ? 'İade Edildi' : isOverdue ? 'Gecikmiş' : 'Aktif'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {!loan.return_date ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-light"
                                title="Süreyi 15 gün uzat"
                                onClick={() => handleExtend(loan)}
                                disabled={extendingLoanId === loan.id}
                              >
                                {extendingLoanId === loan.id ? 'Uzatılıyor...' : '⏱️ +15 Gün'}
                              </button>
                              <button
                                type="button"
                                className="btn-icon"
                                title="İade al"
                                disabled={extendingLoanId === loan.id}
                                onClick={() => {
                                  setReturnForm({ isbn: loan.isbn || '', student_no: loan.student_no || '' });
                                  setShowReturn(true);
                                }}
                              >
                                ↩️
                              </button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            )}
          </table>
        </div>
      </section>

      <Modal
        isOpen={showCheckout}
        onClose={() => {
          setShowCheckout(false);
          setCheckoutErrors({});
        }}
        size="md"
        title="Kitap Ödünç Ver"
        footer={
          <>
            <Button variant="secondary" onClick={() => {
              setShowCheckout(false);
              setCheckoutErrors({});
            }}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleCheckout}>
              📘 Ödünç Ver
            </Button>
          </>
        }
      >
        <form onSubmit={handleCheckout} className="space-y-4">
          <Input
            label="ISBN"
            value={checkoutForm.isbn}
            onChange={e => setCheckoutForm(prev => ({ ...prev, isbn: e.target.value }))}
            error={checkoutErrors.isbn}
            required
            helperText="13 haneli ISBN numarası"
          />
          <Input
            label="Okul Numarası"
            value={checkoutForm.student_no}
            onChange={e => setCheckoutForm(prev => ({ ...prev, student_no: e.target.value }))}
            error={checkoutErrors.student_no}
            required
            helperText="Öğrenci numarası"
          />
          <Input
            label="Son Teslim Tarihi"
            type="date"
            value={checkoutForm.due_date}
            onChange={e => setCheckoutForm(prev => ({ ...prev, due_date: e.target.value }))}
            error={checkoutErrors.due_date}
            required
            helperText={`Varsayılan: ${getDefaultLoanDays(settings)} gün`}
          />
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              ⚠️ <strong>Not:</strong> Askıya alınan, gecikmesi olan veya limiti dolu üyeler otomatik engellenir.
            </p>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showReturn}
        onClose={() => {
          setShowReturn(false);
          setCheckResult(null);
          setReturnErrors({});
        }}
        size="md"
        title="Kitap İade Al"
        footer={
          <>
            <Button variant="secondary" onClick={() => {
              setShowReturn(false);
              setCheckResult(null);
              setReturnErrors({});
            }}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleReturn}>
              ↩️ İade Al
            </Button>
          </>
        }
      >
        <form onSubmit={handleReturn} className="space-y-4">
          <Input
            label="ISBN"
            value={returnForm.isbn}
            onChange={e => setReturnForm(prev => ({ ...prev, isbn: e.target.value }))}
            error={returnErrors.isbn}
            required
            helperText="13 haneli ISBN numarası"
          />
          <Input
            label="Okul Numarası"
            value={returnForm.student_no}
            onChange={e => setReturnForm(prev => ({ ...prev, student_no: e.target.value }))}
            error={returnErrors.student_no}
            required
            helperText="Öğrenci numarası"
          />
          <Button
            variant="secondary"
            onClick={handleCheckLoan}
            disabled={checking}
            loading={checking}
            className="w-full"
          >
            🔍 İşlemi Kontrol Et
          </Button>
          {checkResult && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${checkResult.error
              ? 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-red-800 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              }`}>
              {checkResult.error ? (
                <div className="flex items-center gap-2">
                  <span>❌</span>
                  <span>{checkResult.error}</span>
                </div>
              ) : (
                <>
                  <div className="font-semibold mb-2">{checkResult.book_title}</div>
                  <div className="text-xs opacity-80">Üye: {checkResult.member_name}</div>
                  <div className="text-xs opacity-80">
                    Son Teslim: {formatDate(checkResult.due_date, { includeTime: false })} · {formatTime(checkResult.due_date)}
                  </div>
                </>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* Extend Confirmation Modal */}
      <Modal
        isOpen={!!extendConfirm}
        onClose={() => setExtendConfirm(null)}
        size="md"
        title="Süre Uzatma Onayı"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtendConfirm(null)}>
              İptal
            </Button>
            <Button variant="primary" onClick={confirmExtend} loading={extendingLoanId === extendConfirm?.loan?.id}>
              Uzat
            </Button>
          </>
        }
      >
        <p className="text-slate-700 dark:text-slate-300">
          <strong>"{extendConfirm?.loan?.book_title || 'Bu kitap'}"</strong> için son teslim tarihini <strong>{extendConfirm?.days || 15} gün</strong> uzatmak istediğinizden emin misiniz?
        </p>
      </Modal>

      <Modal
        isOpen={showOverdue}
        onClose={() => setShowOverdue(false)}
        size="lg"
        title="Geciken Kitaplar"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Kitap</th>
                <th className="px-3 py-2 text-left">Üye</th>
                <th className="px-3 py-2 text-left">Son Teslim</th>
                <th className="px-3 py-2 text-left">Gecikme (gün)</th>
                <th className="px-3 py-2 text-left">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overdueLoans().length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-400">Geciken kitap yok</td>
                </tr>
              )}
              {overdueLoans().map(loan => (
                <tr key={`overdue-${loan.id}`}>
                  <td className="px-3 py-2">{loan.book_title}</td>
                  <td className="px-3 py-2 text-slate-600">{loan.member_name}</td>
                  <td className="px-3 py-2">
                    <div>{formatDate(loan.due_date, { includeTime: false })}</div>
                    <div className="text-xs text-slate-400">{formatTime(loan.due_date)}</div>
                  </td>
                  <td className="px-3 py-2 text-rose-600">{daysLate(loan.due_date)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-light"
                        disabled={extendingLoanId === loan.id}
                        onClick={() => handleExtend(loan)}
                      >
                        {extendingLoanId === loan.id ? 'Uzatılıyor...' : '⏱️ +15 Gün'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setShowOverdue(false);
                          setReturnForm({ isbn: loan.isbn || '', student_no: loan.student_no || '' });
                          setShowReturn(true);
                        }}
                      >
                        İade İşlemi
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
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


function formatDate(value, { includeTime = true } = {}) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const options = includeTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { dateStyle: 'short' };
    return new Intl.DateTimeFormat('tr-TR', options).format(date);
  } catch {
    return value;
  }
}

function formatTime(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

function daysLate(dueDate) {
  const today = new Date();
  const due = new Date(dueDate);
  const diff = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function getRemainingBadge(dueDate, nowTs) {
  const info = calculateRemainingInfo(dueDate, nowTs);
  if (!info) return null;
  let className;
  if (info.overdue) {
    className = 'bg-rose-100 text-rose-700';
  } else if (info.urgent) {
    className = 'bg-amber-100 text-amber-700';
  } else {
    className = 'bg-emerald-100 text-emerald-700';
  }
  return { ...info, className };
}

function calculateRemainingInfo(dueDate, nowTs) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const hasExplicitTime =
    typeof dueDate === 'string' && /\d{2}:\d{2}/.test(dueDate);
  if (!hasExplicitTime) {
    due.setHours(23, 59, 59, 999);
  }
  const now = typeof nowTs === 'number' ? new Date(nowTs) : new Date();
  const diff = due.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const dayMs = 1000 * 60 * 60 * 24;
  const hourMs = 1000 * 60 * 60;
  const minuteMs = 1000 * 60;

  const days = Math.floor(absDiff / dayMs);
  const hours = Math.floor((absDiff % dayMs) / hourMs);
  const minutes = Math.floor((absDiff % hourMs) / minuteMs);
  const parts = [];
  if (days > 0) parts.push(`${days} gün`);
  if (hours > 0 && parts.length < 2) parts.push(`${hours} saat`);
  if (parts.length === 0) parts.push(`${Math.max(minutes, 0)} dakika`);

  const overdue = diff < 0;
  const urgent = !overdue && diff <= 2 * dayMs;
  const text = `${parts.join(' ')} ${overdue ? 'gecikti' : 'kaldı'}`;

  return { text, overdue, urgent };
}

function getDefaultLoanDays(settings) {
  return Number(settings?.loan_days_default) || 14;
}
