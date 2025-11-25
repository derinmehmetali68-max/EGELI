import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getCurrentUser } from '../utils/auth';

const EMPTY_FORM = {
  email: '',
  password: '',
  display_name: '',
  role: 'staff',
  branch_id: '',
  is_active: true,
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Yönetici' },
  { value: 'staff', label: 'Görevli' },
];

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });

export default function Users() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState('create'); // create | edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    loadInitialData();
  }, [currentUser]);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [usersRes, branchesRes] = await Promise.all([
        api.get('/users'),
        api.get('/branches'),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setBranches(branchesRes.data?.items || []);
      setError(null);
    } catch (err) {
      const message = err.response?.data?.error || 'Kullanıcı listesi alınamadı.';
      setError(message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const branchOptions = useMemo(
    () => [
      { value: '', label: '— Şube seçilmedi —' },
      ...branches.map(branch => ({ value: String(branch.id), label: branch.name })),
    ],
    [branches]
  );

  function openCreate() {
    setMode('create');
    setForm({ ...EMPTY_FORM });
    setSelectedUser(null);
    setShowModal(true);
  }

  function openEdit(user) {
    setMode('edit');
    setSelectedUser(user);
    setForm({
      email: user.email,
      password: '',
      display_name: user.display_name || '',
      role: user.role || 'staff',
      branch_id: user.branch_id ? String(user.branch_id) : '',
      is_active: !!user.is_active,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setForm({ ...EMPTY_FORM });
    setSelectedUser(null);
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.email.trim() || !form.password.trim()) {
      alert('Email ve şifre zorunludur.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        email: form.email.trim(),
        password: form.password,
        display_name: form.display_name.trim() || null,
        role: form.role,
        branch_id: form.branch_id || null,
        is_active: form.is_active,
      };
      const { data } = await api.post('/users', payload);
      setUsers(prev => [data, ...prev]);
      closeModal();
      alert('Kullanıcı başarıyla eklendi.');
    } catch (err) {
      alert(err.response?.data?.error || 'Kullanıcı eklenirken hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (!selectedUser) return;
    const updates = {
      display_name: form.display_name.trim() || null,
      role: form.role,
      branch_id: form.branch_id || null,
      is_active: form.is_active,
    };
    if (form.password.trim()) {
      updates.password = form.password.trim();
    }
    try {
      setSaving(true);
      const { data } = await api.put(`/users/${selectedUser.id}`, updates);
      setUsers(prev => prev.map(u => (u.id === data.id ? data : u)));
      closeModal();
      alert('Kullanıcı bilgileri güncellendi.');
    } catch (err) {
      alert(err.response?.data?.error || 'Kullanıcı güncellenirken hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`${user.email} kullanıcısı silinsin mi?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      alert('Kullanıcı silindi.');
    } catch (err) {
      alert(err.response?.data?.error || 'Kullanıcı silinirken hata oluştu.');
    }
  }

  async function toggleActive(user) {
    try {
      const { data } = await api.put(`/users/${user.id}`, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => (u.id === data.id ? data : u)));
    } catch (err) {
      alert(err.response?.data?.error || 'Durum güncellenemedi.');
    }
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-600">
        Bu alan yalnızca yönetici kullanıcılar için erişilebilir.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Kullanıcı Yönetimi</p>
            <h1 className="text-3xl font-semibold text-slate-900">Kullanıcılar</h1>
            <p className="text-slate-600 max-w-3xl">
              Yönetici ve görevli hesaplarını buradan oluşturabilir, düzenleyebilir veya devre dışı bırakabilirsiniz.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 transition-colors shadow"
          >
            + Yeni Kullanıcı
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Kullanıcı Listesi</h2>
          <div className="text-xs text-slate-500">
            Toplam {users.length} kayıt
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Ad Soyad</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Rol</th>
                <th className="px-4 py-3 text-left font-semibold">Şube</th>
                <th className="px-4 py-3 text-left font-semibold">Durum</th>
                <th className="px-4 py-3 text-left font-semibold">Oluşturma</th>
                <th className="px-4 py-3 text-left font-semibold">Güncelleme</th>
                <th className="px-4 py-3 text-right font-semibold">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-center text-slate-500">Yükleniyor...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-center text-rose-500">{error}</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-center text-slate-500">Henüz kullanıcı bulunmuyor.</td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">{user.display_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{user.email}</td>
                    <td className="px-4 py-3 capitalize">{user.role === 'admin' ? 'Yönetici' : 'Görevli'}</td>
                    <td className="px-4 py-3">{user.branch_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          user.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {user.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{user.created_at ? dateFormatter.format(new Date(user.created_at)) : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{user.updated_at ? dateFormatter.format(new Date(user.updated_at)) : '—'}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => toggleActive(user)}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                      >
                        {user.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                      </button>
                      <button
                        onClick={() => openEdit(user)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Düzenle
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                        >
                          Sil
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <GuideSection />

      {showModal && (
        <Modal
          title={mode === 'create' ? 'Yeni Kullanıcı' : `${selectedUser?.email} - Düzenle`}
          onClose={closeModal}
        >
          <form onSubmit={mode === 'create' ? handleCreate : handleEdit} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-semibold text-slate-600">Ad Soyad</label>
                <input
                  value={form.display_name}
                  onChange={e => updateForm('display_name', e.target.value)}
                  className="input"
                  placeholder="Opsiyonel"
                />
              </div>
              <div className="space-y-2">
                <label className="font-semibold text-slate-600">Rol</label>
                <select
                  value={form.role}
                  onChange={e => updateForm('role', e.target.value)}
                  className="input"
                >
                  {ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-semibold text-slate-600">E-posta</label>
                <input
                  value={form.email}
                  onChange={e => updateForm('email', e.target.value)}
                  className="input"
                  type="email"
                  placeholder="ornek@okul.edu.tr"
                  disabled={mode === 'edit'}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="font-semibold text-slate-600">
                  {mode === 'create' ? 'Şifre' : 'Yeni Şifre (opsiyonel)'}
                </label>
                <input
                  value={form.password}
                  onChange={e => updateForm('password', e.target.value)}
                  className="input"
                  type="password"
                  placeholder={mode === 'create' ? 'En az 6 karakter' : 'Boş bırakılırsa değişmez'}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-semibold text-slate-600">Şube</label>
                <select
                  value={form.branch_id}
                  onChange={e => updateForm('branch_id', e.target.value)}
                  className="input"
                >
                  {branchOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-3 mt-6 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => updateForm('is_active', e.target.checked)}
                />
                Hesap aktif
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeModal} className="btn-light">
                İptal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Kaydediliyor...' : mode === 'create' ? 'Kullanıcı Oluştur' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function GuideSection() {
  const MANAGEMENT_STEPS = [
    {
      title: '1. İlk Yönetici Kaydı',
      detail:
        'Sistem kurulumunda ilk kullanıcı kayıt ekranı üzerinden oluşturulur ve otomatik olarak “Yönetici” rolü atanır.',
    },
    {
      title: '2. Yeni Kullanıcı Ekleme',
      detail:
        'Bu sayfadan yeni hesap açabilir, rol ve şube atamasını yapabilirsiniz. Gerektiğinde kullanıcıları pasifleştirin.',
    },
    {
      title: '3. Yetki Güncelleme',
      detail:
        'Kullanıcı listesinde ilgili kişiyi düzenleyerek rolünü “Yönetici” veya “Görevli” olarak değiştirebilirsiniz.',
    },
    {
      title: '4. Oturum ve Güvenlik',
      detail:
        'Şüpheli girişlerde kullanıcıyı pasif duruma getirin ve yeni şifre atayın. Audit loglarıyla eylemleri izleyin.',
    },
  ];

  const SECURITY_TIPS = [
    'Her kullanıcıya benzersiz e-posta ve güçlü bir parola atayın; parolalar en az 10 karakter olsun.',
    'Görevlilere sadece ihtiyaç duydukları modüller için rol atayın, düzenli olarak kullanıcı listelerini gözden geçirin.',
    'Şifre sıfırlama bağlantıları yalnızca kurumsal e-posta adresleri üzerinden paylaşılmalıdır.',
  ];

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Kullanıcı Kaydı ve Rol Yönetimi</h3>
        <ol className="space-y-4 text-sm text-slate-600">
          {MANAGEMENT_STEPS.map(step => (
            <li key={step.title} className="flex gap-3">
              <span className="text-indigo-500 font-semibold">{step.title}</span>
              <span className="flex-1">{step.detail}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Güvenlik Önerileri</h3>
        <ul className="space-y-3 text-sm text-slate-600">
          {SECURITY_TIPS.map(tip => (
            <li key={tip} className="flex gap-2">
              <span className="text-emerald-500 mt-[2px]">✔</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button className="btn-icon text-slate-500" onClick={onClose}>✖</button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}
