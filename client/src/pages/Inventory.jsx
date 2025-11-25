import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getBranchPreference, preferenceToQuery, preferenceToBranchId } from '../utils/branch';
import { getCurrentUser } from '../utils/auth';

export default function Inventory() {
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [status, setStatus] = useState({ summary: {}, unseen: [], recent_scans: [] });
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [isbnInput, setIsbnInput] = useState('');
  const [location, setLocation] = useState('');
  const [scanMessage, setScanMessage] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const currentUser = useMemo(() => getCurrentUser(), []);

  useEffect(() => {
    const handler = ev => setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  const branchParam = useMemo(() => preferenceToQuery(branchPref), [branchPref]);

  async function loadStatus() {
    setLoading(true);
    try {
      const params = { days };
      if (branchParam !== undefined) params.branch_id = branchParam;
      const { data } = await api.get('/inventory/status', { params });
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDuplicates() {
    try {
      const params = {};
      if (branchParam !== undefined) params.branch_id = branchParam;
      const { data } = await api.get('/inventory/duplicates', { params });
      setDuplicates(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadStatus();
    loadDuplicates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchParam, days]);

  async function handleScan(e) {
    e?.preventDefault();
    if (!isbnInput.trim()) return;
    setScanMessage(null);
    try {
      const branchId = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
      await api.post('/inventory/scan', {
        isbn: isbnInput.trim(),
        location: location || null,
        branch_id: branchId,
      });
      setScanMessage({ type: 'success', text: 'Tarama kaydedildi.' });
      setIsbnInput('');
      await loadStatus();
    } catch (err) {
      const msg = err.response?.data?.error || 'Tarama kaydedilemedi.';
      setScanMessage({ type: 'error', text: msg });
    }
  }

  const summary = status.summary || {};

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Envanter</p>
            <h1 className="text-3xl font-semibold text-slate-900">Raf Sayımı ve Envanter Sağlığı</h1>
            <p className="text-slate-500 mt-2 text-sm max-w-2xl">
              Barkod/ISBN tarayıp son görülme tarihini güncelleyin. Eksik ve mükerrer kayıtları izleyin.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <SummaryCard label="Toplam" value={summary.total} tone="slate" />
            <SummaryCard label="Hiç görülmedi" value={summary.never_seen} tone="amber" />
            <SummaryCard label={`>${summary.cutoff_days || days}g önce`} value={summary.stale} tone="rose" />
            <SummaryCard label="Son taramalar" value={status.recent_scans?.length || 0} tone="sky" />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs uppercase text-slate-500 font-semibold mb-1 block">ISBN/Barkod</label>
            <input
              value={isbnInput}
              onChange={e => setIsbnInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScan()}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder="978..."
            />
          </div>
          <div className="md:w-64">
            <label className="text-xs uppercase text-slate-500 font-semibold mb-1 block">Konum (Raf/Dolap)</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder="Örn: A-3 / Fen"
            />
          </div>
          <button className="btn-primary h-[52px]" onClick={handleScan}>Tarama Kaydet</button>
        </div>
        {scanMessage && (
          <div
            className={`text-sm px-3 py-2 rounded-lg ${
              scanMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {scanMessage.text}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Eksik/Stale Kayıtlar</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Gün eşiği</span>
              <input
                type="number"
                min="1"
                value={days}
                onChange={e => setDays(Number(e.target.value) || 30)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">ISBN</th>
                  <th className="px-4 py-3 text-left">Başlık</th>
                  <th className="px-4 py-3 text-left">Son Görülme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-500">Yükleniyor...</td></tr>
                ) : status.unseen?.length ? (
                  status.unseen.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-700">{item.isbn || '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{item.title}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.last_seen_at ? new Date(item.last_seen_at).toLocaleString('tr-TR') : 'Hiç görülmedi'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-500">Eksik veya eski kayıt yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Mükerrer ISBN Uyarıları</h2>
            <span className="text-xs text-slate-500">{duplicates.length} grup</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
            {duplicates.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">Mükerrer kayıt yok.</div>
            ) : (
              duplicates.map(item => (
                <div key={item.isbn} className="px-4 py-3">
                  <div className="font-mono text-slate-700 font-semibold">{item.isbn}</div>
                  <div className="text-sm text-slate-600 mt-1">{item.titles}</div>
                  <div className="text-xs text-amber-600 mt-1">Adet: {item.cnt}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Son Taramalar</h2>
          <span className="text-xs text-slate-500">Son {status.recent_scans?.length || 0} kayıt</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Kitap</th>
                <th className="px-4 py-3 text-left">ISBN</th>
                <th className="px-4 py-3 text-left">Konum</th>
                <th className="px-4 py-3 text-left">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {status.recent_scans?.length ? (
                status.recent_scans.map(scan => (
                  <tr key={scan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{scan.title}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{scan.isbn || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{scan.location || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(scan.scanned_at).toLocaleString('tr-TR')}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-500">Kayıt yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  const toneMap = {
    slate: 'bg-slate-900 text-white',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-800',
    sky: 'bg-sky-100 text-sky-800',
  };
  return (
    <div className={`rounded-xl px-4 py-3 shadow ${toneMap[tone] || toneMap.slate}`}>
      <p className="text-xs uppercase tracking-wide text-white/70">{label}</p>
      <p className="text-2xl font-semibold">{Number(value || 0)}</p>
    </div>
  );
}
