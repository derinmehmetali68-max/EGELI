import React,{useEffect,useMemo,useState,useRef} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import api, { clearAuthSession } from '../api';
import { getCurrentUser } from '../utils/auth';
import { getBranchPreference, setBranchPreference, describeBranch } from '../utils/branch';
import { getThemePreference, setThemePreference } from '../utils/theme';
import { NotificationProvider, NotificationCenter } from '../components/NotificationCenter';
import { ToastProvider } from '../components/Toast';
import { registerShortcut, initKeyboardShortcuts, COMMON_SHORTCUTS } from '../utils/keyboard';
import { addToSearchHistory, getSearchHistory, clearSearchHistory } from '../utils/searchHistory';

const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Anasayfa', icon: '🏠' },
  { to: '/app/statistics', label: 'İstatistikler', icon: '📈' },
  { to: '/app/books', label: 'Kitaplar', icon: '📚' },
  { to: '/app/shelf-map', label: 'Dolap Haritası', icon: '🗺️' },
  { to: '/app/inventory', label: 'Envanter', icon: '📦' },
  { to: '/app/members', label: 'Üyeler', icon: '🎓' },
  { to: '/app/users', label: 'Kullanıcılar', icon: '👥' },
  { to: '/app/loans', label: 'İşlemler', icon: '🔄' },
  { to: '/app/reservations', label: 'Rezervasyonlar', icon: '📅' },
  { to: '/app/transfers', label: 'Transferler', icon: '🚚' },
  { to: '/app/database', label: 'Veritabanı', icon: '💾', adminOnly: true },
  { to: '/app/ai', label: 'AI', icon: '🤖', adminOnly: true },
  { to: '/app/settings', label: 'Ayarlar', icon: '⚙️', adminOnly: true },
  { to: '/app/scan', label: 'Hızlı İşlemler', icon: '⚡' },
];

