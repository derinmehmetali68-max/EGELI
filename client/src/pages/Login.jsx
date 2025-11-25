import React, { useState, useEffect } from 'react';
import api, { saveAuthSession, clearAuthSession } from '../api';
import { getThemePreference, setThemePreference } from '../utils/theme';
import Input from '../components/Input';
import Button from '../components/Button';

export default function Login() {
  const [email, setEmail] = useState('cumhuriyet');
  const [password, setPassword] = useState('11062300');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => getThemePreference());

  // URL'de book:ID formatında parametre varsa kitap detayına yönlendir
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('data');
    if (data && data.startsWith('book:')) {
      const bookId = data.replace('book:', '');
      // Oturum açık mı kontrol et
      const token = localStorage.getItem('token');
      if (token) {
        window.location.href = `/app/books/${bookId}`;
      } else {
        // Oturum kapalıysa, giriş yaptıktan sonra yönlendir
        sessionStorage.setItem('redirectAfterLogin', `/app/books/${bookId}`);
      }
    }
  }, []);

  useEffect(() => {
    const themeHandler = (ev) => setTheme(ev.detail ?? getThemePreference());
    window.addEventListener('theme-change', themeHandler);
    return () => window.removeEventListener('theme-change', themeHandler);
  }, []);

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemePreference(newTheme);
    setTheme(newTheme);
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      console.log('Giriş deneniyor:', { email, password: '***' });
      const { data } = await api.post('/auth/login', { email, password });
      console.log('Giriş başarılı:', data);
      saveAuthSession(data);

      // Yönlendirme kontrolü
      const redirectPath = sessionStorage.getItem('redirectAfterLogin');
      if (redirectPath) {
        sessionStorage.removeItem('redirectAfterLogin');
        window.location.href = redirectPath;
      } else {
        window.location.href = '/app/dashboard';
      }
    } catch (error) {
      console.error('Giriş hatası:', error);
      console.error('Hata detayı:', error?.response?.data);
      clearAuthSession(false);
      const message = error?.response?.data?.error || error?.message || 'Giriş başarısız';
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100 transition-colors duration-500">
      <div className="absolute top-4 right-4 animate-fade-in">
        <button
          onClick={toggleTheme}
          className="rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xl p-3 shadow-sm backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
          title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      
      <div className="w-full max-w-md p-4 animate-scale-in">
        <div className="card glass p-8 space-y-8 relative overflow-hidden">
          {/* Decorative background elements */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-sky-400/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="text-center space-y-2 relative">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white text-3xl shadow-lg mb-4">
              📚
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Kütüphane Otomasyonu
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Hesabınıza giriş yapın
            </p>
          </div>

          <form onSubmit={submit} className="space-y-6 relative">
            {err && (
              <div className="animate-fade-in p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {err}
              </div>
            )}

            <div className="space-y-4">
              <Input
                label="Kullanıcı Adı / E-posta"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder=" "
                floatingLabel
                required
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
              />
              
              <Input
                type="password"
                label="Şifre"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder=" "
                floatingLabel
                required
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full shadow-lg shadow-sky-500/20"
                size="lg"
                loading={loading}
              >
                Giriş Yap
              </Button>
            </div>
          </form>

          <div className="text-center pt-4 border-t border-slate-100 dark:border-slate-800">
            <a 
              href="/catalog" 
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors group"
            >
              <span>Genel Katalog (OPAC)</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
