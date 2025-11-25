import React,{useEffect,useMemo,useState} from 'react'; import api from '../api';
import { getBranchPreference, preferenceToQuery } from '../utils/branch';
import { withAuth } from '../utils/url';

function formatNumber(value){ return new Intl.NumberFormat('tr-TR').format(value||0); }

export default function Reports(){
  const [popular,setPopular]=useState([]);
  const [branchPref,setBranchPref]=useState(()=>getBranchPreference());
  const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const [circulation,setCirculation]=useState({ totals:{ loans:0, returns:0, overdue_open:0, overdue_closed:0 }, items:[] });
  const [sending,setSending]=useState(false);
  const [lastSend,setLastSend]=useState(null);

  const branchQuery=useMemo(()=>preferenceToQuery(branchPref),[branchPref]);

  useEffect(()=>{
    const params={};
    if(branchQuery!==undefined) params.branch_id=branchQuery;
    api.get('/reports/popular',{ params }).then(r=>setPopular(r.data));
  },[branchQuery]);

  useEffect(()=>{
    const handler=(ev)=>setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change',handler);
    return ()=>window.removeEventListener('branch-change',handler);
  },[]);

  useEffect(()=>{
    const params={ month };
    if(branchQuery!==undefined) params.branch_id=branchQuery;
    api.get('/reports/circulation',{ params }).then(r=>setCirculation(r.data));
  },[month,branchQuery]);

  const overdueUrl=useMemo(()=>{
    const params={};
    if(branchQuery!==undefined) params.branch_id=branchQuery;
    return withAuth('/reports/overdue.pdf',params);
  },[branchQuery]);
  const circulationPdfUrl=useMemo(()=>{
    const params={ month };
    if(branchQuery!==undefined) params.branch_id=branchQuery;
    return withAuth('/reports/circulation.pdf',params);
  },[month,branchQuery]);

  async function sendOverdue(){
    try{
      setSending(true);
      const params={};
      if(branchQuery!==undefined) params.branch_id=branchQuery;
      const { data } = await api.post('/notify/overdue',{}, { params });
      setLastSend({ ok:true, sent:data.sent, failed:data.failed||0, at:new Date().toISOString() });
    }catch(err){
      setLastSend({ ok:false, error:err.response?.data?.error || err.message });
    }finally{
      setSending(false);
    }
  }

  return (<div className="space-y-4">
    <h2 className="text-lg font-semibold">Raporlar</h2>

    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">Ay
          <input className="input" type="month" value={month} onChange={e=>setMonth(e.target.value)} />
        </label>
        <a className="btn" href={circulationPdfUrl} target="_blank" rel="noreferrer">Dolaşım PDF</a>
      </div>
      <div className="grid md:grid-cols-4 gap-2 text-sm">
        <div className="card bg-slate-50">
          <div className="font-semibold">Ödünç</div>
          <div className="text-xl">{formatNumber(circulation.totals.loans)}</div>
        </div>
        <div className="card bg-slate-50">
          <div className="font-semibold">İade</div>
          <div className="text-xl">{formatNumber(circulation.totals.returns)}</div>
        </div>
        <div className="card bg-amber-50">
          <div className="font-semibold">Açık Gecikme</div>
          <div className="text-xl">{formatNumber(circulation.totals.overdue_open)}</div>
        </div>
        <div className="card bg-emerald-50">
          <div className="font-semibold">Kapalı Gecikme</div>
          <div className="text-xl">{formatNumber(circulation.totals.overdue_closed)}</div>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1 pr-4">Tarih</th>
              <th className="py-1 pr-4">Şube</th>
              <th className="py-1 pr-4">Ödünç</th>
              <th className="py-1 pr-4">İade</th>
              <th className="py-1 pr-4">Açık Gecikme</th>
              <th className="py-1 pr-4">Kapalı Gecikme</th>
            </tr>
          </thead>
          <tbody>
            {circulation.items.length === 0 && (
              <tr><td className="py-2 text-gray-500" colSpan={6}>Kayıt bulunamadı.</td></tr>
            )}
            {circulation.items.map((row,idx)=>(
              <tr key={`${row.loan_day}-${row.branch_id ?? 'null'}-${idx}`} className="border-b">
                <td className="py-1 pr-4">{row.loan_day}</td>
                <td className="py-1 pr-4">{row.branch_id ?? 'Şubesiz'}</td>
                <td className="py-1 pr-4">{row.loans}</td>
                <td className="py-1 pr-4">{row.returns}</td>
                <td className="py-1 pr-4">{row.overdue_open}</td>
                <td className="py-1 pr-4">{row.overdue_closed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      <a className="btn" href={overdueUrl} target="_blank" rel="noreferrer">Gecikenler PDF</a>
      <button className="btn" onClick={sendOverdue} disabled={sending}>{sending?'Gönderiliyor...':'Geciken E-postaları Gönder'}</button>
      {lastSend && (
        <span className={`text-sm ${lastSend.ok?'text-emerald-600':'text-red-600'}`}>
          {lastSend.ok ? `Gönderildi: ${lastSend.sent} (başarısız ${lastSend.failed})` : `Hata: ${lastSend.error}`}
        </span>
      )}
    </div>

    <div className="card">
      <div className="font-semibold mb-2">En Çok Ödünç Alınanlar</div>
      <ul className="list-disc ml-5 space-y-1">{popular.map((p,i)=><li key={i}>{p.title} — {p.loan_count}</li>)}</ul>
    </div>
  </div>);
}