function AppLayoutContent(){
  const navigate=useNavigate();
  const location=useLocation();
  const [user,setUser]=useState(()=>getCurrentUser());
  const [branches,setBranches]=useState([]);
  const [branchPref,setBranchPref]=useState(()=>getBranchPreference());
  const [search,setSearch]=useState('');
  const [theme,setTheme]=useState(()=>getThemePreference());

  useEffect(()=>{
    setUser(getCurrentUser());
    const userHandler=(ev)=>setUser(ev.detail ?? getCurrentUser());
    const branchHandler=(ev)=>setBranchPref(ev.detail ?? getBranchPreference());
    const themeHandler=(ev)=>setTheme(ev.detail ?? getThemePreference());
    window.addEventListener('user-change',userHandler);
    window.addEventListener('branch-change',branchHandler);
    window.addEventListener('theme-change',themeHandler);
    return ()=>{
      window.removeEventListener('user-change',userHandler);
      window.removeEventListener('branch-change',branchHandler);
      window.removeEventListener('theme-change',themeHandler);
    };
  },[]);

  useEffect(()=>{
    let cancelled=false;
    if(!user) return;
    api.get('/branches').then(r=>{
      if(!cancelled) setBranches(r.data.items||[]);
    }).catch(()=>{});
    return ()=>{ cancelled=true; };
  },[user]);

  async function logout(){
    const refreshToken = localStorage.getItem('refresh_token');
    try{
      if(refreshToken){
        await api.post('/auth/logout',{ refresh_token: refreshToken });
      }
    }catch{}
    clearAuthSession(false);
    navigate('/');
  }

  function handleBranchChange(e){
    const value=e.target.value;
    setBranchPreference(value);
    setBranchPref(value);
  }

  function handleSearchSubmit(e){
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('global-search', { detail: search }));
  }

  function toggleTheme(){
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemePreference(newTheme);
    setTheme(newTheme);
  }

  const branchLabel=describeBranch(branchPref, branches, user?.branch_id);
  const isAdmin=user?.role==='admin';
  const branchOptions=useMemo(()=>isAdmin?[
    { value:'user', label:user?.branch_id != null ? `Varsayılan (${describeBranch('user', branches, user?.branch_id ?? null)})` : 'Varsayılan (Şubesiz)' },
    { value:'all', label:'Tüm Şubeler' },
    { value:'null', label:'Şubesiz' },
    ...branches.map(b=>({ value:String(b.id), label:b.name }))
  ]:[],[isAdmin,branches,user]);

  return (
    <div className="app-shell flex min-h-screen bg-gradient-to-br from-slate-200 via-blue-100 to-slate-300 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100">
      <aside className="hidden md:flex md:w-64 lg:w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-white flex-col border-r dark:border-slate-800/50 shadow-xl dark:shadow-slate-900/50 fixed left-0 top-0 bottom-0 z-40">
        <div className="px-6 pt-8 pb-6 border-b border-slate-700/50">
          <div className="text-sm uppercase tracking-[0.35em] text-slate-300 font-semibold">CAL KÜTÜPHANE</div>
          <div className="mt-3 text-2xl font-bold leading-tight">Bilgi &amp; Kaynak Yönetimi</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item=>{
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active ? 'bg-white/20 text-white shadow-lg font-semibold' : 'text-slate-200 hover:bg-white/15'
                }`}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-base font-semibold tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-6 py-6 border-t border-slate-700/60 text-base bg-slate-900/70">
          <div className="font-bold text-slate-100">{user?.display_name || user?.email}</div>
          <div className="text-sm text-slate-300 mt-1">{user?.email}</div>
          <button className="mt-4 w-full rounded-md bg-slate-700 hover:bg-slate-600 px-4 py-3 text-base font-semibold shadow-lg" onClick={logout}>
            Çıkış Yap
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col md:ml-64 lg:ml-72">
        <header className="bg-gradient-to-r from-slate-100 via-blue-50 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 dark:border-b dark:border-slate-700/50 shadow-lg dark:shadow-slate-900/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="mx-auto px-6 lg:px-10 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={handleSearchSubmit} className="w-full lg:max-w-xl">
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-slate-500 dark:text-slate-400 text-lg">🔍</span>
                <input
                  value={search}
                  onChange={e=>setSearch(e.target.value)}
                  placeholder="Kitap adı, yazar veya ISBN ara..."
                  className="w-full bg-white dark:bg-slate-800/90 dark:text-white dark:border-2 dark:border-slate-600/50 rounded-full pl-12 pr-5 py-3.5 text-base font-medium focus:outline-none focus:ring-4 focus:ring-sky-400 dark:focus:ring-sky-500/50 shadow-md dark:shadow-slate-900/50 backdrop-blur-sm"
                />
              </div>
            </form>
            <div className="flex items-center gap-4">
              {isAdmin ? (
                <select
                  value={branchPref}
                  onChange={handleBranchChange}
                  className="rounded-full bg-white dark:bg-slate-800/90 dark:text-white border-2 border-slate-300 dark:border-slate-600/50 px-5 py-3 text-base font-semibold shadow-md dark:shadow-slate-900/50 focus:outline-none focus:ring-4 focus:ring-sky-300 dark:focus:ring-sky-500/50 backdrop-blur-sm"
                >
                  {branchOptions.map(opt=>(
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <div className="text-base font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/90 dark:border-2 dark:border-slate-600/50 px-5 py-3 rounded-full shadow-md dark:shadow-slate-900/50 backdrop-blur-sm">
                  Şube: {branchLabel}
                </div>
              )}
              <NotificationCenter />
              <button
                onClick={toggleTheme}
                className="rounded-full bg-white dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700/90 border-2 border-slate-300 dark:border-slate-600/50 text-slate-700 dark:text-slate-200 text-xl px-5 py-3 shadow-md dark:shadow-slate-900/50 transition font-semibold backdrop-blur-sm hover:scale-105 active:scale-95"
                title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <a
                href="/catalog"
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-blue-600 hover:bg-blue-700 text-white text-base font-bold px-6 py-3 shadow-lg"
              >
                OPAC
              </a>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          <div className="w-full p-0">
            <Outlet/>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AppLayout(){
  return (
    <NotificationProvider>
      <ToastProvider>
        <AppLayoutContent />
      </ToastProvider>
    </NotificationProvider>
  );
}
