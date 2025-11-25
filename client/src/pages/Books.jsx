import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { getBranchPreference, preferenceToBranchId, preferenceToQuery } from '../utils/branch';
import { withAuth, resolveAssetUrl } from '../utils/url';
import { Modal, Input, Button, Badge, useToast, EmptyState, SkeletonTable } from '../components';
import { validateForm, validate } from '../utils/validation';

const CATEGORY_OPTIONS = [
  'Türk Edebiyatı',
  'Yabancı Edebiyat',
  'Şiir',
  'Hikaye',
  'Roman',
  'Bilim',
  'Tarih',
  'Felsefe',
  'Sanat',
  'Eğitim',
  'Psikoloji',
  'Din',
];

const EMPTY_FORM = {
  id: null,
  isbn: '',
  title: '',
  author: '',
  publisher: '',
  published_year: '',
  page_count: '',
  language: 'Türkçe',
  copies: 1,
  shelf: '',
  cabinet: '',
  categories: [],
  cover_path: '',
};

const PAGE_SIZE = 50;
const MAX_TOTAL = 10000;

export default function Books() {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: showError, warning, info } = useToast();
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(() => location.state?.searchQuery || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [coverFile, setCoverFile] = useState(null);
  const [coverJobRunning, setCoverJobRunning] = useState(false);
  const [coverJobStatus, setCoverJobStatus] = useState(null);
  const [importState, setImportState] = useState({
    open: false,
    status: 'idle',
    jobId: null,
    progress: 0,
    total: 0,
    processed: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    warningCounts: {},
    logs: [],
    error: null,
  });
  const importInputRef = useRef(null);
  const isbnInputRef = useRef(null);
  const importJobPollRef = useRef(null);
  const currentUser = useMemo(() => getCurrentUser(), []);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(Math.max(total, 0) / PAGE_SIZE)), [total]);
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;
  const firstItemIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItemIndex = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    const handler = ev => {
      setBranchPref(ev.detail ?? getBranchPreference());
    };
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  useEffect(() => {
    const initialSearch =
      location.state?.searchQuery && !query ? location.state.searchQuery : query;
    if (location.state?.searchQuery && !query) {
      setQuery(location.state.searchQuery);
    }
    loadBooks({ search: initialSearch, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter.join(','), branchPref]);

  useEffect(() => {
    const handler = ev => {
      const searchValue = ev.detail ?? '';
      setQuery(searchValue);
      loadBooks({ search: searchValue, page: 1 });
    };
    window.addEventListener('global-search', handler);
    return () => window.removeEventListener('global-search', handler);
  }, [branchPref, statusFilter, categoryFilter]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    // Klavye kısayolları
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openCreate();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Kitap adı"]');
        if (searchInput) searchInput.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (importJobPollRef.current) {
        clearInterval(importJobPollRef.current);
        importJobPollRef.current = null;
      }
    };
  }, []);

  const branchParam = useMemo(() => preferenceToQuery(branchPref), [branchPref]);
  const exportXlsxUrl = useMemo(() => {
    const params = {};
    if (branchParam !== undefined) params.branch_id = branchParam;
    return withAuth('/books/export.xlsx', params);
  }, [branchParam]);

  const booksPdfUrl = useMemo(() => {
    const params = {};
    if (branchParam !== undefined) params.branch_id = branchParam;
    if (query.trim()) params.q = query.trim();
    return withAuth('/reports/books.pdf', params);
  }, [branchParam, query]);

  const existingCoverUrl = useMemo(
    () => resolveAssetUrl(formData.cover_path),
    [formData.cover_path]
  );

  async function loadBooks({ search = query, page: targetPage = 1 } = {}) {
    setLoading(true);
    try {
      const params = {
        page: targetPage,
        page_size: PAGE_SIZE,
      };
      const trimmed = search?.trim();
      if (trimmed) params.q = trimmed;
      if (branchParam !== undefined) params.branch_id = branchParam;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (categoryFilter.length) params.categories = categoryFilter.join(',');
      const { data } = await api.get('/books', { params });
      const items = Array.isArray(data) ? data.slice(0, PAGE_SIZE) : data.items || [];
      const totalCount = Array.isArray(data)
        ? data.length
        : Number(data.total ?? items.length ?? 0);
      if (items.length === 0 && totalCount > 0 && targetPage > 1) {
        await loadBooks({ search, page: targetPage - 1 });
        return;
      }
      setBooks(items);
      setTotal(Math.min(totalCount, MAX_TOTAL));
      setSelectedRows(new Set());
      setPage(targetPage);
    } catch (err) {
      console.error('loadBooks error:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      // Hata durumunda boş liste göster ama kullanıcıyı bilgilendir
      setBooks([]);
      setTotal(0);
      if (err.response?.status === 429) {
        setTimeout(() => {
          warning('Çok fazla istek gönderildi. Lütfen birkaç saniye bekleyin ve sayfayı yenileyin.');
        }, 100);
      } else if (err.response?.status >= 500) {
        setTimeout(() => {
          warning('Sunucu hatası oluştu. Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.');
        }, 100);
      }
    } finally {
      setLoading(false);
    }
  }

  function gotoPage(targetPage) {
    if (!Number.isFinite(targetPage)) return;
    const normalized = Math.min(Math.max(Math.floor(targetPage), 1), totalPages);
    loadBooks({ search: query, page: normalized });
  }

  function handlePageInputChange(e) {
    setPageInput(e.target.value);
  }

  function handlePageSubmit(e) {
    e.preventDefault();
    const target = Number(pageInput);
    if (!Number.isFinite(target) || target < 1 || target > totalPages) {
      warning(`1 ile ${totalPages} arasında bir sayfa girin.`);
      return;
    }
    gotoPage(target);
  }

  function openCreate() {
    setFormMode('create');
    setFormData(EMPTY_FORM);
    setCoverFile(null);
    setShowForm(true);
    setTimeout(() => isbnInputRef.current?.focus(), 150);
  }

  function openEdit(book) {
    setFormMode('edit');
    setFormData({
      id: book.id,
      isbn: book.isbn ?? '',
      title: book.title ?? '',
      author: book.author ?? '',
      publisher: book.publisher ?? '',
      published_year: book.published_year ?? '',
      page_count: book.page_count ?? '',
      language: book.language ?? 'Türkçe',
      copies: book.copies ?? 1,
      shelf: book.shelf ?? '',
      cabinet: book.cabinet ?? '',
      categories: book.category ? book.category.split(',').map(s => s.trim()).filter(Boolean) : [],
      cover_path: book.cover_path ?? '',
    });
    setCoverFile(null);
    setShowForm(true);
    setTimeout(() => isbnInputRef.current?.focus(), 150);
  }

  function closeForm() {
    setShowForm(false);
  }

  async function handleFetchMeta(isbnOverride = null, downloadCover = false) {
    const targetIsbn = isbnOverride || formData.isbn;
    if (!targetIsbn) return;
    try {
      const params = downloadCover ? { download_cover: 'true' } : {};
      const { data } = await api.get(`/books/isbn/${targetIsbn}/fetch`, { params });
      setFormData(prev => ({
        ...prev,
        isbn: targetIsbn,
        title: data.title || prev.title,
        author: data.author || prev.author,
        publisher: data.publisher || prev.publisher,
        published_year: data.published_year || prev.published_year,
        page_count: data.page_count || prev.page_count,
        language: data.language || prev.language,
        categories: data.category
          ? data.category.split(',').map(s => s.trim()).filter(Boolean)
          : prev.categories,
        cover_path: data.cover_path || prev.cover_path,
      }));
      if (data.cover_path) {
        success('Kitap bilgileri ve kapak resmi getirildi!');
      } else {
        warning('Kitap bilgileri getirildi. (Kapak resmi bulunamadı)');
      }
    } catch (err) {
      showError('ISBN bilgisi getirilemedi: ' + (err.response?.data?.error || err.message));
    }
  }

  async function uploadCoverIfNeeded() {
    if (!coverFile) return formData.cover_path || null;
    const fd = new FormData();
    fd.append('file', coverFile);
    const { data } = await api.post('/books/cover', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.path;
  }

  async function handleSave(e) {
    e?.preventDefault();

    // Validation
    const validationSchema = {
      title: { required: true, requiredMessage: 'Kitap adı zorunludur' },
      isbn: {
        required: false,
        custom: (value) => {
          if (value && value.trim()) {
            const cleaned = value.replace(/[-\s]/g, '');
            if (cleaned.length > 0 && cleaned.length !== 13) {
              return 'ISBN 13 haneli olmalıdır';
            }
          }
          return null;
        }
      },
      copies: {
        required: true,
        positive: true,
        requiredMessage: 'Kopya sayısı zorunludur',
        positiveMessage: 'Kopya sayısı pozitif olmalıdır'
      },
    };

    const validation = validateForm(formData, validationSchema);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      showError('Lütfen form hatalarını düzeltin');
      return;
    }

    setFormErrors({});

    if (!formData.title.trim()) {
      showError('Kitap adı zorunludur');
      return;
    }
    const cover_path = await uploadCoverIfNeeded();
    const branchIdForWrite = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
    const payload = {
      isbn: formData.isbn || null,
      title: formData.title,
      author: formData.author || null,
      publisher: formData.publisher || null,
      published_year: formData.published_year || null,
      page_count: formData.page_count ? Number(formData.page_count) : null,
      language: formData.language || 'Türkçe',
      copies: Number(formData.copies) || 1,
      categories: formData.categories,
      shelf: formData.shelf || null,
      cabinet: formData.cabinet || null,
      cover_path,
      branch_id: branchIdForWrite,
    };
    try {
      if (formMode === 'create') {
        await api.post('/books', payload);
      } else if (formData.id) {
        await api.put(`/books/${formData.id}`, payload);
      }
      closeForm();
      const nextPage = formMode === 'create' ? 1 : page;
      await loadBooks({ search: query, page: nextPage });
      success(formMode === 'create' ? 'Kitap başarıyla eklendi!' : 'Kitap başarıyla güncellendi!');
    } catch (err) {
      showError(err.response?.data?.error || 'Kayıt sırasında bir hata oluştu.');
    }
  }

  async function handleDelete(id) {
    const book = books.find(b => b.id === id);
    if (!window.confirm(`"${book?.title || 'Bu kitap'}" silmek istediğinizden emin misiniz?`)) return;
    try {
      await api.delete(`/books/${id}`);
      await loadBooks({ search: query, page });
      success('Kitap başarıyla silindi!');
    } catch (err) {
      const message = err.response?.data?.error || 'Kitap silinemedi.';
      showError(message);
    }
  }

  function toggleRow(id) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedRows.size === books.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(books.map(b => b.id)));
    }
  }

  function handleCategoryFilter(e) {
    const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
    setCategoryFilter(options);
  }

  async function handleImportXlsx(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const branchIdForWrite = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
    fd.append('branch_id', branchIdForWrite ?? '');
    setImportState({
      open: true,
      status: 'uploading',
      jobId: null,
      progress: 0,
      total: 0,
      processed: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
      warningCounts: {},
      logs: [],
      error: null,
    });
    try {
      const { data } = await api.post('/books/import.xlsx', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const jobId = data?.jobId;
      if (!jobId) {
        throw new Error('İçe aktarma görevi başlatılamadı.');
      }
      setImportState(prev => ({
        ...prev,
        status: 'processing',
        jobId,
        total: data?.total ?? prev.total,
      }));
      startImportJobPolling(jobId);
    } catch (err) {
      console.error(err);
      setImportState(prev => ({
        ...prev,
        status: 'error',
        error: err.response?.data?.error || err.message || 'İçe aktarma başlatılamadı.',
      }));
    } finally {
      e.target.value = '';
    }
  }

  function startImportJobPolling(jobId) {
    const poll = async () => {
      try {
        const { data } = await api.get(`/books/import-jobs/${jobId}`);
        setImportState(prev => {
          const progress = data.total
            ? Math.round((data.processed / data.total) * 100)
            : data.status === 'completed'
              ? 100
              : prev.progress;
          return {
            ...prev,
            status: data.status,
            progress,
            total: data.total,
            processed: data.processed,
            imported: data.imported,
            skipped: data.skipped,
            errors: data.errors,
            warningCounts: data.warningCounts || {},
            logs: Array.isArray(data.logs) ? data.logs : prev.logs,
            error: data.error || null,
          };
        });
        if (data.status === 'completed' || data.status === 'error') {
          if (importJobPollRef.current) {
            clearInterval(importJobPollRef.current);
            importJobPollRef.current = null;
          }
          if (data.status === 'completed') {
            await loadBooks({ search: query, page: 1 });
          }
        }
      } catch (err) {
        if (importJobPollRef.current) {
          clearInterval(importJobPollRef.current);
          importJobPollRef.current = null;
        }
        console.error(err);
        setImportState(prev => ({
          ...prev,
          status: 'error',
          error: err.response?.data?.error || err.message || 'İçe aktarma durumu alınamadı.',
        }));
      }
    };

    if (importJobPollRef.current) {
      clearInterval(importJobPollRef.current);
    }
    importJobPollRef.current = setInterval(poll, 1000);
    poll();
  }

  const isImportRunning = importState.status === 'uploading' || importState.status === 'processing';

  function closeImportModal() {
    if (isImportRunning) return;
    setImportState(prev => ({ ...prev, open: false }));
  }

  const booksQrUrl = useMemo(() => {
    const params = {};
    if (branchParam !== undefined) params.branch_id = branchParam;
    if (selectedRows.size) {
      params.ids = Array.from(selectedRows).join(',');
    }
    return withAuth('/books/qr.pdf', params);
  }, [branchParam, selectedRows]);

  function handleBulkQr() {
    if (!selectedRows.size) {
      showError('Lütfen en az bir kitap seçiniz.');
      return;
    }
    window.open(booksQrUrl, '_blank', 'noopener');
  }

  async function handleFillAll() {
    if (coverJobRunning) return;
    const ids = selectedRows.size ? Array.from(selectedRows) : null;
    const confirmMessage = ids?.length
      ? `Seçili ${ids.length} kitap için eksik kapakları getirmek istiyor musunuz?`
      : 'Eksik kapak resimleri otomatik olarak indirilecek. Devam edilsin mi?';
    if (!window.confirm(confirmMessage)) return;
    const branchIdForWrite = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
    const batchLimit = ids?.length ? ids.length : 500;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let remaining = 0;
    let batches = 0;

    setCoverJobRunning(true);
    setCoverJobStatus({ processed: 0, updated: 0, skipped: 0, errors: 0, remaining: null, batches: 0 });

    try {
      if (ids?.length) {
        const { data } = await api.post('/books/covers/complete', { ids, limit: batchLimit, branch_id: branchIdForWrite });
        totalProcessed += data?.processed ?? 0;
        totalUpdated += data?.updated ?? 0;
        totalSkipped += data?.skipped ?? 0;
        totalErrors += data?.errors ?? 0;
        remaining = data?.remaining ?? 0;
        batches = 1;
        setCoverJobStatus({ processed: totalProcessed, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors, remaining, batches });
      } else {
        let continueLoop = true;
        while (continueLoop) {
          const { data } = await api.post('/books/covers/complete', { limit: batchLimit, branch_id: branchIdForWrite });
          const processed = data?.processed ?? 0;
          const updated = data?.updated ?? 0;
          const skipped = data?.skipped ?? 0;
          const errors = data?.errors ?? 0;
          remaining = data?.remaining ?? 0;
          totalProcessed += processed;
          totalUpdated += updated;
          totalSkipped += skipped;
          totalErrors += errors;
          batches += 1;
          setCoverJobStatus({ processed: totalProcessed, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors, remaining, batches });

          if (!processed || remaining <= 0) {
            continueLoop = false;
          } else {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }
      }

      await loadBooks({ search: query, page });
      warning(
        `Kapak tamamlama bitti.\n` +
        `İşlenen kitap: ${totalProcessed}\n` +
        `Yeni kapak eklenen: ${totalUpdated}\n` +
        `Atlanan: ${totalSkipped}\n` +
        `Hatalı: ${totalErrors}\n` +
        `Kalan eksik kapak: ${remaining}`
      );
    } catch (err) {
      console.error(err);
      warning(err.response?.data?.error || 'Kapak tamamlama işlemi sırasında hata oluştu.');
    } finally {
      setCoverJobRunning(false);
      setCoverJobStatus(null);
    }
  }

  async function handleQuickIsbnAdd() {
    const isbnInput = prompt('ISBN numarasını girin:');
    if (!isbnInput) return;

    const isbn = isbnInput.trim();
    if (!isbn) {
      warning('ISBN girilmedi.');
      return;
    }

    try {
      const { data } = await api.get(`/books/isbn/${isbn}/fetch`);
      if (!data || !data.title) {
        warning('ISBN bilgisi bulunamadı. Lütfen kitabı manuel ekleyin.');
        return;
      }

      const branchIdForWrite = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
      const categories = data.category
        ? data.category
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
        : [];

      await api.post('/books', {
        isbn,
        title: data.title,
        author: data.author || null,
        publisher: data.publisher || null,
        published_year: data.published_year || null,
        page_count: data.page_count ? Number(data.page_count) || null : null,
        language: data.language || 'Türkçe',
        copies: 1,
        categories,
        shelf: null,
        cabinet: null,
        cover_path: data.cover_path || null,
        branch_id: branchIdForWrite,
      });

      await loadBooks({ search: query, page: 1 });
      success(`"${data.title}" başarıyla eklendi!`);
    } catch (err) {
      if (err?.response?.status === 404) {
        warning('ISBN bulunamadı. Lütfen kitabı manuel ekleyin.');
      } else {
        console.error(err);
        showError(err.response?.data?.error || 'ISBN ile ekleme sırasında bir hata oluştu.');
      }
    }
  }


  return (
    <div className="space-y-2 w-full">
      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 dark:bg-black dark:border-slate-800 rounded-none shadow-lg border-x-0 border-t-0 border-b-2 border-slate-300 dark:border-slate-700 p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-sky-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-base uppercase tracking-[0.3em] text-slate-600 dark:text-slate-300 font-bold">CUMHURİYET ANADOLU LİSESİ</p>
            <h1 className="mt-3 text-4xl font-bold text-slate-900 dark:text-white">Kütüphane Yönetimi</h1>
            <p className="mt-4 text-slate-700 dark:text-slate-200 text-base max-w-lg font-medium">
              ISBN ile hızlı ekleme, Excel yükleme ve kapsamlı filtreleme seçenekleriyle koleksiyonunuzu yönetin.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5 text-center lg:w-96">
            <div className="rounded-xl bg-slate-900 dark:bg-slate-800 text-white px-6 py-5 shadow-lg border-2 border-slate-700">
              <p className="text-sm tracking-wide uppercase text-slate-200 font-bold">Toplam Kitap</p>
              <p className="text-3xl font-bold mt-2">{total}</p>
              <p className="text-xs text-slate-300 mt-2 font-semibold">
                {total > 0 ? `${firstItemIndex}-${lastItemIndex}. kayıt` : 'Kayıt bulunamadı'}
              </p>
            </div>
            <div className="rounded-xl bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-6 py-5 shadow-lg border-2 border-blue-300 dark:border-blue-700">
              <p className="text-sm tracking-wide uppercase text-blue-700 dark:text-blue-200 font-bold">Seçili Kitap</p>
              <p className="text-3xl font-bold mt-2">{selectedRows.size}</p>
              <p className="text-[11px] text-sky-500 mt-1">
                {total > 0 ? `Sayfa ${page}/${totalPages}` : ''}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2 items-center px-3 py-2 bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-700">
        <Button variant="primary" onClick={openCreate} title="Yeni Kitap Ekle (Ctrl+N)">+ YENİ KİTAP</Button>
        <Button variant="secondary" onClick={handleQuickIsbnAdd}>ISBN İLE HIZLI EKLE</Button>
        <Button
          variant="secondary"
          onClick={() => importInputRef.current?.click()}
          disabled={isImportRunning || coverJobRunning}
        >
          EXCEL YÜKLE
        </Button>
        <a href={exportXlsxUrl} className="btn btn-secondary whitespace-nowrap text-base font-semibold px-5 py-3 shadow-md">EXCEL İNDİR</a>
        <a href={booksPdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary whitespace-nowrap text-base font-semibold px-5 py-3 shadow-md">PDF İNDİR</a>
        <Button variant="secondary" onClick={handleFillAll} disabled={coverJobRunning} loading={coverJobRunning}>
          TÜM KAPAK RESİMLERİNİ TAMAMLA
        </Button>
        <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportXlsx} />
        {coverJobStatus && (
          <div className="text-xs text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 dark:border-slate-800 border border-slate-200 dark:border rounded-lg px-3 py-2">
            <div>İşlenen: <span className="font-semibold text-slate-700 dark:text-white">{coverJobStatus.processed}</span> · Yeni kapak: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{coverJobStatus.updated}</span></div>
            <div>Atlanan: <span className="text-amber-600 dark:text-amber-400 font-semibold">{coverJobStatus.skipped}</span> · Hatalı: <span className="text-rose-600 dark:text-rose-400 font-semibold">{coverJobStatus.errors}</span></div>
            {coverJobStatus.remaining !== null && coverJobStatus.remaining >= 0 && (
              <div>Kalan eksik kapak: <span className="font-semibold text-slate-700 dark:text-white">{coverJobStatus.remaining}</span></div>
            )}
            <div>Tamamlanan istek: {coverJobStatus.batches}</div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-3 px-2">
        <div className="lg:col-span-2">
          <label className="block text-sm uppercase text-slate-700 dark:text-slate-200 font-bold mb-2">ARAMA</label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Kitap adı, yazar veya ISBN..."
              className="flex-1 rounded-lg border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white px-5 py-3.5 text-base font-medium focus:outline-none focus:ring-4 focus:ring-sky-400 shadow-md"
            />
            <Button variant="secondary" onClick={() => loadBooks({ search: query, page: 1 })}>ARA</Button>
          </div>
        </div>
        <div>
          <label className="block text-sm uppercase text-slate-700 dark:text-slate-200 font-bold mb-2">DURUM</label>
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              loadBooks();
            }}
            className="w-full rounded-lg border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white px-4 py-3.5 text-base font-semibold focus:outline-none focus:ring-4 focus:ring-sky-400 shadow-md"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="available">Müsait Olanlar</option>
            <option value="unavailable">Ödünçte</option>
          </select>
        </div>
        <div>
          <label className="block text-sm uppercase text-slate-700 dark:text-slate-200 font-bold mb-2">KATEGORİLER (CTRL İLE SEÇ)</label>
          <select
            multiple
            value={categoryFilter}
            onChange={handleCategoryFilter}
            className="w-full h-32 rounded-lg border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white px-4 py-3 text-base font-medium focus:outline-none focus:ring-4 focus:ring-sky-400 shadow-md"
          >
            {CATEGORY_OPTIONS.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 dark:bg-black dark:border-slate-800 border-x-0 border-t-0 border-b border-slate-200 dark:border-slate-800 rounded-none shadow-sm overflow-hidden">
        <div className="px-2 py-1.5 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <div className="font-semibold text-slate-700 dark:text-white">Kitap Yönetimi</div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button variant="secondary" onClick={handleBulkQr}>SEÇİLİ KİTAPLAR İÇİN QR BAS</Button>
            {(() => {
              const selectedId = selectedRows.size === 1 ? Array.from(selectedRows)[0] : null;
              const selectedBook = selectedId ? books.find(b => b.id === selectedId) : null;
              return (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => selectedBook && navigate(`/app/books/${selectedBook.id}`)}
                    disabled={!selectedBook}
                  >
                    👁️ GÖRÜNTÜLE
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectedBook && openEdit(selectedBook)}
                    disabled={!selectedBook}
                  >
                    ✏️ DÜZENLE
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectedBook && handleDelete(selectedBook.id)}
                    disabled={!selectedBook}
                  >
                    🗑️ SİL
                  </Button>
                </>
              );
            })()}
          </div>
        </div>
        <div className="w-full">
          <table className="table-excel table-fixed">
            <thead className="bg-slate-100 dark:bg-slate-900 dark:border-b-2 dark:border-slate-700 text-sm uppercase text-slate-700 dark:text-slate-100 tracking-wide font-bold">
              <tr>
                <th className="px-2 py-3 w-12 text-center">
                  <input type="checkbox" checked={selectedRows.size === books.length && books.length > 0} onChange={toggleAll} className="w-4 h-4 cursor-pointer align-middle" />
                </th>
                <th className="px-2 py-3 text-left w-40">ISBN</th>
                <th className="px-2 py-3 text-left">KİTAP ADI</th>
                <th className="px-2 py-3 text-left w-48">YAZAR</th>
                <th className="px-2 py-3 text-left w-40">YAYINEVİ</th>
                <th className="px-2 py-3 text-left w-40">KATEGORİ</th>
                <th className="px-2 py-3 text-left w-20">RAF</th>
                <th className="px-2 py-3 text-left w-20">DOLAP</th>
                <th className="px-2 py-3 text-left w-28">MEVCUT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm dark:text-slate-200">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-1 py-1.5 text-center text-slate-500 dark:text-slate-400">Yükleniyor...</td>
                </tr>
              )}
              {!loading && books.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-1 py-1.5 text-center text-slate-400 dark:text-slate-500">Kayıt bulunamadı.</td>
                </tr>
              )}
              {!loading &&
                books.map(book => (
                  <tr
                    key={book.id}
                    className={`transition-colors row-clickable ${selectedRows.has(book.id) ? 'row-selected' : ''}`}
                    onClick={() => toggleRow(book.id)}
                    onDoubleClick={() => navigate(`/app/books/${book.id}`)}
                  >
                    <td className="text-center" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.has(book.id)} onChange={() => toggleRow(book.id)} className="w-4 h-4 cursor-pointer align-middle" />
                    </td>
                    <td className="font-mono font-bold text-slate-800 dark:text-white truncate" title={book.isbn || '—'}>{book.isbn || '—'}</td>
                    <td>
                      <div className="font-bold text-slate-900 dark:text-white truncate" title={book.title}>{book.title}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">ID: #{book.id}</div>
                    </td>
                    <td className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={book.author || '—'}>{book.author || '—'}</td>
                    <td className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={book.publisher || '—'}>{book.publisher || '—'}</td>
                    <td className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={book.category || '—'}>{book.category || '—'}</td>
                    <td className="font-bold text-slate-800 dark:text-slate-100 truncate" title={book.shelf || '—'}>{book.shelf || '—'}</td>
                    <td className="font-bold text-slate-800 dark:text-slate-100 truncate" title={book.cabinet || '—'}>{book.cabinet || '—'}</td>
                    <td>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold shadow-sm ${(book.available ?? 0) > 0 ? 'bg-emerald-500 dark:bg-emerald-600 text-white' : 'bg-amber-500 dark:bg-amber-600 text-white'
                        }`}>
                        {(book.available ?? 0)}/{book.copies ?? 0}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="px-2 py-2 bg-slate-50 border-t border-slate-200 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-slate-500">
            {total > 0
              ? `${firstItemIndex}-${lastItemIndex} / ${total} kayıt gösteriliyor`
              : 'Kayıt bulunamadı.'}
          </div>
          {total > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <Button variant="light" size="sm"
                  onClick={() => gotoPage(1)}
                  disabled={!canGoPrev}
                >
                  İlk
                </Button>
                <Button variant="light" size="sm"
                  onClick={() => gotoPage(page - 1)}
                  disabled={!canGoPrev}
                >
                  Önceki
                </Button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Sayfa {page} / {totalPages}
                </span>
                <Button variant="light" size="sm"
                  onClick={() => gotoPage(page + 1)}
                  disabled={!canGoNext}
                >
                  Sonraki
                </Button>
                <Button variant="light" size="sm"
                  onClick={() => gotoPage(totalPages)}
                  disabled={!canGoNext}
                >
                  Son
                </Button>
              </div>
              <form onSubmit={handlePageSubmit} className="flex items-center gap-2 text-xs">
                <label className="text-slate-500 dark:text-slate-400" htmlFor="pageInput">Sayfaya git:</label>
                <input
                  id="pageInput"
                  value={pageInput}
                  onChange={handlePageInputChange}
                  className="w-16 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300"
                  inputMode="numeric"
                />
                <Button type="submit" variant="secondary" size="sm">Git</Button>
              </form>
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={showForm}
        onClose={closeForm}
        size="xl"
        title={formMode === 'create' ? 'Yeni Kitap Ekle' : 'Kitabı Düzenle'}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {formMode === 'create' ? 'Kaydet' : 'Güncelle'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>İpucu:</strong> ISBN numarasını girdikten sonra &ldquo;Başlık ve Bilgileri Getir&rdquo; butonuna tıklayarak kitap bilgilerini otomatik doldurabilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                ref={isbnInputRef}
                label="ISBN"
                value={formData.isbn}
                onChange={e => setFormData(prev => ({ ...prev, isbn: e.target.value }))}
                error={formErrors.isbn}
                helperText="13 haneli ISBN numarası"
              />
            </div>
            <Button variant="secondary" onClick={() => handleFetchMeta()}>
              Başlık ve Bilgileri Getir
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Kitap Adı</label>
                <input
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                  required
                />
              </div>
              <FormField label="Yazar(lar)">
                <input
                  value={formData.author}
                  onChange={e => setFormData(prev => ({ ...prev, author: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </FormField>
              <FormField label="Yayınevi">
                <input
                  value={formData.publisher}
                  onChange={e => setFormData(prev => ({ ...prev, publisher: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </FormField>
              <FormField label="Yayın Yılı">
                <input
                  value={formData.published_year}
                  onChange={e => setFormData(prev => ({ ...prev, published_year: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </FormField>
              <FormField label="Sayfa Sayısı">
                <input
                  type="number"
                  value={formData.page_count}
                  onChange={e => setFormData(prev => ({ ...prev, page_count: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                  min="0"
                />
              </FormField>
              <FormField label="Dil">
                <input
                  value={formData.language}
                  onChange={e => setFormData(prev => ({ ...prev, language: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </FormField>
              <FormField label="Adet">
                <input
                  type="number"
                  value={formData.copies}
                  onChange={e => setFormData(prev => ({ ...prev, copies: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                  min="1"
                />
              </FormField>
              <FormField label="Raf">
                <input
                  value={formData.shelf}
                  onChange={e => setFormData(prev => ({ ...prev, shelf: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </FormField>
              <FormField label="Dolap">
                <input
                  value={formData.cabinet}
                  onChange={e => setFormData(prev => ({ ...prev, cabinet: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </FormField>
              <div className="space-y-2 lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Kategoriler (TR lise listesi)</label>
                <select
                  multiple
                  value={formData.categories}
                  onChange={e => {
                    const values = Array.from(e.target.selectedOptions).map(opt => opt.value);
                    setFormData(prev => ({ ...prev, categories: values }));
                  }}
                  className="w-full h-24 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  {CATEGORY_OPTIONS.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Birden fazla kategori seçebilirsiniz.</p>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Kapak Resmi (Manuel Yükleme)</label>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <input
                    type="file"
                    onChange={e => setCoverFile(e.target.files?.[0] ?? null)}
                    accept="image/*"
                    className="text-sm"
                  />
                  {existingCoverUrl && (
                    <a
                      className="text-sky-600 text-xs underline"
                      href={existingCoverUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mevcut kapak görüntüle
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">API kapak getiremezse buradan yükleyebilirsiniz.</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {importState.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Excel Toplu Yükleme</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {importState.status === 'uploading'
                    ? 'Dosya sunucuya yükleniyor...'
                    : importState.status === 'processing'
                      ? 'Kayıtlar işleniyor. Lütfen tarayıcıyı kapatmayın.'
                      : importState.status === 'completed'
                        ? 'İçe aktarma tamamlandı.'
                        : importState.status === 'error'
                          ? 'İçe aktarma sırasında bir hata oluştu.'
                          : 'İçe aktarma beklemede.'}
                </p>
              </div>
              <Button
                type="button"
                variant="light"
                size="sm"
                onClick={closeImportModal}
                disabled={isImportRunning}
              >
                ✖
              </Button>
            </div>

            <div className="space-y-2">
              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all ${importState.status === 'error' ? 'bg-rose-500' : 'bg-sky-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, importState.progress))}%` }}
                />
              </div>
              <div className="text-xs text-slate-500">
                {importState.progress}% tamamlandı
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs text-slate-600">
              <div>Toplam satır: <span className="font-semibold text-slate-800">{importState.total}</span></div>
              <div>İşlenen: <span className="font-semibold text-slate-800">{importState.processed}</span></div>
              <div>Yeni eklenen: <span className="font-semibold text-emerald-700">{importState.imported}</span></div>
              <div>Atlanan: <span className="font-semibold text-amber-600">{importState.skipped}</span></div>
              <div>Hatalı: <span className="font-semibold text-rose-600">{importState.errors}</span></div>
              <div>Kalan: <span className="font-semibold text-slate-800">{Math.max(importState.total - importState.processed, 0)}</span></div>
            </div>

            {importState.jobId && (
              <div className="text-[11px] text-slate-400">Görev ID: {importState.jobId}</div>
            )}

            {importState.warningCounts?.missing_isbn ? (
              <div className="text-xs text-amber-600 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                ISBN bilgisi bulunmayan {importState.warningCounts.missing_isbn} satır atlandı. Lütfen bu kayıtları inceleyin.
              </div>
            ) : null}
            {importState.warningCounts?.duplicate_isbn ? (
              <div className="text-xs text-amber-600 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                Tekrarlanan ISBN bulunan {importState.warningCounts.duplicate_isbn} satır atlandı.
              </div>
            ) : null}

            {importState.logs?.length ? (
              <div className="bg-slate-900 text-slate-100 rounded-xl p-3 max-h-48 overflow-y-auto text-xs space-y-1">
                {importState.logs.map((log, idx) => {
                  const levelClass = log.level === 'error'
                    ? 'text-rose-300'
                    : log.level === 'warning'
                      ? 'text-amber-300'
                      : log.level === 'success'
                        ? 'text-emerald-300'
                        : 'text-slate-200';
                  return (
                    <div key={`${log.ts ?? idx}-${idx}`} className={levelClass}>
                      {log.rowNumber ? `Satır ${log.rowNumber}: ` : ''}{log.message}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Günlük bekleniyor...</div>
            )}

            {importState.status === 'error' && importState.error && (
              <div className="text-xs text-rose-600 bg-rose-100 border border-rose-200 rounded-lg px-3 py-2">
                {importState.error}
              </div>
            )}

            {!isImportRunning && (
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={closeImportModal}>
                  Kapat
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500 uppercase">{label}</label>
      {children}
    </div>
  );
}
