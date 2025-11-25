import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { withAuth } from '../utils/url';

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    return date.toLocaleString('tr-TR');
  } catch {
    return value;
  }
}

export default function Database() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadBackups();
    }
  }, [currentUser]);

  async function loadBackups() {
    try {
      setLoading(true);
      const { data } = await api.get('/database/backups');
      setBackups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Yedek listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBackup() {
    try {
      setCreating(true);
      const { data } = await api.post('/database/backups');
      setBackups(prev => [data, ...prev]);
      alert('Yeni veritabanı yedeği oluşturuldu.');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Yedek oluşturulamadı.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteBackup(name) {
    if (!window.confirm(`${name} yedeği tamamen silinecek. Emin misiniz?`)) return;
    try {
      setActiveAction(name + ':delete');
      await api.delete(`/database/backups/${encodeURIComponent(name)}`);
      setBackups(prev => prev.filter(item => item.name !== name));
      alert('Yedek silindi.');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Yedek silinemedi.');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleRestoreBackup(name) {
    if (!window.confirm(`${name} yedeği aktif veritabanının üzerine yazılacak. Devam etmek istiyor musunuz?`)) return;
    try {
      setActiveAction(name + ':restore');
      await api.post(`/database/backups/${encodeURIComponent(name)}/restore`);
      alert('Veritabanı yedeği başarıyla geri yüklendi. Oturumu yenilemeniz önerilir.');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Geri yükleme başarısız oldu.');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleUpload(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('backup', file);
    try {
      setUploading(true);
      const { data } = await api.post('/database/backups/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBackups(prev => [data, ...prev]);
      alert('Yedek dosyası yüklendi. İstediğiniz zaman geri yükleyebilirsiniz.');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Dosya yüklenemedi.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleResetDatabase() {
    if (resetting) return;
    const confirmed = window.confirm(
      'Bu işlem veritabanındaki TÜM verileri kalıcı olarak silecektir. Devam etmeden önce yedek aldığınızdan emin olun. Devam etmek istiyor musunuz?'
    );
    if (!confirmed) return;
    const code = window.prompt("Onaylamak için 'SIFIRLA' yazın.");
    if (code !== 'SIFIRLA') {
      alert('İşlem iptal edildi.');
      return;
    }
    try {
      setResetting(true);
      await api.post('/database/reset');
      alert('Veritabanı sıfırlandı. Sistem varsayılan yönetici hesabı ve örnek verilerle yeniden oluşturuldu.');
      await loadBackups();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Veritabanı sıfırlanamadı.');
    } finally {
      setResetting(false);
    }
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-600">
        Veritabanı yönetimi yalnızca yönetici kullanıcılar tarafından görüntülenebilir.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Veritabanı Yönetimi</p>
          <h1 className="text-3xl font-semibold text-slate-900">Veritabanı</h1>
          <p className="text-slate-600 max-w-3xl">
            Veritabanı yedeklerinizi buradan oluşturabilir, indirebilir, geri yükleyebilir veya silebilirsiniz. Kritik
            işlemlerden önce yeni bir yedek alınması önerilir.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={handleCreateBackup}
              disabled={creating}
              className="btn-primary"
            >
              {creating ? 'Yedek Alınıyor…' : 'Yeni Yedek Oluştur'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Yükleniyor…' : 'Yedek Dosyası Yükle'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".db"
              className="hidden"
              onChange={e => handleUpload(e.target.files?.[0])}
            />
            <button
              onClick={handleResetDatabase}
              disabled={resetting}
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-semibold uppercase tracking-wide text-white bg-gradient-to-r from-rose-600 to-red-600 shadow-lg transition hover:from-red-600 hover:to-rose-700 disabled:opacity-60"
            >
              {resetting ? 'Sıfırlanıyor…' : 'Veritabanını Sıfırla'}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Yedek Dosyaları</h2>
          <span className="text-xs text-slate-500">Toplam {backups.length} kayıt</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Dosya</th>
                <th className="px-4 py-3 text-left font-semibold">Boyut</th>
                <th className="px-4 py-3 text-left font-semibold">Oluşturma</th>
                <th className="px-4 py-3 text-left font-semibold">Güncelleme</th>
                <th className="px-4 py-3 text-right font-semibold">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-slate-500">Yedekler yükleniyor…</td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-slate-500">Henüz yedek bulunmuyor.</td>
                </tr>
              ) : (
                backups.map(item => (
                  <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.size}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(item.updated_at)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <a
                        className="text-xs font-semibold text-sky-600 hover:text-sky-800"
                        href={withAuth(`/database/backups/${encodeURIComponent(item.name)}/download`)}
                      >
                        İndir
                      </a>
                      <button
                        onClick={() => handleRestoreBackup(item.name)}
                        disabled={activeAction === item.name + ':restore'}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
                      >
                        {activeAction === item.name + ':restore' ? 'Yükleniyor…' : 'Geri Yükle'}
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(item.name)}
                        disabled={activeAction === item.name + ':delete'}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                      >
                        {activeAction === item.name + ':delete' ? 'Siliniyor…' : 'Sil'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4 text-sm text-slate-600">
        <h3 className="text-lg font-semibold text-slate-900">Bilmeniz Faydalı</h3>
        <ul className="list-disc ml-5 space-y-2">
          <li>Yedek oluşturma işlemi mevcut veritabanını etkilemez; dosya <code>server/data/backups</code> klasörüne kaydedilir.</li>
          <li>Geri yükleme, tüm verileri seçtiğiniz yedekle değiştirir. İşleme başlamadan önce yeni bir yedek alın.</li>
          <li>Yedekleri cihazınıza indirip güvenli bir depoda saklayın. Kritik işlemlerden sonra sistemden çıkış yapmanız önerilir.</li>
        </ul>
      </section>
    </div>
  );
}
