import React, { useEffect, useState } from 'react';
import api from '../api';
import { resolveAssetUrl } from '../utils/url';

export default function Ai() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-1.5-flash-latest');
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [enrichResult, setEnrichResult] = useState(null);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [source, setSource] = useState('none');

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await fetchConfig();
      if (!cancelled) setLoading(false);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  function ensureKey() {
    if (!hasExistingKey && source !== 'env') {
      alert('Önce bir Gemini API anahtarı eklemelisiniz.');
      return false;
    }
    return true;
  }

  function formatAiError(err, fallback) {
    const base = err?.response?.data?.error || fallback;
    const detail = err?.response?.data?.detail ? `\nDetay: ${err.response.data.detail}` : '';
    const tried = err?.response?.data?.triedModels ? `\nDenemeler: ${err.response.data.triedModels.join(', ')}` : '';
    return `${base}${detail}${tried}`;
  }

  async function fetchConfig() {
    try {
      const { data } = await api.get('/ai/config');
      setHasExistingKey(Boolean(data?.hasKey));
      setSource(data?.source || 'none');
      if (data?.model) {
        setModel(data.model);
      }
    } catch (err) {
      console.error(err);
      setStatus('AI ayarları alınamadı.');
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const trimmed = apiKey.trim();
      await api.post('/ai/config', { apiKey: trimmed, model });
      await fetchConfig();
      setStatus('AI ayarları kaydedildi.');
      setApiKey('');
    } catch (err) {
      console.error(err);
      setStatus(err.response?.data?.error || 'AI ayarları kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  async function executeNormalization() {
    const { data } = await api.post('/books/ai-normalize');
    return data;
  }

  async function executeGeminiEnrich() {
    const { data } = await api.post('/books/gemini/enrich');
    return data;
  }

  async function handleRunNormalization() {
    if (running) return;
    if (runAllLoading) return;
    if (!ensureKey()) return;
    setRunning(true);
    setResult(null);
    setStatus('Gemini ile düzeltme başlatıldı...');
    try {
      const data = await executeNormalization();
      setStatus('Düzeltme tamamlandı.');
      setResult(data);
    } catch (err) {
      console.error(err);
      setStatus(formatAiError(err, 'Düzeltme başarısız oldu.'));
    } finally {
      setRunning(false);
    }
  }

  async function handleGeminiEnrich() {
    if (enriching || runAllLoading) return;
    if (!ensureKey()) return;
    setEnriching(true);
    setEnrichResult(null);
    setStatus('Gemini web araştırması başlatıldı...');
    try {
      const data = await executeGeminiEnrich();
      setEnrichResult(data);
      setStatus('Gemini araştırması tamamlandı.');
    } catch (err) {
      console.error(err);
      setStatus(formatAiError(err, 'Gemini araştırması başarısız oldu.'));
    } finally {
      setEnriching(false);
    }
  }

  async function handleRunAll() {
    if (runAllLoading || running || enriching) return;
    if (!ensureKey()) return;
    setRunAllLoading(true);
    setRunning(true);
    setEnriching(true);
    setResult(null);
    setEnrichResult(null);
    setStatus('AI düzeltmeleri başlatıldı...');
    try {
      const normalizationData = await executeNormalization();
      setResult(normalizationData);
      setStatus('Gemini web araştırması devam ediyor...');
      const enrichData = await executeGeminiEnrich();
      setEnrichResult(enrichData);
      setStatus('AI işlemleri tamamlandı.');
    } catch (err) {
      console.error(err);
      setStatus(formatAiError(err, 'AI işlemleri başarısız oldu.'));
    } finally {
      setRunning(false);
      setEnriching(false);
      setRunAllLoading(false);
    }
  }

  async function handleClearKey() {
    setSaving(true);
    setStatus(null);
    try {
      await api.post('/ai/config', { apiKey: '' });
      await fetchConfig();
      setStatus('Kayıtlı anahtar kaldırıldı.');
      setApiKey('');
    } catch (err) {
      console.error(err);
      setStatus(err.response?.data?.error || 'Anahtar temizlenirken hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div>AI ayarları yükleniyor...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">AI Entegrasyonu</h1>
          <p className="text-sm text-slate-500 mt-2">
            Google Gemini API anahtarınızı ekleyerek kitap verilerini otomatik doğrulayabilir ve eksikleri hızla düzeltebilirsiniz. Önerilen model: <code className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">gemini-1.5-flash-latest</code>.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gemini API Anahtarı</span>
            <input
              type="password"
              className="input"
              placeholder={hasExistingKey ? 'Anahtar kayıtlı (güncellemek için yeni anahtar girin)' : 'AIza...'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Model</span>
            <input
              className="input"
              value={model}
              onChange={e => setModel(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
          </button>
          <button className="btn-secondary" onClick={handleClearKey} disabled={saving}>
            Anahtarı Temizle
          </button>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Durum:</span>
            <span className="font-semibold text-slate-700">{source === 'env' ? 'Sunucu ortam değişkeni kullanılıyor' : hasExistingKey ? 'Anahtar kayıtlı' : 'Anahtar girilmedi'}</span>
          </div>
        </div>

        {status && <div className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 whitespace-pre-wrap">{status}</div>}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">AI Destekli Düzeltmeler</h2>
          <p className="text-sm text-slate-500 mt-2">
            Kitap kayıtlarını Gemini modeline ileterek ISBN, başlık, yazar ve yayınevi bilgilerini doğrulatın. İşlem yaklaşık 200 kayıt üzerinde çalışır.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            onClick={handleRunAll}
            disabled={runAllLoading || running || enriching}
          >
            {runAllLoading ? 'Tüm AI işlemleri çalışıyor...' : 'AI ile Her Şeyi Çalıştır'}
          </button>
          <button
            className="btn-secondary"
            onClick={handleRunNormalization}
            disabled={running || runAllLoading}
          >
            {running ? 'Düzeltme Çalışıyor...' : 'AI ile Kitapları Düzelt'}
          </button>
          <button
            className="btn-secondary"
            onClick={handleGeminiEnrich}
            disabled={enriching || runAllLoading}
          >
            {enriching ? 'Gemini Araştırması Çalışıyor...' : 'Gemini ile Eksikleri Tamamla'}
          </button>
        </div>
        {result && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 space-y-1">
              <div className="font-semibold text-slate-700">AI Özeti</div>
              <div>Güncellenen kayıt: <span className="font-semibold text-slate-800">{result.applied}</span></div>
              {result.summary?.notes && <div className="mt-1 text-slate-500">{result.summary.notes}</div>}
              {Array.isArray(result.cover_updates) && result.cover_updates.length > 0 && (
                <div className="text-slate-500">
                  Yeni kapak görseli eklenen kitap: <span className="font-semibold text-slate-700">{result.cover_updates.length}</span>
                </div>
              )}
              {result.batch && (
                <div className="text-xs text-slate-500 space-y-0.5">
                  <div>İşlenen aralık: ID {result.batch.first_id ?? '—'} – {result.batch.last_id ?? '—'} ({result.batch.processed} kayıt)</div>
                  <div>Toplam kitap: {result.batch.total}</div>
                  <div>
                    Sonraki başlangıç ID: {result.batch.next_cursor ?? '—'}{' '}
                    {result.batch.wrapped ? '(başa döndü)' : ''}
                  </div>
                </div>
              )}
            </div>

            {Array.isArray(result.books) && result.books.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Kapak</th>
                      <th className="px-4 py-2 text-left">Kitap</th>
                      <th className="px-4 py-2 text-left">Yazar</th>
                      <th className="px-4 py-2 text-left">Yayınevi</th>
                      <th className="px-4 py-2 text-left">Kategori</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                    {result.books.map(book => {
                      const coverUrl = resolveAssetUrl(book.cover_path);
                      return (
                        <tr key={book.id}>
                          <td className="px-4 py-2">
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={book.title ? `${book.title} kapak` : 'Kapak'}
                                className="h-16 w-12 object-cover rounded shadow-sm border border-slate-200"
                              />
                            ) : (
                              <span className="text-xs text-slate-400">Kapak yok</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-900">{book.title || '—'}</div>
                            <div className="text-xs text-slate-500">#{book.id} · ISBN: {book.isbn || 'Belirsiz'}</div>
                          </td>
                          <td className="px-4 py-2">{book.author || '—'}</td>
                          <td className="px-4 py-2">{book.publisher || '—'}</td>
                          <td className="px-4 py-2">{book.category || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-4 py-3">
                Güncellenecek kayıt bulunmadı.
              </div>
            )}

            {Array.isArray(result.changes) && result.changes.length > 0 && (
              <details className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4">
                <summary className="cursor-pointer text-slate-300">Ham JSON çıktısını göster</summary>
                <pre className="mt-3 whitespace-pre-wrap text-[11px]">{JSON.stringify(result, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
        {enrichResult && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 space-y-1">
              <div className="font-semibold text-slate-700">Gemini Web Araştırması Özeti</div>
              <div>İşlenen kitap: <span className="font-semibold text-slate-800">{enrichResult.processed}</span></div>
              <div>
                Güncellenen: <span className="font-semibold text-emerald-600">{enrichResult.updated}</span> · Atlanan:{' '}
                <span className="font-semibold text-slate-600">{enrichResult.skipped}</span> · Hatalı:{' '}
                <span className="font-semibold text-rose-600">{enrichResult.errors}</span>
              </div>
              <div>Kalan eksik kayıt: <span className="font-semibold text-slate-700">{enrichResult.remaining}</span></div>
            </div>
            {Array.isArray(enrichResult.items) && enrichResult.items.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Kitap</th>
                      <th className="px-4 py-2 text-left">Durum</th>
                      <th className="px-4 py-2 text-left">Değişiklikler</th>
                      <th className="px-4 py-2 text-left">Kaynak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                    {enrichResult.items.slice(0, 10).map(item => (
                      <tr key={`${item.id ?? item.isbn}`}>
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{item.isbn || '—'}</div>
                          <div className="text-xs text-slate-500">ID: {item.id ?? '—'}</div>
                        </td>
                        <td className="px-4 py-2">
                          {item.status === 'error' ? (
                            <span className="text-rose-600 font-semibold">Hata</span>
                          ) : item.status === 'updated' ? (
                            <span className="text-emerald-600 font-semibold">Güncellendi</span>
                          ) : item.status === 'no_data' ? (
                            <span className="text-slate-500">Veri bulunamadı</span>
                          ) : (
                            <span className="text-slate-600">Değişiklik yok</span>
                          )}
                          {item.downloaded_cover ? (
                            <div className="text-xs text-emerald-600">Kapak indirildi</div>
                          ) : null}
                          {item.status === 'error' && (
                            <div className="text-xs text-rose-500 whitespace-pre-wrap">{item.error}</div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {item.changes && Object.keys(item.changes).length > 0 ? (
                            <div className="space-y-1 text-xs text-slate-500">
                              {Object.entries(item.changes).map(([field, change]) => (
                                <div key={field}>
                                  <span className="font-semibold text-slate-600">{field}</span>:{' '}
                                  <span className="line-through text-slate-400">{change.before ?? '—'}</span> →{' '}
                                  <span className="text-slate-700">{change.after ?? '—'}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {Array.isArray(item.sources) && item.sources.length > 0 ? (
                            <a
                              href={item.sources[0].url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sky-600 hover:underline"
                            >
                              {item.sources[0].title || 'Kaynağı aç'}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {enrichResult.items.length > 10 && (
                  <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
                    Liste kısaltıldı. Tam liste için ham çıktıyı görüntüleyin.
                  </div>
                )}
              </div>
            )}
            {Array.isArray(enrichResult.items) && enrichResult.items.length > 0 && (
              <details className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4">
                <summary className="cursor-pointer text-slate-300">Ham JSON çıktısını göster</summary>
                <pre className="mt-3 whitespace-pre-wrap text-[11px]">{JSON.stringify(enrichResult, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
