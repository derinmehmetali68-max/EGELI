import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { withAuth } from '../utils/url';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

function Badge({ children, tone = 'default' }) {
  const classes = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
    info: 'bg-sky-100 text-sky-700',
  }[tone];
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${classes}`}>
      {children}
    </span>
  );
}

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const { data } = await api.get(`/members/${id}/history`);
        if (!cancelled) {
          setData(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Kayıt bulunamadı.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const exportUrl = useMemo(() => withAuth(`/members/${id}/history`, { format: 'csv' }), [id]);

  const member = data?.member;
  const activeLoans = data?.active_loans || [];
  const returnedLoans = data?.returned_loans || [];
  const reservations = data?.reservations || [];
  const blockLogs = data?.block_logs || [];

  if (loading) {
    return <div className="text-center text-slate-500">Yükleniyor...</div>;
  }

  if (error || !member) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center space-y-4">
        <p className="text-slate-500">{error || 'Kayıt bulunamadı.'}</p>
        <button className="btn-secondary" onClick={() => navigate(-1)}>Geri Dön</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button className="btn-light" onClick={() => navigate(-1)}>← Üye listesine dön</button>
        <a className="btn-secondary" href={exportUrl}>Geçmişi İndir (CSV)</a>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{member.name}</h1>
            <Badge tone={member.is_blocked ? 'warning' : 'success'}>
              {member.is_blocked ? 'Askıya alındı' : 'Aktif'}
            </Badge>
            {member.member_type ? <Badge tone="info">{member.member_type}</Badge> : null}
          </div>
          <p className="text-sm text-slate-500">
            ID #{member.id} · Okul No: {member.student_no || '—'} · Sınıf: {member.grade || '—'}
          </p>
          {member.note ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 max-w-3xl">
              Not: {member.note}
            </p>
          ) : null}
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCard label="Aktif Ödünç" value={activeLoans.length} tone="emerald" />
          <InfoCard label="İade Edilen" value={returnedLoans.length} tone="sky" />
          <InfoCard label="Rezervasyon" value={reservations.length} tone="amber" />
        </div>
      </section>

      <HistorySection
        title="Aktif Ödünçler"
        emptyText="Aktif ödünç bulunmuyor."
        rows={activeLoans}
        renderRow={loan => (
          <tr key={loan.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{loan.book_title}</td>
            <td className="px-4 py-3 text-slate-600">{loan.isbn || '—'}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(loan.loan_date)}</td>
            <td className="px-4 py-3">
              <Badge tone={loan.overdue ? 'danger' : 'info'}>
                {formatDate(loan.due_date)}
              </Badge>
            </td>
          </tr>
        )}
        headers={['Kitap', 'ISBN', 'Ödünç Tarihi', 'Son Teslim']}
      />

      <HistorySection
        title="İade Edilen Ödünçler"
        emptyText="İade edilmiş işlem yok."
        rows={returnedLoans}
        renderRow={loan => (
          <tr key={loan.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{loan.book_title}</td>
            <td className="px-4 py-3 text-slate-600">{loan.isbn || '—'}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(loan.loan_date)}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(loan.due_date)}</td>
            <td className="px-4 py-3">
              <Badge tone="success">{formatDate(loan.return_date)}</Badge>
            </td>
          </tr>
        )}
        headers={['Kitap', 'ISBN', 'Ödünç Tarihi', 'Son Teslim', 'İade']}
      />

      <HistorySection
        title="Rezervasyonlar"
        emptyText="Rezervasyon bulunmuyor."
        rows={reservations}
        renderRow={resv => (
          <tr key={resv.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{resv.book_title}</td>
            <td className="px-4 py-3 text-slate-600">{resv.isbn || '—'}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(resv.created_at)}</td>
            <td className="px-4 py-3">
              <Badge tone={resv.status === 'fulfilled' ? 'success' : resv.status === 'cancelled' ? 'danger' : 'info'}>
                {resv.status || '—'}
              </Badge>
            </td>
          </tr>
        )}
        headers={['Kitap', 'ISBN', 'Tarih', 'Durum']}
      />

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Blokaj Geçmişi</h2>
          {blockLogs.length ? <span className="text-xs text-slate-500">Son {blockLogs.length} kayıt</span> : null}
        </div>
        <div className="divide-y divide-slate-100">
          {blockLogs.length === 0 ? (
            <div className="px-6 py-6 text-slate-500 text-sm">Blokaj kaydı yok.</div>
          ) : (
            blockLogs.map(log => (
              <div key={log.id} className="px-6 py-4 flex items-start gap-3">
                <Badge tone={log.is_blocked ? 'warning' : 'success'}>
                  {log.is_blocked ? 'Askıya alındı' : 'Askı kalktı'}
                </Badge>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{formatDate(log.created_at)}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Kullanıcı: {log.actor_email || '—'}
                    {log.note ? ` · Not: ${log.note}` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value, tone }) {
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    sky: 'bg-sky-50 text-sky-800 border-sky-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
  }[tone] || 'bg-slate-50 text-slate-800 border-slate-100';
  return (
    <div className={`rounded-xl border ${toneClasses} p-4`}>
      <div className="text-xs uppercase tracking-[0.2em] font-semibold text-current/70">{label}</div>
      <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
    </div>
  );
}

function HistorySection({ title, headers, rows, renderRow, emptyText }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500">{rows.length} kayıt</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-6 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
              <tr>
                {headers.map(head => (
                  <th key={head} className="px-4 py-3 text-left">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {rows.map(renderRow)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
