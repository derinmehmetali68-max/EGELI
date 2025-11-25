import React,{useMemo,useState,useEffect} from 'react'; import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { getBranchPreference, preferenceToBranchId, preferenceToQuery } from '../utils/branch';
import { withAuth } from '../utils/url';
export default function ImportExport(){
  const user=useMemo(()=>getCurrentUser(),[]);
  const [booksXlsx,setBooksXlsx]=useState(null); const [membersXlsx,setMembersXlsx]=useState(null);
  const [bulkIsbnXlsx,setBulkIsbnXlsx]=useState(null);
  const [branchPref,setBranchPref]=useState(()=>getBranchPreference());

  useEffect(()=>{ const handler=(ev)=>setBranchPref(ev.detail ?? getBranchPreference()); window.addEventListener('branch-change',handler); return ()=>window.removeEventListener('branch-change',handler); },[]);

  function appendBranch(fd){
    const branchId=preferenceToBranchId(branchPref, user?.branch_id ?? null);
    if(branchId === null){ fd.append('branch_id','null'); }
    else fd.append('branch_id', String(branchId));
  }

  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState(null);

  async function importBooksXLSX(){ 
    if(!booksXlsx){ alert('Dosya seçiniz'); return; } 
    setLoading(true);
    setMessage(null);
    try {
      const fd=new FormData(); 
      fd.append('file',booksXlsx); 
      appendBranch(fd); 
      const { data } = await api.post('/books/import.xlsx',fd,{headers:{'Content-Type':'multipart/form-data'}}); 
      const jobId = data?.jobId;
      setMessage({
        type:'success',
        text: jobId
          ? `Kitap XLSX içe aktarma başlatıldı (Görev ID: ${jobId}). İlerlemeyi Kitaplar sayfasındaki Excel yükleme durum penceresinden takip edebilirsiniz.`
          : 'Kitap XLSX içe aktarma başlatıldı.',
      });
      setBooksXlsx(null);
    } catch(err) {
      setMessage({type:'error',text:err.response?.data?.error||'İçe aktarma sırasında hata oluştu.'});
    } finally {
      setLoading(false);
    }
  }

  async function importMembersXLSX(){ 
    if(!membersXlsx){ alert('Dosya seçiniz'); return; } 
    setLoading(true);
    setMessage(null);
    try {
      const fd=new FormData(); 
      fd.append('file',membersXlsx); 
      appendBranch(fd); 
      const { data } = await api.post('/members/import.xlsx',fd,{headers:{'Content-Type':'multipart/form-data'}}); 
      setMessage({type:'success',text:`Üye XLSX içe aktarma tamamlandı. Eklenen: ${data?.imported ?? 0}, Atlanan: ${data?.skipped ?? 0}`});
      setMembersXlsx(null);
    } catch(err) {
      setMessage({type:'error',text:err.response?.data?.error||'İçe aktarma sırasında hata oluştu.'});
    } finally {
      setLoading(false);
    }
  }

  async function bulkIsbn(){ 
    if(!bulkIsbnXlsx){ alert('Dosya seçiniz'); return; } 
    setLoading(true);
    setMessage(null);
    try {
      const fd=new FormData(); 
      fd.append('file',bulkIsbnXlsx); 
      appendBranch(fd); 
      const {data}=await api.post('/books/isbn/bulk-xlsx',fd,{headers:{'Content-Type':'multipart/form-data'}}); 
      setMessage({type:'success',text:`ISBN toplu işlem tamamlandı. ${JSON.stringify(data)}`});
      setBulkIsbnXlsx(null);
    } catch(err) {
      setMessage({type:'error',text:err.response?.data?.error||'İşlem sırasında hata oluştu.'});
    } finally {
      setLoading(false);
    }
  }

  const branchQuery=preferenceToQuery(branchPref);
  const booksXlsxUrl=useMemo(()=>{
    const params={};
    if(branchQuery!==undefined) params.branch_id=branchQuery;
    return withAuth('/books/export.xlsx',params);
  },[branchQuery]);
  const membersXlsxUrl=useMemo(()=>{
    const params={};
    if(branchQuery!==undefined) params.branch_id=branchQuery;
    return withAuth('/members/export.xlsx',params);
  },[branchQuery]);

  return (<div className="space-y-4">
    <h2 className="text-lg font-semibold">İçe / Dışa Aktarma</h2>
    {message && (
      <div className={`p-4 rounded-lg ${message.type==='success'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>
        {message.text}
      </div>
    )}

    <div className="card space-y-2">
      <div className="font-semibold">Kitaplar</div>
      <div className="flex gap-2 items-center">
        <input type="file" accept=".xlsx" onChange={e=>setBooksXlsx(e.target.files[0])}/>
        <button className="btn" onClick={importBooksXLSX} disabled={loading}>XLSX İçe Aktar</button>
        <a className="btn" href={booksXlsxUrl}>XLSX Dışa Aktar</a>
      </div>
      <div className="flex gap-2 items-center">
        <input type="file" accept=".xlsx" onChange={e=>setBulkIsbnXlsx(e.target.files[0])}/>
        <button className="btn" onClick={bulkIsbn} disabled={loading}>ISBN Toplu (XLSX) → Otomatik Ekle</button>
      </div>
      <div className="text-sm text-gray-600">ISBN bulk XLSX şablonu: tek sayfa, ilk satır başlık, bir sütun: <b>isbn</b> (opsiyonel: copies)</div>
    </div>

    <div className="card space-y-2">
      <div className="font-semibold">Üyeler</div>
      <div className="flex gap-2 items-center">
        <input type="file" accept=".xlsx" onChange={e=>setMembersXlsx(e.target.files[0])}/>
        <button className="btn" onClick={importMembersXLSX} disabled={loading}>XLSX İçe Aktar</button>
        <a className="btn" href={membersXlsxUrl}>XLSX Dışa Aktar</a>
      </div>
    </div>
  </div>);
}
