import React,{useEffect,useState} from 'react'; import axios from 'axios'; import { resolveAssetUrl } from '../utils/url';
import { getThemePreference, setThemePreference } from '../utils/theme';
export default function CatalogPublic(){
  const [q,setQ]=useState(''); const [items,setItems]=useState([]); const [category,setCat]=useState(''); const [author,setAuthor]=useState(''); const [onlyAvail,setOnly]=useState(false);
  const [theme,setTheme]=useState(()=>getThemePreference());
  const base=(import.meta.env.VITE_API_URL||'http://localhost:5174/api');
  async function search(){ const {data}=await axios.get(base+'/public/books',{params:{q,category,author,available: onlyAvail? '1':'0'}}); setItems(data) } useEffect(()=>{ search() },[])
  
  useEffect(() => {
    const themeHandler = (ev) => setTheme(ev.detail ?? getThemePreference());
    window.addEventListener('theme-change', themeHandler);
    return () => window.removeEventListener('theme-change', themeHandler);
  }, []);

  function toggleTheme(){
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemePreference(newTheme);
    setTheme(newTheme);
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-100 to-slate-300 dark:bg-black dark:text-white">
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="rounded-full bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-white text-xl px-5 py-3 shadow-md transition font-semibold"
          title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <h1 className="text-xl font-bold dark:text-white">Genel Katalog</h1>
        <div className="flex gap-2 flex-wrap"><input className="input dark:bg-white dark:text-black" placeholder="Başlık, Yazar, ISBN" value={q} onChange={e=>setQ(e.target.value)} /><button className="btn" onClick={search}>Ara</button></div>
        <div className="grid gap-2">{items.map(it=>{const coverUrl=resolveAssetUrl(it.cover_path);return(<div key={it.id} className="card flex gap-3 dark:bg-slate-900 dark:border-slate-700">
          {coverUrl && <img src={coverUrl} width="64"/>}
          <div>
            <div className="font-semibold dark:text-white">{it.title}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">{it.author} · ISBN {it.isbn}</div>
            <div className="text-sm dark:text-gray-300">{it.available>0?'Mevcut':'Şu an mevcut değil'}</div>
          </div>
        </div>)})}</div>
      </div>
    </div>
  );
}
