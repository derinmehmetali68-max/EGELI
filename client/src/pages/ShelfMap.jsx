import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getBranchPreference, preferenceToQuery } from '../utils/branch';

const UNKNOWN_CABINET = 'Tanımsız Dolap';
const UNKNOWN_SHELF = 'Tanımsız Raf';

export default function ShelfMap() {
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyLocated, setOnlyLocated] = useState(false);

  useEffect(() => {
    const handler = ev => setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  const branchParam = useMemo(() => preferenceToQuery(branchPref), [branchPref]);

  useEffect(() => {
    loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchParam]);

  async function loadBooks() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (branchParam !== undefined) {
        params.branch_id = branchParam;
      }
      const { data } = await api.get('/books', { params });
      setBooks(data || []);
    } catch (err) {
      console.error('Dolap haritası kitap yükleme hatası:', err);
      const msg = err.response?.data?.error || err.message || 'Kitaplar yüklenemedi.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const hasLocation = book => {
    const cab = normalize(book.cabinet);
    const shelf = normalize(book.shelf);
    return Boolean(cab || shelf);
  };

  const filteredBooks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return books.filter(book => {
      if (onlyLocated && !hasLocation(book)) {
        return false;
      }
      if (!term) return true;
      const haystack = [
        book.title,
        book.author,
        book.isbn,
        book.cabinet,
        book.shelf,
        book.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [books, search, onlyLocated]);

  const layout = useMemo(() => {
    const cabinets = new Map();
    filteredBooks.forEach(book => {
      const cabinetKey = normalize(book.cabinet) || UNKNOWN_CABINET;
      const shelfKey = normalize(book.shelf) || UNKNOWN_SHELF;
      const cabinetEntry =
        cabinets.get(cabinetKey) ||
        {
          key: cabinetKey,
          name: cabinetKey,
          shelves: new Map(),
          sortKey: makeSortKey(cabinetKey),
        };
      const shelfEntry =
        cabinetEntry.shelves.get(shelfKey) ||
        {
          key: shelfKey,
          name: shelfKey,
          books: [],
          sortKey: makeSortKey(shelfKey),
        };
      shelfEntry.books.push(book);
      cabinetEntry.shelves.set(shelfKey, shelfEntry);
      cabinets.set(cabinetKey, cabinetEntry);
    });

    return Array.from(cabinets.values())
      .map(cabinet => ({
        ...cabinet,
        totalBooks: Array.from(cabinet.shelves.values()).reduce(
          (sum, shelf) => sum + shelf.books.length,
          0
        ),
        shelves: Array.from(cabinet.shelves.values()).sort(compareSortEntry),
      }))
      .sort(compareSortEntry);
  }, [filteredBooks]);

  const stats = useMemo(() => {
    const missing = books.filter(book => !hasLocation(book)).length;
    return {
      total: books.length,
      located: books.length - missing,
      missing,
      cabinets: layout.length,
    };
  }, [books, layout]);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">CAL Kütüphane</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Dolap Haritası</h1>
            <p className="mt-3 text-slate-500 text-sm max-w-2xl">
              Kütüphane dolap ve raf düzenini görsel olarak inceleyin. Hangi kitabın hangi dolap
              ve rafta bulunduğunu hızlıca tespit edin, eksik konum bilgilerini kolayca fark edin.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-center text-sm">
            <StatPill label="Toplam Kitap" value={stats.total} />
            <StatPill label="Konumu Tanımlı" value={stats.located} />
            <StatPill label="Eksik Konum" value={stats.missing} tone="danger" />
            <StatPill label="Dolap Sayısı" value={stats.cabinets} />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">
              Arama
            </label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder="Kitap, yazar, ISBN, dolap veya raf ara..."
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg">
            <input
              type="checkbox"
              checked={onlyLocated}
              onChange={e => setOnlyLocated(e.target.checked)}
              className="accent-sky-500"
            />
            Sadece konumu tanımlı kitaplar
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Not: Konumu tanımsız kitaplar otomatik olarak <span className="font-semibold">"{UNKNOWN_CABINET}"</span> ve{' '}
          <span className="font-semibold">"{UNKNOWN_SHELF}"</span> bloklarında listelenir.
        </p>
      </section>

      {error && (
        <section className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm">
          {error}
        </section>
      )}

      <section>
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500">
            Harita hazırlanıyor...
          </div>
        ) : layout.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500">
            Gösterilecek kayıt bulunamadı. Arama filtresini temizleyin veya kitaplara dolap/raf bilgisi ekleyin.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {layout.map(cabinet => (
              <CabinetCard key={cabinet.key} cabinet={cabinet} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CabinetCard({ cabinet }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-slate-400 tracking-wide">Dolap</p>
          <h2 className="text-lg font-semibold text-slate-800">{cabinet.name}</h2>
        </div>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
          {cabinet.totalBooks} kitap
        </span>
      </header>
      <div className="space-y-4">
        {cabinet.shelves.map(shelf => (
          <ShelfVisual key={shelf.key} shelf={shelf} />
        ))}
      </div>
    </div>
  );
}

function ShelfVisual({ shelf }) {
  const sortedBooks = [...shelf.books].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', 'tr-TR', { sensitivity: 'base' })
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
        <span>Raf {shelf.name}</span>
        <span>{shelf.books.length} kitap</span>
      </div>
      <div className="bg-slate-900/90 text-white rounded-xl shadow-inner overflow-hidden">
        {sortedBooks.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-white/70">Bu rafta kayıtlı kitap yok.</div>
        ) : (
          <ol className="max-h-56 overflow-y-auto divide-y divide-white/10">
            {sortedBooks.map((book, index) => (
              <li
                key={`${book.id ?? 'book'}-${book.isbn ?? index}-${book.title ?? index}`}
                className="px-4 py-2.5 text-xs sm:text-sm flex items-start gap-2"
              >
                <span className="font-semibold text-white/70 min-w-[1.5rem] text-right">{index + 1}.</span>
                <span className="font-medium text-white leading-snug">{book.title || 'İsimsiz Kitap'}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, tone }) {
  const style =
    tone === 'danger'
      ? 'bg-rose-100 text-rose-700 border border-rose-200'
      : 'bg-slate-100 text-slate-700 border border-slate-200';
  return (
    <div className={`rounded-xl px-3 py-2 shadow-sm ${style}`}>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function makeSortKey(value) {
  const normalized = normalize(value);
  if (!normalized) return { numeric: Number.POSITIVE_INFINITY, text: '' };
  const match = normalized.match(/\d+/);
  return {
    numeric: match ? Number(match[0]) : Number.POSITIVE_INFINITY,
    text: normalized.toLocaleLowerCase('tr-TR'),
  };
}

function compareSortEntry(a, b) {
  const keyA = a.sortKey || makeSortKey(a.name || a);
  const keyB = b.sortKey || makeSortKey(b.name || b);
  if (keyA.numeric !== keyB.numeric) {
    return keyA.numeric - keyB.numeric;
  }
  return keyA.text.localeCompare(keyB.text, 'tr-TR');
}
