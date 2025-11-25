import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getBranchPreference, preferenceToBranchId, preferenceToQuery } from '../utils/branch';
import { getCurrentUser } from '../utils/auth';

const STATUS_OPTIONS = [
  'requested',
  'approved',
  'in_transit',
  'completed',
  'cancelled',
];

export default function Transfers() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ book_id: '', to_branch_id: '', note: '' });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const handler = ev => setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  const branchParam = useMemo(() => preferenceToQuery(branchPref), [branchPref]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (branchParam !== undefined) params.branch_id = branchParam;
      const { data } = await api.get('/transfers', { params });
      setTransfers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchParam]);

  async function createTransfer(e) {
    e?.preventDefault();
    if (!form.book_id || !form.to_branch_id) {
      alert('Kitap ID ve hedef şube zorunlu.');
      return;
    }
    try {
      await api.post('/transfers', {
        book_id: Number(form.book_id),
        to_branch_id: Number(form.to_branch_id),
        note: form.note || null,
        from_branch_id: preferenceToBranchId(branchPref, currentUser?.branch_id ?? null),
      });
      setForm({ book_id: '', to_branch_id: '', note: '' });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Transfer oluşturulamadı.');
    }
  }

  async function updateStatus(id, status) {
    setUpdating(true);
    try {
      await api.put(`/transfers/${id}`, { status });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Durum güncellenemedi.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Transfer</p>
            <h1 className="text-3xl font-semibold text-slate-900">Şubeler Arası Transfer</h1>
            <p className="text-slate-500 mt-2 text-sm">Kitabı başka şubeye göndermek için talep oluşturun, durumunu takip edin.</p>
          </div>
          <div className="text-xs text-slate-500">Toplam {transfers.length} kayıt</div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Yeni Transfer</h2>
        <form onSubmit={createTransfer} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">Kitap ID</label>
            <input
              value={form.book_id}
              onChange={e => setForm(prev => ({ ...prev, book_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="123"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">Hedef Şube ID</label>
            <input
              value={form.to_branch_id}
              onChange={e => setForm(prev => ({ ...prev, to_branch_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="2"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">Not (opsiyonel)</label>
            <input
              value={form.note}
              onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="Örn: Matematik rafı için"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="btn-primary">Transfer Oluştur</button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Transfer Listesi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Kitap</th>
                <th className="px-4 py-3 text-left">Şube</th>
                <th className="px-4 py-3 text-left">Durum</th>
                <th className="px-4 py-3 text-left">Güncelle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-500">Yükleniyor...</td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-500">Kayıt yok.</td></tr>
              ) : (
                transfers.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-700">#{t.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{t.book_title}</div>
                      <div className="text-xs text-slate-500">ISBN: {t.isbn || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.from_branch_id || '—'} → {t.to_branch_id}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt}
                            className="btn-light text-xs"
                            disabled={updating}
                            onClick={() => updateStatus(t.id, opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }) {
  const tone =
    status === 'completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'cancelled'
      ? 'bg-rose-100 text-rose-700'
      : status === 'in_transit'
      ? 'bg-sky-100 text-sky-700'
      : status === 'approved'
      ? 'bg-indigo-100 text-indigo-700'
      : 'bg-amber-100 text-amber-700';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}
