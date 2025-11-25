import React, { useEffect, useRef, useState, useMemo } from 'react';
import api from '../api';
import { getCurrentUser } from '../utils/auth';
import { preferenceToBranchId, getBranchPreference } from '../utils/branch';

const MODES = {
  CHECKOUT: 'checkout',
  RETURN: 'return',
};

export default function Scan() {
  const [mode, setMode] = useState(MODES.CHECKOUT);
  const [bookCode, setBookCode] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState(null);
  const [message, setMessage] = useState(null);
  const [lastTransaction, setLastTransaction] = useState(null);
  const bookInputRef = useRef(null);
  const memberInputRef = useRef(null);
  const currentUser = getCurrentUser();
  const [branchPref] = useState(() => getBranchPreference());
  const [settings, setSettings] = useState({ loan_days_default: '14' });

  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings(r.data || { loan_days_default: '14' });
    }).catch(() => {});
  }, []);

  // QR/Barkod kodlarını parse et
  function parseCode(code) {
    if (!code) return null;
    const trimmed = code.trim();
    
    // QR formatları: book:123 veya member:456
    if (trimmed.startsWith('book:')) {
      return { type: 'book', id: trimmed.replace('book:', '') };
    }
    if (trimmed.startsWith('member:')) {
      return { type: 'member', id: trimmed.replace('member:', '') };
    }
    
    // ISBN formatı kontrolü (10 veya 13 haneli)
    if (/^\d{9}[\dXx]$|^\d{10}$|^\d{13}$/.test(trimmed)) {
      return { type: 'isbn', value: trimmed };
    }
    
    // Sayısal ID
    if (/^\d+$/.test(trimmed)) {
      return { type: 'numeric', value: trimmed };
    }
    
    return null;
  }


  async function handleCheckout() {
    if (!bookCode || !memberCode) {
      setMessage({ type: 'error', text: 'Kitap ve üye bilgisi gerekli.' });
      return;
    }

    setProcessing(true);
    setProcessingMode(MODES.CHECKOUT);
    setMessage(null);

    try {
      const bookParsed = parseCode(bookCode);
      const memberParsed = parseCode(memberCode);

      if (!bookParsed || !memberParsed) {
        setMessage({ type: 'error', text: 'Geçersiz kod formatı.' });
        setProcessing(false);
        setProcessingMode(null);
        return;
      }

      const payload = {};
      
      // Kitap bilgisi
      if (bookParsed.type === 'book') {
        payload.book_id = Number(bookParsed.id);
      } else if (bookParsed.type === 'isbn') {
        payload.isbn = bookParsed.value;
      } else if (bookParsed.type === 'numeric') {
        // Önce book_id olarak dene, olmazsa isbn olarak
        const testBook = await api.get(`/books/${bookParsed.value}`).catch(() => null);
        if (testBook?.data) {
          payload.book_id = Number(bookParsed.value);
        } else {
          payload.isbn = bookParsed.value;
        }
      }

      // Üye bilgisi
      if (memberParsed.type === 'member') {
        payload.member_id = Number(memberParsed.id);
      } else if (memberParsed.type === 'numeric') {
        payload.student_no = memberParsed.value;
      }

      // Şube bilgisi
      const branchId = preferenceToBranchId(branchPref, currentUser?.branch_id ?? null);
      if (branchId !== null) {
        payload.branch_id = branchId;
      }

      // Varsayılan geri teslim tarihi (14 gün)
      const days = Number(settings.loan_days_default) || 14;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      payload.due_date = dueDate.toISOString().slice(0, 10);

      const { data } = await api.post('/loans/checkout', payload);
      
      setMessage({ type: 'success', text: '✅ Ödünç verme başarılı!' });
      setLastTransaction({
        mode: 'checkout',
        book: bookCode,
        member: memberCode,
        due_date: payload.due_date,
      });
      
      // Alanları temizle ve odağı kitap alanına al
      setBookCode('');
      setMemberCode('');
      setTimeout(() => bookInputRef.current?.focus(), 100);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || 'Ödünç verme sırasında hata oluştu.';
      setMessage({ type: 'error', text: `❌ ${errorMsg}` });
    } finally {
      setProcessing(false);
      setProcessingMode(null);
    }
  }

  async function handleReturn() {
    if (!bookCode || !memberCode) {
      setMessage({ type: 'error', text: 'Kitap ve üye bilgisi gerekli.' });
      return;
    }

    setProcessing(true);
    setProcessingMode(MODES.RETURN);
    setMessage(null);

    try {
      const bookParsed = parseCode(bookCode);
      const memberParsed = parseCode(memberCode);

      if (!bookParsed || !memberParsed) {
        setMessage({ type: 'error', text: 'Geçersiz kod formatı.' });
        setProcessing(false);
        setProcessingMode(null);
        return;
      }

      const payload = {};
      
      // Kitap bilgisi (iade için isbn veya book_id)
      if (bookParsed.type === 'book') {
        // Book ID'den ISBN bulmamız gerekebilir, ama API isbn+student_no bekliyor
        // Önce kitabı çekip ISBN'ini alalım
        try {
          const { data: bookData } = await api.get(`/books/${bookParsed.id}`);
          payload.isbn = bookData.isbn || bookParsed.id;
        } catch {
          payload.isbn = bookParsed.id;
        }
      } else if (bookParsed.type === 'isbn') {
        payload.isbn = bookParsed.value;
      } else if (bookParsed.type === 'numeric') {
        // Önce book_id olarak dene
        try {
          const { data: bookData } = await api.get(`/books/${bookParsed.value}`);
          payload.isbn = bookData.isbn || bookParsed.value;
        } catch {
          payload.isbn = bookParsed.value;
        }
      }

      // Üye bilgisi (student_no gerekli)
      if (memberParsed.type === 'member') {
        // Member ID'den student_no bulmamız gerekiyor
        try {
          const { data: memberData } = await api.get(`/members/${memberParsed.id}`);
          payload.student_no = memberData.student_no || memberParsed.id;
        } catch {
          payload.student_no = memberParsed.id;
        }
      } else if (memberParsed.type === 'numeric') {
        payload.student_no = memberParsed.value;
      }

      await api.post('/loans/return', payload);
      
      setMessage({ type: 'success', text: '✅ İade işlemi başarılı!' });
      setLastTransaction({
        mode: 'return',
        book: bookCode,
        member: memberCode,
      });
      
      // Alanları temizle ve odağı kitap alanına al
      setBookCode('');
      setMemberCode('');
      setTimeout(() => bookInputRef.current?.focus(), 100);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || 'İade sırasında hata oluştu.';
      setMessage({ type: 'error', text: `❌ ${errorMsg}` });
    } finally {
      setProcessing(false);
      setProcessingMode(null);
    }
  }

  function handleKeyPress(e, field) {
    if (e.key === 'Enter') {
      if (field === 'book' && !memberCode) {
        memberInputRef.current?.focus();
      } else if (field === 'member') {
        // Enter'a basınca ödünç verme yap (varsayılan)
        handleCheckout();
      }
    }
  }

  function reset() {
    setBookCode('');
    setMemberCode('');
    setMessage(null);
    setLastTransaction(null);
    setTimeout(() => bookInputRef.current?.focus(), 100);
  }

  // Sayfa yüklendiğinde odağı kitap alanına al
  useEffect(() => {
    setTimeout(() => bookInputRef.current?.focus(), 300);
  }, []);

  const defaultDueDate = useMemo(() => {
    const days = Number(settings.loan_days_default) || 14;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('tr-TR');
  }, [settings.loan_days_default]);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-rose-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative">
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">Hızlı İşlemler</h1>
          <p className="text-slate-600">Kitap QR/Barkod ve Üye QR ile hızlı ödünç verme/iade işlemleri</p>
        </div>
      </section>

      {/* Ana İçerik */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">

        {/* Mesaj Gösterimi */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="font-semibold">{message.text}</div>
          </div>
        )}

        {/* Son İşlem */}
        {lastTransaction && (
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-xs uppercase text-slate-500 font-semibold mb-2">Son İşlem</div>
            <div className="text-sm text-slate-700">
              {lastTransaction.mode === 'checkout' ? '📘 Ödünç Verildi' : '↩️ İade Edildi'}
              {' • '}
              Kitap: <span className="font-mono">{lastTransaction.book}</span>
              {' • '}
              Üye: <span className="font-mono">{lastTransaction.member}</span>
              {lastTransaction.due_date && (
                <> • Son Teslim: <span className="font-semibold">{new Date(lastTransaction.due_date).toLocaleDateString('tr-TR')}</span></>
              )}
            </div>
          </div>
        )}

        {/* Giriş Alanları */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              1️⃣ Kitap (QR/Barkod/ISBN)
            </label>
            <input
              ref={bookInputRef}
              className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-4 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Kitap QR, Barkod veya ISBN"
              value={bookCode}
              onChange={e => setBookCode(e.target.value)}
              onKeyPress={e => handleKeyPress(e, 'book')}
              disabled={processing}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">
              Kitap QR: <code>book:123</code> • Barkod/ISBN: <code>9789750863967</code> • Kitap ID: <code>123</code>
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              2️⃣ Üye (QR/Numara)
            </label>
            <input
              ref={memberInputRef}
              className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-4 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Üye QR veya Okul Numarası"
              value={memberCode}
              onChange={e => setMemberCode(e.target.value)}
              onKeyPress={e => handleKeyPress(e, 'member')}
              disabled={processing}
            />
            <p className="text-xs text-slate-500 mt-1">
              Üye QR: <code>member:456</code> • Okul No: <code>12345</code>
            </p>
          </div>

          {/* Bilgilendirme */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">💡</div>
              <div className="flex-1">
                <div className="font-semibold text-blue-900 mb-1">Hızlı Kullanım:</div>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Kitap QR/Barkod okutun → Enter ile üye alanına geçin</li>
                  <li>• Üye QR/Numara okutun → Enter ile işlem başlar</li>
                  <li>• Veya alttaki büyük butonlara tıklayarak işlem yapabilirsiniz</li>
                  <li>• Varsayılan teslim tarihi: <strong>{defaultDueDate}</strong></li>
                </ul>
              </div>
            </div>
          </div>

          {/* İşlem Butonları - Büyük */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <button
              onClick={handleCheckout}
              disabled={processing || !bookCode || !memberCode}
              className={`py-6 rounded-2xl font-bold text-2xl transition-all transform hover:scale-105 ${
                processing || !bookCode || !memberCode
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl hover:shadow-2xl'
              }`}
            >
              {processing && processingMode === MODES.CHECKOUT ? (
                '⏳ İşleniyor...'
              ) : (
                <>
                  <div className="text-4xl mb-2">📘</div>
                  <div>Ödünç Ver</div>
                </>
              )}
            </button>
            
            <button
              onClick={handleReturn}
              disabled={processing || !bookCode || !memberCode}
              className={`py-6 rounded-2xl font-bold text-2xl transition-all transform hover:scale-105 ${
                processing || !bookCode || !memberCode
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl hover:shadow-2xl'
              }`}
            >
              {processing && processingMode === MODES.RETURN ? (
                '⏳ İşleniyor...'
              ) : (
                <>
                  <div className="text-4xl mb-2">↩️</div>
                  <div>İade Al</div>
                </>
              )}
            </button>
          </div>

          {/* Temizle Butonu */}
          {(bookCode || memberCode || message) && (
            <button
              onClick={reset}
              className="w-full py-2 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              🔄 Temizle ve Baştan Başla
            </button>
          )}
        </div>
      </section>
    </div>
  );
}