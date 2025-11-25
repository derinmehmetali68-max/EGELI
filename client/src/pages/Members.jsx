import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { getBranchPreference, preferenceToBranchId, preferenceToQuery } from '../utils/branch';
import { withAuth } from '../utils/url';
import { Modal, Input, Button, Badge, useToast, EmptyState, SkeletonTable } from '../components';
import { validateForm } from '../utils/validation';

const EMPTY_MEMBER = {
  id: null,
  name: '',
  grade: '',
  student_no: '',
  phone: '',
  email: '',
  member_type: 'Öğrenci',
  note: '',
  is_blocked: false,
};

export default function Members() {
  const navigate = useNavigate();
  const { success, error: showError, warning, info } = useToast();
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [rawMembers, setRawMembers] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberTypes, setMemberTypes] = useState(['Öğrenci']);
  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formData, setFormData] = useState(EMPTY_MEMBER);
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const importRef = useRef(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    const handler = ev => {
      setBranchPref(ev.detail ?? getBranchPreference());
    };
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchPref, typeFilter, statusFilter]);

  useEffect(() => {
    applyFilters(rawMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeFilter]);

  useEffect(() => {
    const searchHandler = ev => {
      const value = ev.detail ?? '';
      setQuery(value);
      loadMembers(value);
    };
    window.addEventListener('global-search', searchHandler);
    return () => window.removeEventListener('global-search', searchHandler);
  }, [branchPref, typeFilter, statusFilter]);

  async function loadMembers(searchOverride = query) {
    setLoading(true);
    try {
      const params = {};
      const trimmed = searchOverride?.trim();
      if (trimmed) params.q = trimmed;
      const branchParam = preferenceToQuery(branchPref);
      if (branchParam !== undefined) params.branch_id = branchParam;
      if (typeFilter && typeFilter !== 'all') params.member_type = typeFilter;
      if (statusFilter === 'blocked') params.blocked = 'true';
      else if (statusFilter === 'active') params.blocked = 'false';
      const { data } = await api.get('/members', { params });
      const items = data.items ?? [];
      setMemberTypes(data.member_types ?? ['Öğrenci']);
      setRawMembers(items);
      applyFilters(items);
      setSelectedRows(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(source) {
    const list = Array.isArray(source) ? source : rawMembers;
    let filtered = list;
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(item => (item.grade || '').toLowerCase() === gradeFilter.toLowerCase());
    }
    setMembers(filtered);
  }

  function uniqueGrades() {
    const set = new Set();
    rawMembers.forEach(m => {
      if (m.grade) set.add(m.grade.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }
  const blockedCount = useMemo(() => rawMembers.filter(m => m.is_blocked).length, [rawMembers]);

  function openCreate() {
    setFormMode('create');
    setFormData({ ...EMPTY_MEMBER });
    setShowModal(true);
  }

  function openEdit(member) {
    setFormMode('edit');
    setFormData({
      id: member.id,
      name: member.name || '',
      grade: member.grade || '',
      student_no: member.student_no || '',
      phone: member.phone || '',
      email: member.email || '',
      member_type: member.member_type || 'Öğrenci',
      note: member.note || '',
      is_blocked: Boolean(member.is_blocked),
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  async function handleSave(e) {
    e?.preventDefault();

    // Validation
    const validationSchema = {
      name: { required: true, requiredMessage: 'Ad Soyad zorunludur' },
      student_no: {
        required: false,
        minLength: 3,
        minLengthMessage: 'Öğrenci numarası en az 3 karakter olmalıdır'
      },
      email: {
        required: false,
        email: true,
        emailMessage: 'Geçerli bir e-posta adresi giriniz'
      },
      phone: {
        required: false,
        phone: true,
        phoneMessage: 'Geçerli bir telefon numarası giriniz'
      },
    };

    const validation = validateForm(formData, validationSchema);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      showError('Lütfen form hatalarını düzeltin');
      return;
    }

    setFormErrors({});

    if (!formData.name.trim()) {
      showError('Ad Soyad zorunludur');
      return;
    }
    const payload = {
      name: formData.name,
      grade: formData.grade,
      student_no: formData.student_no,
      phone: formData.phone,
      email: formData.email,
      member_type: formData.member_type,
      note: formData.note,
      is_blocked: Boolean(formData.is_blocked),
      branch_id: preferenceToBranchId(branchPref, currentUser?.branch_id ?? null),
    };
    try {
      if (formMode === 'create') {
        await api.post('/members', payload);
      } else if (formData.id) {
        await api.put(`/members/${formData.id}`, payload);
      }
      closeModal();
      loadMembers();
      success(formMode === 'create' ? 'Üye başarıyla eklendi!' : 'Üye başarıyla güncellendi!');
    } catch (err) {
      showError(err.response?.data?.error || 'Kayıt sırasında bir hata oluştu.');
    }
  }

  async function deleteMember(id) {
    try {
      await api.delete(`/members/${id}`);
      await loadMembers();
      success('Üye başarıyla silindi!');
      setDeleteConfirm(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Üye silinemedi.');
      setDeleteConfirm(null);
    }
  }

  function handleDeleteClick(member) {
    setDeleteConfirm(member);
  }

  async function syncEokul() {
    const url = window.prompt(
      'E-Okul API URL\'ini girin\\n\\n' +
      'Örnek: http://eokul.meb.gov.tr/api/students\\n' +
      'veya kendi local API\'niz: http://192.168.1.100:3000/students'
    );
    if (url === null || !url.trim()) return; // Kullanıcı iptal etti veya boş bıraktı

    const apiKey = window.prompt('E-Okul API Key (opsiyonel, boş bırakılabilir):', '');
    if (apiKey === null) return; // Kullanıcı iptal etti

    setSyncLoading(true);
    try {
      const branchId = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
      const { data } = await api.post('/members/eokul/sync', {
        url: url.trim(),
        api_key: apiKey.trim() || undefined,
        branch_id: branchId
      });
      success(`E-Okul senkronizasyonu tamamlandı! Eklenen: ${data.created}, Güncellenen: ${data.updated}, Toplam: ${data.total} işlem`);
      loadMembers();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'E-Okul senkronizasyonu başarısız.';
      showError(`E-Okul senkronizasyon hatası: ${errorMsg}`);
    } finally {
      setSyncLoading(false);
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
    if (selectedRows.size === members.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(members.map(m => m.id)));
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const branchId = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
    fd.append('branch_id', branchId ?? '');
    try {
      const { data } = await api.post('/members/import.xlsx', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(
        `Excel içe aktarma tamamlandı.\n` +
        `Eklenen: ${data?.imported ?? 0}\n` +
        `Atlanan: ${data?.skipped ?? 0}`
      );
      loadMembers();
    } catch (err) {
      showError(err.response?.data?.error || 'İçe aktarma sırasında bir hata oluştu.');
    } finally {
      e.target.value = '';
    }
  }

  const branchQuery = useMemo(() => preferenceToQuery(branchPref), [branchPref]);
  const exportXlsxUrl = useMemo(() => {
    const params = {};
    if (branchQuery !== undefined) params.branch_id = branchQuery;
    return withAuth('/members/export.xlsx', params);
  }, [branchQuery]);
  const exportPdfUrl = useMemo(() => {
    const params = {};
    if (branchQuery !== undefined) params.branch_id = branchQuery;
    return withAuth('/members/export.pdf', params);
  }, [branchQuery]);
  const allQrUrl = useMemo(() => {
    const params = {};
    if (branchQuery !== undefined) params.branch_id = branchQuery;
    return withAuth('/members/qr.pdf', params);
  }, [branchQuery]);

  function openInNewTab(url) {
    window.open(url, '_blank', 'noopener');
  }

  function handleAllQr() {
    openInNewTab(allQrUrl);
  }

  function handleSelectedQr() {
    if (!selectedRows.size) {
      showError('Lütfen en az bir üye seçiniz.');
      return;
    }
    const ids = Array.from(selectedRows).join(',');
    openInNewTab(withAuth('/members/qr.pdf', { ids }));
  }

  return (
    <div className="space-y-3 w-full">
      <section className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-white via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 shadow-sm dark:shadow-slate-900/60 p-3">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-slate-100/50 to-blue-100/50 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-950/60 pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400 dark:text-slate-200 font-semibold">CAL Kütüphane</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">Üye Yönetimi</h1>
            <p className="mt-3 text-slate-500 dark:text-slate-200 text-sm max-w-lg font-medium">
              Öğrenci ve personel kayıtlarını yönetin, gecikmeleri takip edin ve toplu QR çıktıları alın.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center lg:w-[720px]">
            <div className="rounded-xl bg-slate-900 text-white px-4 py-3 shadow-lg border border-slate-800">
              <p className="text-xs tracking-wide uppercase text-slate-300 font-semibold">Toplam Üye</p>
              <p className="text-2xl font-semibold mt-1">{members.length}</p>
            </div>
            <div className="rounded-xl bg-sky-100 text-sky-900 px-4 py-3 shadow-inner border border-sky-200 dark:bg-sky-900/60 dark:text-sky-50 dark:border-sky-800">
              <p className="text-xs tracking-wide uppercase text-sky-600 dark:text-sky-200 font-semibold">Seçili</p>
              <p className="text-2xl font-semibold mt-1">{selectedRows.size}</p>
            </div>
            <div className="rounded-xl bg-emerald-100 text-emerald-900 px-4 py-3 shadow-inner border border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-50 dark:border-emerald-800">
              <p className="text-xs tracking-wide uppercase text-emerald-600 dark:text-emerald-200 font-semibold">Üye Türü</p>
              <p className="text-2xl font-semibold mt-1">{memberTypes.length}</p>
            </div>
            <div className="rounded-xl bg-amber-100 text-amber-900 px-4 py-3 shadow-inner border border-amber-200 dark:bg-amber-900/60 dark:text-amber-50 dark:border-amber-800">
              <p className="text-xs tracking-wide uppercase text-amber-600 dark:text-amber-200 font-semibold">Askıya Alınan</p>
              <p className="text-2xl font-semibold mt-1">{blockedCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-1.5 items-center bg-gradient-to-r from-white via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/50 px-3 py-3">
        <button className="btn-primary whitespace-nowrap text-sm px-3 py-2" onClick={openCreate}>+ Yeni</button>
        <button className="btn-secondary whitespace-nowrap text-base font-bold px-5 py-3 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white shadow-lg" onClick={syncEokul} disabled={syncLoading} title="E-Okul'dan öğrenci verilerini çek ve senkronize et">
          {syncLoading ? '⏳ Çekiliyor...' : '📥 E-Okul Senkron'}
        </button>
        <button className="btn-secondary whitespace-nowrap text-sm px-3 py-2" onClick={() => importRef.current?.click()}>Excel Yükle</button>
        <a className="btn-secondary whitespace-nowrap text-sm px-3 py-2" href={exportXlsxUrl}>Excel İndir</a>
        <a className="btn-secondary whitespace-nowrap text-sm px-3 py-2" href={exportPdfUrl} target="_blank" rel="noreferrer">PDF İndir</a>
        <button className="btn-secondary whitespace-nowrap text-sm px-3 py-2" onClick={handleAllQr}>Toplu QR</button>
        <button className="btn-light whitespace-nowrap text-sm px-3 py-2" onClick={handleSelectedQr}>Seçili QR</button>
        {selectedRows.size === 1 && (() => {
          const selectedId = Array.from(selectedRows)[0];
          const selectedMember = members.find(m => m.id === selectedId);
          return selectedMember ? (
            <>
              <Button variant="primary" size="sm" onClick={() => navigate(`/app/members/${selectedMember.id}`)}>📖 GEÇMİŞ</Button>
              <Button variant="secondary" size="sm" onClick={() => openEdit(selectedMember)}>✏️ DÜZENLE</Button>
              <Button variant="secondary" size="sm" onClick={() => handleDeleteClick(selectedMember)}>🗑️ SİL</Button>
            </>
          ) : null;
        })()}
        <input type="file" accept=".xlsx" ref={importRef} onChange={handleImport} className="hidden" />
      </section>

      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/50 p-3 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs uppercase text-slate-500 dark:text-slate-200 font-semibold mb-1">Arama</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ad soyad, numara veya sınıf ara..."
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-400 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-600"
              />
              <button className="btn-secondary" onClick={() => loadMembers()}>Ara</button>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 dark:text-slate-200 font-semibold mb-1">Sınıf</label>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-600"
            >
              <option value="all">Tüm Sınıflar</option>
              {uniqueGrades().map(grade => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 dark:text-slate-200 font-semibold mb-1">Üye Türü</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-600"
            >
              <option value="all">Tüm Türler</option>
              {memberTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 dark:text-slate-200 font-semibold mb-1">Durum</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-600"
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="blocked">Askıya Alınan</option>
            </select>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-white via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 flex items-center gap-4 text-sm">
          <nav className="flex gap-4 font-semibold text-slate-500 dark:text-slate-300">
            {[
              { key: 'all', label: 'Üyeler' },
              { key: 'active', label: 'Aktif' },
              { key: 'blocked', label: 'Askıya alınanlar' },
            ].map(tab => (
              <button
                key={tab.key}
                className={`pb-1 border-b-2 transition-colors ${statusFilter === tab.key
                  ? 'text-slate-900 dark:text-white border-slate-900 dark:border-sky-400'
                  : 'border-transparent hover:text-slate-700 dark:hover:text-white/80'
                  }`}
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <span className="text-xs text-slate-400 dark:text-slate-400 ml-auto">Toplam {members.length} kayıt listeleniyor.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-excel table-fixed">
            <thead className="bg-slate-100 dark:bg-slate-900 text-xs uppercase text-slate-700 dark:text-slate-200 tracking-wide font-bold">
              <tr>
                <th className="w-12 text-center">
                  <input type="checkbox" checked={selectedRows.size === members.length && members.length > 0} onChange={toggleAll} className="w-4 h-4 cursor-pointer align-middle" />
                </th>
                <th className="text-left w-16">ID</th>
                <th className="text-left">Ad Soyad</th>
                <th className="text-left w-24">Sınıf</th>
                <th className="text-left w-32">Numara</th>
                <th className="text-left w-48">E-posta</th>
                <th className="text-left w-32">Telefon</th>
                <th className="text-left w-28">Üye Türü</th>
                <th className="text-left w-28">Durum</th>
                <th className="text-left w-40">Not</th>
              </tr>
            </thead>
            {loading ? (
              <tbody>
                <tr>
                  <td colSpan={10} className="px-4 py-8">
                    <SkeletonTable rows={5} cols={10} />
                  </td>
                </tr>
              </tbody>
            ) : members.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={10} className="px-4 py-8">
                    <EmptyState
                      icon="👥"
                      title="Üye bulunamadı"
                      description="Henüz kayıtlı üye yok. İlk üyeyi eklemek için 'Yeni' butonuna tıklayın."
                      action={
                        <Button variant="primary" onClick={openCreate}>
                          Yeni Üye Ekle
                        </Button>
                      }
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {members.map(member => (
                  <tr
                    key={member.id}
                    className={`transition-colors row-clickable ${selectedRows.has(member.id) ? 'row-selected' : ''
                      } ${member.is_blocked ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                      }`}
                    onClick={() => toggleRow(member.id)}
                  >
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.has(member.id)} onChange={() => toggleRow(member.id)} className="w-4 h-4 cursor-pointer align-middle" />
                    </td>
                    <td className="text-slate-500 dark:text-slate-300 font-mono text-xs">{member.id}</td>
                    <td>
                      <div className="font-semibold text-slate-800 dark:text-white truncate">{member.name}</div>
                    </td>
                    <td className="text-slate-600 dark:text-slate-300 truncate">{member.grade || '—'}</td>
                    <td className="text-sky-600 dark:text-sky-300 font-mono truncate">{member.student_no || '—'}</td>
                    <td className="text-slate-600 dark:text-slate-300 truncate text-xs">{member.email || '—'}</td>
                    <td className="text-slate-600 dark:text-slate-300 truncate">{member.phone || '—'}</td>
                    <td>
                      <span className="inline-block rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-100 text-[10px] font-semibold px-2 py-0.5">
                        {member.member_type || 'Öğrenci'}
                      </span>
                    </td>
                    <td>
                      <Badge
                        variant={member.is_blocked ? 'warning' : 'success'}
                        dot
                      >
                        {member.is_blocked ? 'Askıda' : 'Aktif'}
                      </Badge>
                    </td>
                    <td className="text-slate-600 dark:text-slate-300 truncate text-xs">
                      {member.note ? (
                        <div className="truncate" title={member.note}>{member.note}</div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </section>

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        size="lg"
        title={formMode === 'create' ? 'Yeni Üye Ekle' : 'Üyeyi Düzenle'}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {formMode === 'create' ? 'Kaydet' : 'Güncelle'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label="Ad Soyad"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            error={formErrors.name}
            required
          />
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Üye Türü</label>
            <select
              value={formData.member_type}
              onChange={e => setFormData(prev => ({ ...prev, member_type: e.target.value }))}
              className="input"
            >
              {memberTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <Input
            label="Sınıf"
            value={formData.grade}
            onChange={e => setFormData(prev => ({ ...prev, grade: e.target.value }))}
            placeholder="9-C, Öğretmen vb."
            helperText="Sınıf bilgisi (opsiyonel)"
          />
          <Input
            label="Okul Numarası"
            value={formData.student_no}
            onChange={e => setFormData(prev => ({ ...prev, student_no: e.target.value }))}
            error={formErrors.student_no}
            helperText="Öğrenci numarası"
          />
          <Input
            label="E-posta"
            type="email"
            value={formData.email}
            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
            error={formErrors.email}
            helperText="E-posta adresi (opsiyonel)"
          />
          <Input
            label="Telefon"
            value={formData.phone}
            onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="05xx xxx xx xx"
            error={formErrors.phone}
            helperText="Telefon numarası (opsiyonel)"
          />
          <div>
            <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition">
              <input
                type="checkbox"
                checked={Boolean(formData.is_blocked)}
                onChange={e => setFormData(prev => ({ ...prev, is_blocked: e.target.checked }))}
                className="w-5 h-5"
              />
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Üyeyi askıya al</span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Askıya alınan üyeler yeni ödünç alamaz.</p>
              </div>
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Not / Uyarı</label>
            <textarea
              value={formData.note}
              onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="input"
              placeholder="Örn: Son iade gecikti, veli ile görüşülecek."
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        size="md"
        title="Üyeyi Sil"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              İptal
            </Button>
            <Button
              variant="primary"
              onClick={() => deleteMember(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Sil
            </Button>
          </>
        }
      >
        <p className="text-slate-700 dark:text-slate-300">
          <strong>"{deleteConfirm?.name}"</strong> adlı üyeyi silmek istediğinizden emin misiniz?
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Bu işlem geri alınamaz.
        </p>
      </Modal>
    </div>
  );
}
