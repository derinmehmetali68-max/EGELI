import db from '../db.js';
import fs from 'fs';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { buildBranchFilter, resolveBranchForWrite, canAccessBranch, isAdmin } from '../utils/branch.js';
import { generateGeminiContent, sanitizeModelName } from '../services/geminiClient.js';

const TURKISH_REPLACEMENTS = {
  'Ã‡': 'Ç',
  'Ã§': 'ç',
  'Ã–': 'Ö',
  'Ã¶': 'ö',
  'Ãœ': 'Ü',
  'Ã¼': 'ü',
  'Ä°': 'İ',
  'Ä±': 'ı',
  'Åž': 'Ş',
  'ÅŸ': 'ş',
  'Äž': 'Ğ',
  'ÄŸ': 'ğ',
};

const importJobs = new Map();
const IMPORT_JOB_TTL_MS = 10 * 60 * 1000;
const MAX_IMPORT_LOGS = 200;

// Türkçe karakter normalizasyonu - temel fonksiyon
function turkishCharacterFix(text) {
  if (text === undefined || text === null) return null;
  let str = String(text);

  Object.entries(TURKISH_REPLACEMENTS).forEach(([source, target]) => {
    str = str.split(source).join(target);
  });

  return str;
}

const CATEGORY_TRANSLATIONS = {
  'russian literature': 'Rus Edebiyatı',
  'english literature': 'İngiliz Edebiyatı',
  'american literature': 'Amerikan Edebiyatı',
  'french literature': 'Fransız Edebiyatı',
  'german literature': 'Alman Edebiyatı',
  'murder': 'Polisiye',
  'crime': 'Polisiye',
  'detective': 'Polisiye',
  'thriller': 'Gerilim',
  'science fiction': 'Bilim Kurgu',
  'sci-fi': 'Bilim Kurgu',
  'fantasy': 'Fantastik',
  'history': 'Tarih',
  'biography': 'Biyografi',
  'autobiography': 'Otobiyografi',
  'psychology': 'Psikoloji',
  'philosophy': 'Felsefe',
  'religion': 'Din',
  'spirituality': 'Ruhsal Gelişim',
  'education': 'Eğitim',
  'children': 'Çocuk',
  'children literature': 'Çocuk Edebiyatı',
  'young adult': 'Gençlik',
  'poetry': 'Şiir',
  'novel': 'Roman',
  'literature': 'Edebiyat',
  'classics': 'Klasikler',
  'classic': 'Klasik',
  'essay': 'Deneme',
  'short stories': 'Öykü',
  'story': 'Öykü',
  'drama': 'Tiyatro',
  'art': 'Sanat',
  'self help': 'Kişisel Gelişim',
  'self-help': 'Kişisel Gelişim',
  'personal development': 'Kişisel Gelişim',
  'health': 'Sağlık',
  'science': 'Bilim',
  'economy': 'Ekonomi',
  'business': 'İş Dünyası',
  'management': 'Yönetim',
  'politics': 'Siyaset',
  'travel': 'Seyahat',
  'memoir': 'Anı',
  'adventure': 'Macera',
  'mythology': 'Mitoloji',
  'folklore': 'Halk Bilimi',
  'cookbook': 'Yemek',
  'gastronomy': 'Gastronomi',
  'sports': 'Spor',
  'technology': 'Teknoloji',
  'computers': 'Bilgisayar',
  'law': 'Hukuk',
  'architecture': 'Mimarlık',
  'design': 'Tasarım',
};

const TITLE_TRANSLATIONS = {
  'war and peace': 'Savaş ve Barış',
  'anna karenina': 'Anna Karenina',
  'resurrection': 'Diriliş',
  'childhood': 'Çocukluk',
  'boyhood': 'İlkgençlik',
  'youth': 'Gençlik',
  'the death of ivan ilyich': 'İvan İlyiçin Ölümü',
  'master and man': 'Efendi ile Uşağı',
  'what is art?': 'Sanat Nedir?',
  'what men live by': 'İnsan Ne İle Yaşar?',
  'the kreutzer sonata': 'Kreutzer Sonatı',
  'notes from underground': 'Yeraltından Notlar',
  'notes from the underground': 'Yeraltından Notlar',
  'underground notes': 'Yeraltından Notlar',
  'zapiski iz podpolya': 'Yeraltından Notlar',
  'crime and punishment': 'Suç ve Ceza',
  'the idiot': 'Budala',
  'the brothers karamazov': 'Karamazov Kardeşler',
  'demons': 'Ecinniler',
  'the possessed': 'Ecinniler',
  'white nights': 'Beyaz Geceler',
  'poor folk': 'Ezilenler',
  'dead souls': 'Ölü Canlar',
  'fathers and sons': 'Babalar ve Oğullar',
  'of mice and men': 'Fareler ve İnsanlar',
  'the old man and the sea': 'İhtiyar Adam ve Deniz',
  'the metamorphosis': 'Dönüşüm',
  'the stranger': 'Yabancı',
  'the plague': 'Veba',
  'the little prince': 'Küçük Prens',
  'les miserables': 'Sefiller',
  'the hunchback of notre dame': 'Notre Dame’ın Kamburu',
  'the count of monte cristo': 'Monte Cristo Kontu',
  'twenty thousand leagues under the seas': 'Denizler Altında Yirmi Bin Fersah',
  'journey to the center of the earth': 'Dünyanın Merkezine Yolculuk',
  'the call of the wild': 'Vahşetin Çağrısı',
  'white fang': 'Beyaz Diş',
  'animal farm': 'Hayvan Çiftliği',
  '1984': '1984',
  'brave new world': 'Cesur Yeni Dünya',
  'to kill a mockingbird': 'Bülbülü Öldürmek',
  'lord of the flies': 'Sineklerin Tanrısı',
  'the catcher in the rye': 'Çavdar Tarlasında Çocuklar',
  'the alchemist': 'Simyacı',
  'one hundred years of solitude': 'Yüzyıllık Yalnızlık',
  'love in the time of cholera': 'Kolera Günlerinde Aşk',
  'roof beam carpenters': 'Çatıdaki Dünyalar',
};

function normalizeCategoryLabel(value) {
  if (!value) return null;
  let str = turkishCharacterFix(String(value).trim());
  if (!str) return null;
  str = str.replace(/\s+/g, ' ');
  if (/^[\-–—]+$/.test(str)) return null;
  const key = str.toLowerCase();
  const translated = CATEGORY_TRANSLATIONS[key];
  if (translated) return translated;
  return str
    .split(' ')
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

function normalizeCategories(input, fallback) {
  if (Array.isArray(input)) {
    const mapped = input.map(value => normalizeCategoryLabel(value)).filter(Boolean);
    const unique = [...new Set(mapped)];
    return unique.length ? unique.join(', ') : null;
  }
  if (typeof input === 'string' && input.trim().length) {
    return normalizeCategories(input.split(','), null);
  }
  if (typeof fallback === 'string' && fallback.trim().length) {
    return normalizeCategories(fallback.split(','), null);
  }
  return null;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const XLSX_KEY_CHAR_MAP = {
  İ: 'i',
  I: 'i',
  ı: 'i',
  Ş: 's',
  ş: 's',
  Ğ: 'g',
  ğ: 'g',
  Ç: 'c',
  ç: 'c',
  Ö: 'o',
  ö: 'o',
  Ü: 'u',
  ü: 'u',
};

function normalizeXlsxKey(key) {
  if (key === undefined || key === null) return '';
  let str = String(key).trim();
  if (!str) return '';
  str = str
    .split('')
    .map(ch => XLSX_KEY_CHAR_MAP[ch] ?? ch)
    .join('');
  str = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  str = str.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  str = str.replace(/^_+|_+$/g, '');
  return str;
}

function normalizeXlsxRow(row) {
  if (!row || typeof row !== 'object') return {};
  const normalized = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeXlsxKey(rawKey);
    if (!key) continue;
    if (!(key in normalized) || normalized[key] === undefined || normalized[key] === null || normalized[key] === '') {
      normalized[key] = value;
    }
  }

  const pick = (...aliases) => {
    for (const alias of aliases) {
      const key = normalizeXlsxKey(alias);
      if (!key) continue;
      if (!(key in normalized)) continue;
      const value = normalized[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length) return trimmed;
      } else if (value !== undefined && value !== null) {
        return value;
      }
    }
    return null;
  };

  return {
    isbn: pick('isbn', 'isbn13', 'isbn_13'),
    title: pick('title', 'kitap_adi', 'kitap_adı', 'adi', 'ad', 'book_title'),
    author: pick('author', 'yazar', 'yazar_adi', 'yazar_adı', 'writer'),
    category: pick('category', 'categories', 'kategori', 'kategoriler', 'kategori_adi', 'kategori_adı'),
    copies: pick('copies', 'adet', 'quantity'),
    available: pick('available', 'mevcut'),
    cover_path: pick('cover_path', 'kapak', 'kapak_yolu', 'kapak_url'),
    publisher: pick('publisher', 'yayinevi', 'yayınevi'),
    published_year: pick('published_year', 'yayin_yili', 'yayın_yılı', 'yil', 'yıl', 'year'),
    page_count: pick('page_count', 'sayfa_sayisi', 'sayfa_sayısı', 'pages'),
    language: pick('language', 'dil'),
    shelf: pick('shelf', 'raf'),
    cabinet: pick('cabinet', 'dolap'),
  };
}

function sanitizeText(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function sanitizeUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return null;
  return text;
}

function normalizeSourceList(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map(item => {
      if (!item) return null;
      if (typeof item === 'string') {
        const url = sanitizeUrl(item);
        if (url) return { title: null, url };
        return null;
      }
      if (typeof item === 'object') {
        const url = sanitizeUrl(item.url || item.href || item.link);
        if (!url) return null;
        const title = sanitizeText(item.title || item.name || item.label) || null;
        return { title, url };
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeGeminiBookPayload(payload, fallbackIsbn) {
  const isbn = sanitizeIsbn(payload?.isbn ?? fallbackIsbn);
  const title = sanitizeText(payload?.title);
  const author = normalizeAuthor(sanitizeText(payload?.author));
  const publisher = normalizePublisher(sanitizeText(payload?.publisher));
  const publishedYear = sanitizeText(payload?.published_year ?? payload?.year ?? payload?.publication_year);
  const pageCountRaw = payload?.page_count ?? payload?.pages ?? null;
  const pageCount = pageCountRaw != null ? normalizeNumber(pageCountRaw) : null;
  const language = sanitizeText(payload?.language ?? payload?.lang ?? null);
  const categoriesRaw = payload?.categories ?? payload?.category ?? [];
  const categories = normalizeCategories(categoriesRaw, null);
  const description = sanitizeText(payload?.description ?? payload?.summary ?? null);
  const coverUrl = sanitizeUrl(payload?.cover_image_url ?? payload?.cover_url ?? payload?.image_url);
  const sources = normalizeSourceList(payload?.sources ?? payload?.references ?? payload?.links);
  const previewUrl = sanitizeUrl(payload?.preview_url ?? payload?.primary_source_url ?? null);

  return {
    isbn,
    title,
    author,
    publisher,
    published_year: publishedYear,
    page_count: pageCount,
    language,
    categories,
    description,
    cover_image_url: coverUrl,
    preview_url: previewUrl,
    sources,
  };
}

function resolveGeminiConfig() {
  const storedKeyRow = db.prepare('SELECT value FROM settings WHERE key=?').get('gemini_api_key');
  const modelRow = db.prepare('SELECT value FROM settings WHERE key=?').get('gemini_model');
  const apiKey = storedKeyRow?.value || process.env.GEMINI_API_KEY;
  const model = sanitizeModelName(modelRow?.value);
  if (!apiKey) {
    const err = new Error('Gemini API anahtarı bulunamadı. Ayarlar > AI sekmesinden ekleyin.');
    err.code = 'GEMINI_KEY_MISSING';
    throw err;
  }
  return { apiKey, model };
}

async function performGeminiResearch({ isbn, downloadCover = true, config }) {
  const safeIsbn = sanitizeIsbn(isbn);
  if (!safeIsbn) {
    const err = new Error('Geçerli bir ISBN giriniz.');
    err.code = 'INVALID_ISBN';
    throw err;
  }

  const effectiveConfig = config || resolveGeminiConfig();

  const systemInstruction = {
    role: 'system',
    parts: [
      {
        text: `You are a meticulous research assistant helping a Turkish school librarian. 
Kullanıcı bir ISBN verir. Google arama aracını kullanarak resmi kaynaklardan kitabı bul ve tüm bilgileri doğrula. 
Sadece teyit ettiğin bilgileri ver. Yanlış veya emin olmadığın alanları null bırak.
Sonuçları JSON olarak döndür. Strings UTF-8 olmalı ve Türkçe karakterleri koru.`,
      },
    ],
  };

  const userPrompt = {
    role: 'user',
    parts: [
      {
        text: `ISBN: ${safeIsbn}

Görev:
- ISBN'e ait kitabı bulmak için web'de araştırma yap.
- Kitap adı, yazar, yayınevi, yayın yılı, sayfa sayısı, dil, kategori/etiketler ve özet bilgisi ver.
- Mümkünse doğrudan kapak resmine giden HTTPS URL'si (cover_image_url) sağla.
- Varsa çevrimiçi önizleme veya resmi sayfa için preview_url ver.
- En az bir kaynak URL'si (sources) ekle. Kaynaklar { "title": string|null, "url": string } formatında olmalı.

Yanıt formatı:
{
  "isbn": "<isbn>",
  "title": string|null,
  "author": string|null,
  "publisher": string|null,
  "published_year": string|null,
  "page_count": number|null,
  "language": string|null,
  "categories": string|string[]|null,
  "description": string|null,
  "cover_image_url": string|null,
  "preview_url": string|null,
  "sources": [{ "title": string|null, "url": string }]
}

Sadece JSON döndür.`,
      },
    ],
  };

  let responseText;
  try {
    responseText = await generateGeminiContent({
      contents: [userPrompt],
      systemInstruction,
      apiKey: effectiveConfig.apiKey,
      model: effectiveConfig.model,
      tools: [{ google_search_retrieval: { disable_attribution: false } }],
      responseMimeType: 'application/json',
    });
  } catch (err) {
    throw err;
  }

  let parsed;
  try {
    parsed = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
  } catch (err) {
    const parseError = new Error('Gemini yanıtı ayrıştırılamadı.');
    parseError.cause = err;
    parseError.raw = responseText;
    throw parseError;
  }

  const normalized = normalizeGeminiBookPayload(parsed, safeIsbn);
  let coverPath = null;
  let downloadedCover = false;

  if (downloadCover && normalized.cover_image_url) {
    try {
      const downloaded = await downloadCoverFromUrl(normalized.cover_image_url, normalized.isbn || safeIsbn);
      if (downloaded) {
        coverPath = downloaded;
        downloadedCover = true;
      }
    } catch (err) {
      console.warn('Gemini kapak indirilemedi:', err.message);
    }
  }

  return {
    normalized,
    coverPath,
    downloadedCover,
  };
}

function resolveCoverUrlForExport(coverPath, req) {
  if (!coverPath) return '';
  const trimmed = String(coverPath).trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    return new URL(normalized, origin).toString();
  } catch {
    return normalized;
  }
}

function normalizeImportedCoverValue(value, req) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    if (req) {
      try {
        const url = new URL(trimmed);
        const host = req.get('host');
        if (host && url.host === host) {
          return url.pathname || trimmed;
        }
      } catch {}
    }
    return trimmed;
  }
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return trimmed;
}

async function resolveImportedCoverAsset(value, isbn) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    const safeIsbn = sanitizeIsbn(isbn) || `external_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const downloaded = await downloadCoverFromUrl(value, safeIsbn);
      if (downloaded) return downloaded;
    } catch (err) {
      console.warn('Kapak URL indirme başarısız', value, err.message);
    }
    return null;
  }
  return value;
}

async function resolveCoverForIsbn(isbn) {
  const safeIsbn = sanitizeIsbn(isbn);
  if (!safeIsbn) return null;
  const [googleData, openLibraryData] = await Promise.allSettled([
    fetchFromGoogleBooks(safeIsbn),
    fetchFromOpenLibrary(safeIsbn),
  ]);
  const google = googleData.status === 'fulfilled' ? googleData.value : null;
  const openLib = openLibraryData.status === 'fulfilled' ? openLibraryData.value : null;
  if (!google && !openLib) return null;
  const meta = google && openLib ? mergeBookData(google, openLib) : google || openLib;
  if (!meta?.cover_path) return null;
  let finalCover = meta.cover_path;
  if (typeof finalCover === 'string' && finalCover.startsWith('http')) {
    const downloaded = await downloadCoverFromUrl(finalCover, safeIsbn);
    if (downloaded) {
      finalCover = downloaded;
    }
  }
  return {
    cover_path: finalCover,
    source: google && openLib ? 'google+openlibrary' : google ? 'google' : 'openlibrary',
  };
}

// Yayınevi normalizasyonu - bilinen varyasyonları birleştir ve en uzun olanı seç
function normalizePublisher(publisher) {
  if (!publisher) return null;
  let str = String(publisher).trim();
  
  // Virgülle ayrılmış birden fazla yayınevi varsa bunları ayrı ayrı ele al
  const parts = str.split(',').map(part => part.trim()).filter(Boolean);
  
  const normalizedParts = parts.map(part => {
    // Bilinen yayınevi varyasyonlarını tek bir forma getir
    if (/can\s*yayınları/i.test(part) || /can\s*yaynlar/i.test(part) || /can\s*yay/i.test(part)) {
      return 'Can Yayınları';
    }
    // Diğer yayınevleri için sadece trim yap
    return part;
  });
  
  // Tekrarlayanları kaldır
  const distinctNormalizedParts = [...new Set(normalizedParts)];
  
  if (distinctNormalizedParts.length === 0) {
    return null;
  } else if (distinctNormalizedParts.length === 1) {
    return distinctNormalizedParts[0];
  } else {
    // Birden fazla farklı yayınevi varsa, en uzun olanı seç
    return distinctNormalizedParts.reduce((a, b) => (a.length > b.length ? a : b));
  }
}

function normalizeTitle(title) {
  if (!title) return null;
  let str = String(title).trim();
  
  // Türkçe karakter düzeltmeleri
  str = turkishCharacterFix(str);

  const translated = TITLE_TRANSLATIONS[str.toLowerCase()];
  if (translated) return translated;
  
  // İlk harfi büyük, diğerlerini küçük yap (Türkçe kurallarına göre)
  // Çoklu kelimelerde her kelimenin ilk harfi büyük olmalı
  str = str.split(/\s+/).map(word => {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  
  return str;
}

function normalizeAuthor(author) {
  if (!author) return null;

  const rawParts = String(author)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (!rawParts.length) return null;

  const normalizedCandidates = rawParts.map(name => {
    let str = turkishCharacterFix(name);
    str = str.replace(/\s+/g, ' ').trim();
    if (!str) return null;
    return str
      .split(' ')
      .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
      .join(' ');
  }).filter(Boolean);

  if (!normalizedCandidates.length) return null;

  const unique = [];
  const seen = new Set();
  normalizedCandidates.forEach(candidate => {
    const key = candidate
      .toLowerCase()
      .replace(/[^a-z0-9ığüşöçâêîôûİĞÜŞÖÇ]/gi, '');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  });

  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  // Birden fazla aday varsa, en açıklayıcı olanı (en uzun) tercih et.
  return unique.reduce((best, current) => {
    if (!best) return current;
    if (current.length > best.length) return current;
    if (current.length === best.length) {
      return current.localeCompare(best, 'tr', { sensitivity: 'base' }) < 0 ? current : best;
    }
    return best;
  }, null);
}

function extractJsonPayload(text) {
  if (!text) {
    throw new Error('Gemini yanıtı boş geldi.');
  }
  const codeBlock = text.match(/```json([\s\S]*?)```/i);
  const raw = codeBlock ? codeBlock[1] : text;
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  if (jsonStart === -1 && arrayStart === -1) {
    throw new Error('Gemini yanıtında JSON bulunamadı.');
  }
  const startIndex = jsonStart !== -1 ? jsonStart : arrayStart;
  const jsonString = trimmed.slice(startIndex);
  return JSON.parse(jsonString);
}
export function listBooks(req, res) {
  const q = req.query.q || '';
  const searchParams = [`%${q}%`, `%${q}%`, `%${q}%`];
  const { clause, params: branchParams } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
  });

  const filters = ['(title LIKE ? OR author LIKE ? OR isbn LIKE ?)'];
  const params = [...searchParams];

  const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : null;
  if (status === 'available') {
    filters.push('(available > 0)');
  } else if (status === 'unavailable') {
    filters.push('(available <= 0)');
  }

  const rawCategories = req.query.categories;
  const categoryValues = Array.isArray(rawCategories)
    ? rawCategories
    : typeof rawCategories === 'string'
    ? rawCategories.split(',')
    : [];
  const normalizedCategories = categoryValues
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  if (normalizedCategories.length) {
    const categoryClauses = normalizedCategories.map(() => `LOWER(',' || COALESCE(category, '') || ',') LIKE ?`);
    filters.push(`(${categoryClauses.join(' OR ')})`);
    normalizedCategories.forEach(cat => {
      params.push(`%,${cat},%`);
    });
  }

  const baseWhere = `WHERE ${filters.join(' AND ')}${clause}`;
  const isPaginated = req.query.page !== undefined || req.query.page_size !== undefined;

  if (!isPaginated) {
    const sql = `SELECT * FROM books ${baseWhere} ORDER BY created_at DESC`;
    const rows = db.prepare(sql).all(...params, ...branchParams);
    return res.json(rows);
  }

  const pageRaw = Number(req.query.page);
  const pageSizeRaw = Number(req.query.page_size);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSizeCandidate = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 100;
  const pageSize = Math.min(Math.max(pageSizeCandidate, 1), 100);
  const offset = (page - 1) * pageSize;

  try {
    const countSql = `SELECT COUNT(*) AS total FROM books ${baseWhere}`;
    const totalRow = db.prepare(countSql).get(...params, ...branchParams);
    const total = Number(totalRow?.total ?? 0);

    const pagedSql = `SELECT * FROM books ${baseWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const items = db
      .prepare(pagedSql)
      .all(...params, ...branchParams, pageSize, offset);

    res.json({
      items: items || [],
      total,
      page,
      page_size: pageSize,
    });
  } catch (error) {
    console.error('listBooks error:', error);
    res.status(500).json({ error: 'Veritabanı hatası', detail: error.message });
  }
}

export function getBook(req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, row.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  res.json(row);
}
export function createBook(req, res) {
  const {
    isbn,
    title,
    author,
    category,
    categories,
    copies = 1,
    cover_path = null,
    publisher,
    published_year,
    page_count,
    language,
    shelf,
    cabinet,
  } = req.body;
  if (!title) return res.status(422).json({ error: 'Başlık zorunlu' });
  const branchId = resolveBranchForWrite(req.user, req.body.branch_id);
  const numericCopies = Number(copies) > 0 ? Number(copies) : 1;
  const finalCategories = normalizeCategories(categories, category);
  const numericPageCount = normalizeNumber(page_count);
  const finalLanguage = sanitizeText(language) || 'Türkçe';
  const info = db
    .prepare(
      `INSERT INTO books(
        isbn,title,author,category,copies,available,branch_id,cover_path,
        publisher,published_year,page_count,language,shelf,cabinet
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      sanitizeText(isbn),
      normalizeTitle(title),
      normalizeAuthor(sanitizeText(author)),
      finalCategories,
      numericCopies,
      numericCopies,
      branchId,
      cover_path || null,
      normalizePublisher(sanitizeText(publisher)),
      sanitizeText(published_year),
      numericPageCount,
      finalLanguage,
      sanitizeText(shelf),
      sanitizeText(cabinet)
    );
  res.json({ id: info.lastInsertRowid });
}
export function updateBook(req, res) {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, existing.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  const {
    isbn,
    title,
    author,
    category,
    categories,
    copies,
    available,
    cover_path,
    publisher,
    published_year,
    page_count,
    language,
    shelf,
    cabinet,
  } = req.body;
  const numericCopies =
    copies !== undefined && copies !== null && copies !== ''
      ? Number(copies) || existing.copies
      : existing.copies;
  const numericAvailable =
    available !== undefined && available !== null && available !== ''
      ? Number(available) || existing.available
      : existing.available;
  let targetBranch = existing.branch_id;
  if (isAdmin(req.user)) {
    targetBranch = resolveBranchForWrite(req.user, req.body.branch_id ?? existing.branch_id);
  }
  const finalCategories = normalizeCategories(categories, category ?? existing.category);
  const numericPageCount =
    page_count !== undefined ? normalizeNumber(page_count) : existing.page_count;
  const finalLanguage =
    language !== undefined ? (sanitizeText(language) || 'Türkçe') : existing.language;
  const hasIsbn = Object.prototype.hasOwnProperty.call(req.body, 'isbn');
  const hasAuthor = Object.prototype.hasOwnProperty.call(req.body, 'author');
  const hasPublisher = Object.prototype.hasOwnProperty.call(req.body, 'publisher');
  const hasPublishedYear = Object.prototype.hasOwnProperty.call(req.body, 'published_year');
  const hasShelf = Object.prototype.hasOwnProperty.call(req.body, 'shelf');
  const hasCabinet = Object.prototype.hasOwnProperty.call(req.body, 'cabinet');
  const hasCover = Object.prototype.hasOwnProperty.call(req.body, 'cover_path');
  db.prepare(
    `UPDATE books SET
      isbn=?, title=?, author=?, category=?, copies=?, available=?, branch_id=?, cover_path=?,
      publisher=?, published_year=?, page_count=?, language=?, shelf=?, cabinet=?
     WHERE id=?`
  ).run(
    hasIsbn ? sanitizeText(isbn) : existing.isbn,
    title ? normalizeTitle(title) : existing.title,
    hasAuthor ? normalizeAuthor(sanitizeText(author)) : existing.author,
    finalCategories,
    numericCopies,
    numericAvailable,
    targetBranch ?? null,
    hasCover ? (cover_path || null) : existing.cover_path,
    hasPublisher ? normalizePublisher(sanitizeText(publisher)) : existing.publisher,
    hasPublishedYear ? sanitizeText(published_year) : existing.published_year,
    numericPageCount,
    finalLanguage,
    hasShelf ? sanitizeText(shelf) : existing.shelf,
    hasCabinet ? sanitizeText(cabinet) : existing.cabinet,
    id
  );
  res.json({ ok: true });
}
export function deleteBook(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Geçersiz kayıt kimliği' });
  }
  const existing = db.prepare('SELECT branch_id FROM books WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, existing.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM loans WHERE book_id=?').run(id);
    db.prepare('DELETE FROM reservations WHERE book_id=?').run(id);
    try {
      db.prepare('DELETE FROM kiosk_logs WHERE book_id=?').run(id);
    } catch (err) {
      if (err?.code !== 'SQLITE_ERROR') throw err;
    }
    db.prepare('DELETE FROM books WHERE id=?').run(id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    if (err?.code === 'SQLITE_CONSTRAINT' || err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(409).json({
        error: 'Kitap silinemedi. Önce bu kitapla ilişkili ödünç, rezervasyon veya diğer kayıtları temizleyin.',
        detail: err.message,
      });
    }
    console.error('deleteBook error', err);
    res.status(500).json({ error: 'Kitap silinemedi.', detail: err.message });
  }
}

const AI_CURSOR_KEY = 'ai_normalize_cursor';

function readSettingValue(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row?.value ?? defaultValue;
}

function writeSettingValue(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(
    key,
    value
  );
}

export async function aiNormalizeBooks(_req, res) {
  const LIMIT = 200;

  const totalRow = db.prepare('SELECT COUNT(*) AS total FROM books').get();
  const totalBooks = Number(totalRow?.total ?? 0);

  let cursorValue = readSettingValue(AI_CURSOR_KEY, '0');
  let cursor = Number(cursorValue);
  if (!Number.isFinite(cursor) || cursor < 0) {
    cursor = 0;
  }
  const initialCursor = cursor;

  const fetchBatch = currentCursor =>
    db
      .prepare(
        'SELECT id, isbn, title, author, publisher, category, cover_path FROM books WHERE id > ? ORDER BY id ASC LIMIT ?'
      )
      .all(currentCursor, LIMIT);

  let books = fetchBatch(cursor);
  let wrapped = false;

  if (!books.length) {
    cursor = 0;
    books = fetchBatch(cursor);
    wrapped = true;
  }

  if (!books.length) {
    return res.json({ applied: 0, message: 'Veri tabanında kitap bulunamadı.' });
  }

  const storedKeyRow = db.prepare('SELECT value FROM settings WHERE key=?').get('gemini_api_key');
  const modelRow = db.prepare('SELECT value FROM settings WHERE key=?').get('gemini_model');
  const apiKey = storedKeyRow?.value || process.env.GEMINI_API_KEY;
  const model = sanitizeModelName(modelRow?.value);
  if (!apiKey) {
    return res.status(400).json({ error: 'AI anahtarı bulunamadı. Ayarlar > AI sekmesinden ekleyin.' });
  }

  const instruction = {
    role: 'system',
    parts: [
      {
        text: `You are an assistant that cleans and normalises Turkish library records.
- Always respond with valid JSON in the exact schema you are given.
- Correct typos and capitalisation for authors and publishers.
- If the title appears in a different language, provide the Turkish edition title when it exists.
- Categories must be Turkish literary genres (e.g., "Rus Edebiyatı", "Roman", "Polisiye").
- Ensure ISBN values are unchanged unless obviously invalid.
- Return transliterations in UTF-8.
- If information is missing, keep original value.
- Provide a short summary of the corrections.
Leave fields you cannot improve as null.
        `,
      },
    ],
  };

  const userPrompt = {
    role: 'user',
    parts: [
      {
        text: `Girdi verileri JSON formatında listelenmiştir. Çıkış aşağıdaki şemayı takip eden bir JSON olmalıdır:
{
  "books": [
    {
      "id": <number>,
      "title": <string|null>,
      "author": <string|null>,
      "publisher": <string|null>,
      "category": <string|null>
    }
  ],
  "summary": {
    "updated_count": <number>,
    "notes": <string>
  }
}

Kitap listesi:
${JSON.stringify(books, null, 2)}
`,
      },
    ],
  };

  try {
    const responseText = await generateGeminiContent({ contents: [userPrompt], systemInstruction: instruction, apiKey, model });
    let payload;
    try {
      payload = extractJsonPayload(responseText);
    } catch (parseErr) {
      console.error('Gemini yanıtı ayrıştırılamadı:', responseText);
      throw parseErr;
    }
    const corrections = Array.isArray(payload?.books) ? payload.books : [];

    if (!corrections.length) {
      return res.status(502).json({ error: 'AI yanıtı işlenemedi.', detail: 'Yanıtta kitap düzeltmesi bulunamadı.' });
    }

    const updateStmt = db.prepare(
      'UPDATE books SET title = COALESCE(?, title), author = COALESCE(?, author), publisher = COALESCE(?, publisher), category = COALESCE(?, category) WHERE id = ?'
    );

    db.exec('BEGIN IMMEDIATE');
    const appliedChanges = [];
    const coverFetchQueue = [];

    corrections.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const id = Number(item.id);
      if (!Number.isFinite(id)) return;

      const original = books.find(b => b.id === id);
      if (!original) return;

      const updated = {
        id,
        title: item.title ? normalizeTitle(item.title) : null,
        author: item.author ? normalizeAuthor(item.author) : null,
        publisher: item.publisher ? normalizePublisher(item.publisher) : null,
        category: item.category ? normalizeCategories(item.category) : null,
        cover_path: original.cover_path || null,
      };

      updateStmt.run(updated.title, updated.author, updated.publisher, updated.category, id);

      if ((!original.cover_path || !original.cover_path.trim()) && original.isbn) {
        coverFetchQueue.push({ id, isbn: original.isbn });
      }

      appliedChanges.push({
        id,
        original,
        updated,
      });
    });

    db.exec('COMMIT');

    const coverUpdates = [];
    if (coverFetchQueue.length) {
      const coverUpdateStmt = db.prepare('UPDATE books SET cover_path = ? WHERE id = ?');
      for (const target of coverFetchQueue) {
        try {
          const result = await resolveCoverForIsbn(target.isbn);
          if (!result?.cover_path) continue;
          coverUpdateStmt.run(result.cover_path, target.id);
          const change = appliedChanges.find(entry => entry.id === target.id);
          if (change) {
            change.updated.cover_path = result.cover_path;
          }
          coverUpdates.push({
            id: target.id,
            isbn: target.isbn,
            cover_path: result.cover_path,
            source: result.source,
          });
        } catch (coverErr) {
          console.error('aiNormalizeBooks cover fetch error', target, coverErr);
        }
      }
    }

    const summary = payload?.summary || { notes: 'Güncelleme tamamlandı.' };
    const booksList = appliedChanges.map(({ original, updated }) => ({
      id: original.id,
      isbn: original.isbn,
      title: updated.title ?? original.title,
      author: updated.author ?? original.author,
      publisher: updated.publisher ?? original.publisher,
      category: updated.category ?? original.category,
      cover_path: updated.cover_path ?? original.cover_path ?? null,
    }));

    const lastProcessedId = books[books.length - 1]?.id ?? cursor;
    if (Number.isFinite(lastProcessedId)) {
      writeSettingValue(AI_CURSOR_KEY, String(lastProcessedId));
    }

    res.json({
      applied: appliedChanges.length,
      summary,
      books: booksList,
      cover_updates: coverUpdates,
      batch: {
        processed: books.length,
        first_id: books[0]?.id ?? null,
        last_id: books[books.length - 1]?.id ?? null,
        total: totalBooks,
        previous_cursor: initialCursor,
        next_cursor: lastProcessedId,
        wrapped,
      },
      changes: appliedChanges,
    });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    console.error('aiNormalizeBooks error', err);
    if (err?.message?.includes('Gemini API request failed')) {
      return res.status(502).json({ error: 'Gemini API isteği başarısız oldu.', detail: err.message, triedModels: err.triedModels });
    }
    if (err?.message?.includes('Gemini yanıtı ayrıştırılamadı')) {
      return res.status(502).json({ error: 'Gemini yanıtı işlenemedi.', detail: err.message });
    }
    res.status(500).json({ error: 'AI destekli düzenleme başarısız.', detail: err.message });
  }
}
export function exportBooksCsv(req, res) {
  let sql =
    'SELECT isbn,title,author,category,publisher,published_year,page_count,language,shelf,cabinet,copies,available FROM books WHERE 1=1';
  const { clause, params } = buildBranchFilter({ user: req.user, queryValue: req.query.branch_id });
  sql += clause;
  const rows = db.prepare(sql).all(...params);
  // UTF-8 BOM ekle (Excel'de Türkçe karakterler için)
  const BOM = '\uFEFF';
  const header = BOM + 'ISBN,Kitap Adı,Yazar,Kategori,Yayınevi,Yayın Yılı,Sayfa Sayısı,Dil,Raf,Dolap,Adet,Mevcut\n';
  const body = rows
    .map(r =>
      [
        r.isbn || '',
        r.title || '',
        r.author || '',
        r.category || '',
        r.publisher || '',
        r.published_year || '',
        r.page_count ?? '',
        r.language || '',
        r.shelf || '',
        r.cabinet || '',
        r.copies ?? 1,
        r.available ?? 0,
      ]
        .map(x => `"${String(x ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kitaplar.csv"');
  res.send(header + body);
}
export async function importBooksCsv(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'CSV dosyası yok' });
  const csv = fs.readFileSync(file.path);
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  const branchId = resolveBranchForWrite(req.user, req.body?.branch_id);
  const stmt = db.prepare(
    `INSERT INTO books(
      isbn,title,author,category,copies,available,branch_id,cover_path,
      publisher,published_year,page_count,language,shelf,cabinet
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  let n = 0;
  for (const rawRow of records) {
    const normalizedRow = normalizeXlsxRow(rawRow);
    const isbnValue = sanitizeText(normalizedRow.isbn);
    const coverInputRaw = sanitizeText(normalizedRow.cover_path);
    const normalizedCoverInput = normalizeImportedCoverValue(coverInputRaw, req);
    const resolvedCoverPath = await resolveImportedCoverAsset(normalizedCoverInput, isbnValue);
    const finalCoverPath =
      resolvedCoverPath ||
      (normalizedCoverInput && !/^https?:\/\//i.test(normalizedCoverInput) ? normalizedCoverInput : null);
    const copies = Number(normalizedRow.copies || 1) || 1;
    const available = normalizedRow.available !== null && normalizedRow.available !== undefined
      ? Number(normalizedRow.available) || copies
      : copies;
    const categories = normalizeCategories(normalizedRow.category);
    stmt.run(
      isbnValue || null,
      normalizedRow.title ? normalizeTitle(normalizedRow.title) : 'Adı Yok',
      normalizeAuthor(sanitizeText(normalizedRow.author)),
      categories,
      copies,
      available,
      branchId,
      finalCoverPath,
      normalizePublisher(sanitizeText(normalizedRow.publisher)),
      sanitizeText(normalizedRow.published_year),
      normalizeNumber(normalizedRow.page_count),
      sanitizeText(normalizedRow.language) || 'Türkçe',
      sanitizeText(normalizedRow.shelf),
      sanitizeText(normalizedRow.cabinet)
    );
    n++;
  }
  res.json({ imported: n, branch_id: branchId });
}

export function getImportJobStatus(req, res) {
  const jobId = req.params.id;
  const job = importJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'İçe aktarma görevi bulunamadı.' });
  }
  res.json({
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    imported: job.imported,
    skipped: job.skipped,
    errors: job.errors,
    remaining: job.remaining,
    warningCounts: job.warningCounts,
    logs: job.logs.slice(-MAX_IMPORT_LOGS),
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
}


// ===== ISBN Auto Fetch & XLSX Import/Export =====
import XLSX from 'xlsx';
import { downloadCoverFromUrl } from './filesController.js';

function sanitizeIsbn(isbn){
  return String(isbn||'').replace(/[^0-9Xx]/g,'');
}

async function fetchFromGoogleBooks(isbn){
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  const res = await fetch(url);
  if(!res.ok) return null;
  const json = await res.json();
  const item = json.items && json.items[0];
  if(!item) return null;
  const v = item.volumeInfo || {};
  const pubDate = v.publishedDate ? String(v.publishedDate).split('-')[0] : null;
  
  // Kapak resmi öncelik sırası: large > medium > thumbnail > smallThumbnail
  let coverUrl = null;
  if(v.imageLinks) {
    // Önce en büyük boyutu kullan
    coverUrl = v.imageLinks.large || 
               v.imageLinks.medium || 
               v.imageLinks.thumbnail || 
               v.imageLinks.smallThumbnail ||
               null;
    
    // Eğer thumbnail kullanılıyorsa, zoom parametresiyle daha büyük al
    if(coverUrl && (coverUrl.includes('thumbnail') || coverUrl.includes('smallThumbnail'))) {
      // Google Books URL'lerinde zoom=1 yerine zoom=5 ile daha büyük resim alınabilir
      if(coverUrl.includes('zoom=1')) {
        coverUrl = coverUrl.replace('zoom=1', 'zoom=5');
      } else if(coverUrl.includes('&zoom=')) {
        // Mevcut zoom değerini artır
        coverUrl = coverUrl.replace(/zoom=\d+/, 'zoom=5');
      } else if(coverUrl.includes('books.google.com')) {
        // Zoom parametresi yoksa ekle
        const separator = coverUrl.includes('?') ? '&' : '?';
        coverUrl = coverUrl + separator + 'zoom=5';
      }
    }
  }
  
  // Normalize edilen verileri döndür
  return {
    isbn,
    title: normalizeTitle(v.title) || null,
    author: normalizeAuthor((v.authors && v.authors.join(', '))) || null,
    category: Array.isArray(v.categories) ? v.categories.join(', ') : null,
    cover_path: coverUrl,
    publisher: normalizePublisher(v.publisher) || null,
    published_year: pubDate,
    page_count: v.pageCount || null,
    language: v.language ? v.language.toUpperCase() : null
  };
}

async function fetchFromOpenLibrary(isbn){
  const url = `https://openlibrary.org/isbn/${isbn}.json`;
  const res = await fetch(url);
  if(!res.ok) return null;
  const json = await res.json();
  
  // Open Library kapak resmi: L (Large) > M (Medium) > S (Small)
  // L boyutunu direkt kullan (yoksa 404 döner ama client tarafında handle edilir)
  const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  
  // Yayın yılını temizle (sadece yıl kısmını al)
  let publishedYear = null;
  if(json.publish_date) {
    const yearMatch = String(json.publish_date).match(/\d{4}/);
    if(yearMatch) publishedYear = yearMatch[0];
  }
  
  // Yazar bilgisini çek - öncelik sırası: by_statement > authors array'den ilk yazar
  let author = null;
  if(json.by_statement) {
    author = json.by_statement;
  } else if(Array.isArray(json.authors) && json.authors.length > 0) {
    // Authors array'i var ama genelde key'ler olarak gelir (/authors/OL123A gibi)
    // Basit bir yaklaşım: ilk yazar key'ini kullan (detaylı bilgi için ek API çağrısı gerekir)
    // Şimdilik by_statement yeterli
    author = null; // Authors array'den direkt isim çıkmaz, key olarak gelir
  }
  
  // Normalize edilen verileri döndür
  const pub = Array.isArray(json.publishers) ? json.publishers.join(', ') : json.publishers || null;
  return {
    isbn,
    title: normalizeTitle(json.title) || null,
    author: normalizeAuthor(author),
    category: Array.isArray(json.subjects) ? json.subjects.slice(0, 5).join(', ') : null,
    cover_path: coverUrl,
    publisher: normalizePublisher(pub) || null,
    published_year: publishedYear,
    page_count: json.number_of_pages || null,
    language: Array.isArray(json.languages)
      ? json.languages.map(l => l.key?.split('/').pop()?.toUpperCase()).filter(Boolean).join(', ')
      : null
  };
}

/**
 * İki kitap verisini birleştirir - eksik alanları tamamlar
 * @param {Object} data1 - İlk kaynak (Google Books genelde daha detaylı)
 * @param {Object} data2 - İkinci kaynak (Open Library)
 * @returns {Object} Birleştirilmiş veri
 */
function mergeBookData(data1, data2) {
  // Önce data1'i temel al, eksik olanları data2'den doldur
  const merged = {
    isbn: data1?.isbn || data2?.isbn || null,
    title: data1?.title || data2?.title || null,
    author: data1?.author || data2?.author || null,
    category: null,
    cover_path: null,
    publisher: null,
    published_year: data1?.published_year || data2?.published_year || null,
    page_count: data1?.page_count || data2?.page_count || null,
    language: data1?.language || data2?.language || null
  };
  
  // Yayınevi: her ikisinden de varsa en uzun olanı seç
  if (data1?.publisher && data2?.publisher) {
    // İkisi de varsa, en uzun olanı seç (zaten normalize edilmiş)
    merged.publisher = data1.publisher.length > data2.publisher.length 
      ? data1.publisher 
      : data2.publisher;
  } else {
    // Sadece biri varsa onu kullan (zaten normalize edilmiş)
    merged.publisher = data1?.publisher || data2?.publisher || null;
  }
  
  // Kategorileri birleştir (her ikisinden de varsa)
  const cats = [];
  if(data1?.category) cats.push(data1.category);
  if(data2?.category) cats.push(data2.category);
  if(cats.length > 0) {
    // Kategorileri birleştir ve tekrarları kaldır
    const allCats = cats.join(', ').split(',').map(c => c.trim()).filter(Boolean);
    merged.category = [...new Set(allCats)].join(', ');
  }
  
  // Kapak resmini seç - öncelik sırası: Google large > Google medium > Open Library L
  if(data1?.cover_path && data1.cover_path.includes('books.google.com')) {
    // Google Books kapağı varsa onu tercih et
    merged.cover_path = data1.cover_path;
  } else if(data2?.cover_path) {
    // Open Library kapağını kullan
    merged.cover_path = data2.cover_path;
  } else if(data1?.cover_path) {
    // Son çare olarak Google'dan küçük olanı da kullanabilir
    merged.cover_path = data1.cover_path;
  }
  
  return merged;
}

export async function geminiResearchIsbn(req, res) {
  const raw = req.params.isbn;
  const isbn = sanitizeIsbn(raw);
  if (!isbn) {
    return res.status(400).json({ error: 'Geçerli bir ISBN giriniz.' });
  }

  const downloadCover = req.query.download_cover !== 'false';

  try {
    const result = await performGeminiResearch({ isbn, downloadCover });
    const normalized = result.normalized;
    if (!normalized.title && !normalized.author && !normalized.publisher && !normalized.cover_image_url) {
      return res.status(404).json({ error: 'ISBN için bilgi bulunamadı.' });
    }
    res.json({
      isbn: normalized.isbn || isbn,
      title: normalized.title,
      author: normalized.author,
      publisher: normalized.publisher,
      published_year: normalized.published_year,
      page_count: normalized.page_count,
      language: normalized.language,
      categories: normalized.categories,
      description: normalized.description,
      cover_image_url: result.coverPath || normalized.cover_image_url,
      cover_source_url: normalized.cover_image_url,
      preview_url: normalized.preview_url,
      cover_path: result.coverPath,
      downloaded_cover: result.downloadedCover,
      sources: normalized.sources,
    });
  } catch (err) {
    if (err.code === 'GEMINI_KEY_MISSING') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'INVALID_ISBN') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message?.includes('Gemini API request failed')) {
      console.error('geminiResearchIsbn request error', err);
      return res.status(502).json({ error: 'Gemini API isteği başarısız oldu.', detail: err.message, triedModels: err.triedModels });
    }
    if (err.message === 'Gemini yanıtı ayrıştırılamadı.') {
      console.error('geminiResearchIsbn parse error', err.raw ?? '');
      return res.status(502).json({ error: 'Gemini yanıtı ayrıştırılamadı.', detail: err.cause?.message });
    }
    console.error('geminiResearchIsbn unexpected error', err);
    return res.status(500).json({ error: 'Gemini araştırma sırasında hata oluştu.', detail: err.message });
  }
}

export async function geminiBatchEnrich(req, res) {
  let config;
  try {
    config = resolveGeminiConfig();
  } catch (err) {
    if (err.code === 'GEMINI_KEY_MISSING') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  const limitRaw = Number(req.body?.limit ?? req.query?.limit);
  const limitCandidate = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;
  const limit = Math.min(Math.max(limitCandidate, 1), 200);

  const branchParam = req.body?.branch_id ?? req.query?.branch_id;
  const { clause, params } = buildBranchFilter({ user: req.user, queryValue: branchParam });

  const books = db
    .prepare(
      `SELECT id,isbn,title,author,publisher,published_year,page_count,language,category,cover_path,branch_id
       FROM books
       WHERE isbn IS NOT NULL AND TRIM(isbn) <> ''
         AND (
           title IS NULL OR TRIM(title) = ''
           OR author IS NULL OR TRIM(author) = ''
           OR publisher IS NULL OR TRIM(publisher) = ''
           OR cover_path IS NULL OR TRIM(cover_path) = ''
         )
         ${clause}
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(...params, limit);

  if (!books.length) {
    const remainingRow = db
      .prepare(
        `SELECT COUNT(*) AS missing FROM books
         WHERE isbn IS NOT NULL AND TRIM(isbn) <> ''
           AND (
             title IS NULL OR TRIM(title) = ''
             OR author IS NULL OR TRIM(author) = ''
             OR publisher IS NULL OR TRIM(publisher) = ''
             OR cover_path IS NULL OR TRIM(cover_path) = ''
           )
           ${clause}`
      )
      .get(...params);
    return res.json({
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      remaining: Number(remainingRow?.missing ?? 0),
      items: [],
    });
  }

  const updateStmt = db.prepare(
    `UPDATE books SET
      title=?,
      author=?,
      publisher=?,
      category=?,
      published_year=?,
      page_count=?,
      language=?,
      cover_path=?
     WHERE id=?`
  );

  const summary = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    items: [],
  };

  for (const book of books) {
    summary.processed += 1;
    const needsCover = !book.cover_path || !String(book.cover_path).trim();
    try {
      const { normalized, coverPath, downloadedCover } = await performGeminiResearch({
        isbn: book.isbn,
        downloadCover: needsCover,
        config,
      });

      if (!normalized.title && !normalized.author && !normalized.publisher && !normalized.cover_image_url) {
        summary.skipped += 1;
        summary.items.push({ id: book.id, isbn: book.isbn, status: 'no_data' });
        continue;
      }

      const nextTitle = normalized.title ? normalizeTitle(normalized.title) : book.title || 'Adı Yok';
      const nextAuthor = normalized.author ? normalizeAuthor(normalized.author) : book.author;
      const nextPublisher = normalized.publisher ? normalizePublisher(normalized.publisher) : book.publisher;
      const nextCategory = normalizeCategories(normalized.categories, book.category) || book.category;
      const nextYear = normalized.published_year ?? book.published_year;
      const nextPageCount =
        typeof normalized.page_count === 'number' && Number.isFinite(normalized.page_count)
          ? Math.round(normalized.page_count)
          : book.page_count;
      const nextLanguage = normalized.language || book.language || 'Türkçe';
      let nextCover = book.cover_path;
      if (coverPath) {
        nextCover = coverPath;
      } else if (!nextCover && normalized.cover_image_url) {
        nextCover = normalized.cover_image_url;
      }

      updateStmt.run(
        nextTitle,
        nextAuthor,
        nextPublisher,
        nextCategory,
        nextYear,
        nextPageCount ?? null,
        nextLanguage,
        nextCover || null,
        book.id
      );

      const changes = {};
      if ((book.title || '') !== (nextTitle || '')) changes.title = { before: book.title, after: nextTitle };
      if ((book.author || '') !== (nextAuthor || '')) changes.author = { before: book.author, after: nextAuthor };
      if ((book.publisher || '') !== (nextPublisher || ''))
        changes.publisher = { before: book.publisher, after: nextPublisher };
      if ((book.category || '') !== (nextCategory || ''))
        changes.category = { before: book.category, after: nextCategory };
      if ((book.published_year || '') !== (nextYear || ''))
        changes.published_year = { before: book.published_year, after: nextYear };
      if ((book.language || '') !== (nextLanguage || ''))
        changes.language = { before: book.language, after: nextLanguage };
      if ((book.cover_path || '') !== (nextCover || '')) changes.cover_path = { before: book.cover_path, after: nextCover };
      if ((book.page_count ?? null) !== (nextPageCount ?? null))
        changes.page_count = { before: book.page_count, after: nextPageCount };

      const changed = Object.keys(changes).length > 0 || downloadedCover;
      if (changed) {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }

      summary.items.push({
        id: book.id,
        isbn: book.isbn,
        status: changed ? 'updated' : 'unchanged',
        changes,
        downloaded_cover: downloadedCover,
        sources: normalized.sources,
      });
    } catch (err) {
      summary.errors += 1;
      console.error('geminiBatchEnrich error', { id: book.id, isbn: book.isbn }, err);
      summary.items.push({
        id: book.id,
        isbn: book.isbn,
        status: 'error',
        error: err.message,
      });
    }
  }

  const remainingRow = db
    .prepare(
      `SELECT COUNT(*) AS missing FROM books
       WHERE isbn IS NOT NULL AND TRIM(isbn) <> ''
         AND (
           title IS NULL OR TRIM(title) = ''
           OR author IS NULL OR TRIM(author) = ''
           OR publisher IS NULL OR TRIM(publisher) = ''
           OR cover_path IS NULL OR TRIM(cover_path) = ''
         )
         ${clause}`
    )
    .get(...params);

  summary.remaining = Number(remainingRow?.missing ?? 0);

  res.json(summary);
}

export async function isbnFetch(req,res){
  const raw = req.params.isbn;
  const isbn = sanitizeIsbn(raw);
  const downloadCover = req.query.download_cover === 'true'; // Opsiyonel: kapak indirilsin mi?
  
  try{
    // Her iki API'den paralel olarak bilgi çek
    const [googleData, openLibraryData] = await Promise.allSettled([
      fetchFromGoogleBooks(isbn),
      fetchFromOpenLibrary(isbn)
    ]);
    
    const google = googleData.status === 'fulfilled' ? googleData.value : null;
    const openLib = openLibraryData.status === 'fulfilled' ? openLibraryData.value : null;
    
    // Her iki kaynaktan da bilgi yoksa hata döndür
    if(!google && !openLib) {
      return res.status(404).json({error:'Bulunamadı'});
    }
    
    // Bilgileri birleştir - eksik alanları tamamla
    let meta;
    if(google && openLib) {
      // Her ikisi de varsa birleştir
      meta = mergeBookData(google, openLib);
    } else {
      // Sadece biri varsa onu kullan
      meta = google || openLib;
    }
    
    // Kapak indirme istenirse
    if(downloadCover && meta.cover_path && meta.cover_path.startsWith('http')) {
      const localPath = await downloadCoverFromUrl(meta.cover_path, isbn);
      if(localPath) {
        meta.cover_path = localPath;
      }
    }
    
    res.json(meta);
  }catch(e){
    res.status(500).json({error:'Servis hatası', detail: String(e)});
  }
}

export async function isbnCreate(req,res){
  const raw = req.params.isbn;
  const isbn = sanitizeIsbn(raw);
  const downloadCover = req.body?.download_cover !== false; // Varsayılan: true (kapak indir)
  
  try{
    // Her iki API'den paralel olarak bilgi çek
    const [googleData, openLibraryData] = await Promise.allSettled([
      fetchFromGoogleBooks(isbn),
      fetchFromOpenLibrary(isbn)
    ]);
    
    const google = googleData.status === 'fulfilled' ? googleData.value : null;
    const openLib = openLibraryData.status === 'fulfilled' ? openLibraryData.value : null;
    
    // Her iki kaynaktan da bilgi yoksa hata döndür
    if(!google && !openLib) {
      return res.status(404).json({error:'Bulunamadı'});
    }
    
    // Bilgileri birleştir - eksik alanları tamamla
    let meta;
    if(google && openLib) {
      // Her ikisi de varsa birleştir
      meta = mergeBookData(google, openLib);
    } else {
      // Sadece biri varsa onu kullan
      meta = google || openLib;
    }
    
    // Kapak resmini sunucuya indir (eğer URL ise)
    let finalCoverPath = meta.cover_path;
    if(downloadCover && meta.cover_path && meta.cover_path.startsWith('http')) {
      const localPath = await downloadCoverFromUrl(meta.cover_path, isbn);
      if(localPath) {
        finalCoverPath = localPath;
      }
    }
    
    const info = db.prepare(
      `INSERT INTO books(
        isbn,title,author,category,copies,available,cover_path,publisher,published_year,page_count,language
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      meta.isbn || null,
      meta.title || 'Adı Yok',
      meta.author || null,
      normalizeCategories(meta.category),
      1,
      1,
      finalCoverPath || null,
      meta.publisher || null,
      meta.published_year || null,
      normalizeNumber(meta.page_count),
      meta.language || 'Türkçe'
    );
    res.json({created_id: info.lastInsertRowid, meta: {...meta, cover_path: finalCoverPath}});
  }catch(e){
    res.status(500).json({error:'Servis hatası', detail: String(e)});
  }
}

export function exportBooksXlsx(req,res){
  let sql = `SELECT id,isbn,title,author,category,publisher,published_year,page_count,language,shelf,cabinet,copies,available
    ,cover_path FROM books WHERE 1=1`;
  const { clause, params } = buildBranchFilter({ user: req.user, queryValue: req.query?.branch_id });
  sql += clause;
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  
  // Türkçe başlıklar için mapping
  const mappedRows = rows.map(row => ({
    'ID': row.id,
    'ISBN': row.isbn || '',
    'Kitap Adı': row.title || '',
    'Yazar': row.author || '',
    'Kategori': row.category || '',
    'Yayınevi': row.publisher || '',
    'Yayın Yılı': row.published_year || '',
    'Sayfa Sayısı': row.page_count || '',
    'Dil': row.language || '',
    'Raf': row.shelf || '',
    'Dolap': row.cabinet || '',
    'Adet': row.copies ?? 1,
    'Mevcut': row.available ?? 0,
    'Kapak URL': resolveCoverUrlForExport(row.cover_path, req),
  }));
  
  const ws = XLSX.utils.json_to_sheet(mappedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kitaplar');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="kitaplar.xlsx"');
  res.end(buf);
}

export async function importBooksXlsx(req, res) {
  if (!req.file) return res.status(400).json({ error: 'XLSX dosyası yok' });
  const wb = XLSX.readFile(req.file.path);
  const wsname = wb.SheetNames[0];
  const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { defval: null, raw: false });
  const data = rawData.map((row, index) => {
    const normalized = normalizeXlsxRow(row);
    const rowNumber = typeof row.__rowNum__ === 'number' ? row.__rowNum__ + 1 : index + 2;
    return { ...normalized, __rowNumber: rowNumber };
  });
  const branchId = resolveBranchForWrite(req.user, req.body?.branch_id);
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: 'pending',
    total: data.length,
    processed: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    remaining: data.length,
    logs: [],
    warningCounts: {},
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  importJobs.set(jobId, job);

  res.json({ jobId, total: job.total });

  const host = req.get('host');
  const reqInfo = host
    ? {
        get: header => {
          if (typeof header === 'string' && header.toLowerCase() === 'host') {
            return host;
          }
          return undefined;
        },
      }
    : { get: () => undefined };

  const filePath = req.file.path;

  process.nextTick(() =>
    runImportJob({
      jobId,
      rows: data,
      branchId,
      reqInfo,
      filePath,
    })
  );
}

function scheduleImportJobCleanup(jobId) {
  setTimeout(() => {
    importJobs.delete(jobId);
  }, IMPORT_JOB_TTL_MS);
}

function pushImportLog(job, entry) {
  if (!entry) return;
  const payload = {
    ts: Date.now(),
    level: entry.level || 'info',
    message: entry.message || '',
  };
  if (entry.rowNumber !== undefined) payload.rowNumber = entry.rowNumber;
  if (entry.details !== undefined) payload.details = entry.details;
  if (job.logs.length >= MAX_IMPORT_LOGS) {
    job.logs.shift();
  }
  job.logs.push(payload);
}

async function runImportJob({ jobId, rows, branchId, reqInfo, filePath }) {
  const job = importJobs.get(jobId);
  if (!job) return;
  if (!rows.length) {
    job.status = 'completed';
    job.finishedAt = Date.now();
    scheduleImportJobCleanup(jobId);
    try {
      await fs.promises.rm(filePath, { force: true });
    } catch {}
    return;
  }

  job.status = 'running';
  const insertStmt = db.prepare(
    `INSERT INTO books(
      isbn,title,author,category,copies,available,branch_id,cover_path,
      publisher,published_year,page_count,language,shelf,cabinet
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const findByIsbnStmt = db.prepare('SELECT id FROM books WHERE isbn=?');

  try {
    for (let index = 0; index < rows.length; index++) {
      const normalizedRow = rows[index];
      const rowNumber = normalizedRow.__rowNumber ?? index + 2;
      try {
        const result = await insertBookFromRow({
          row: normalizedRow,
          branchId,
          reqInfo,
          insertStmt,
          findByIsbnStmt,
        });

        if (result.warnings?.length) {
          for (const warn of result.warnings) {
            job.warningCounts[warn] = (job.warningCounts[warn] || 0) + 1;
          }
        }

        if (result.status === 'inserted') {
          job.imported += 1;
          pushImportLog(job, {
            level: 'success',
            rowNumber,
            message: result.warnings?.includes('missing_isbn')
              ? `Satır ${rowNumber}: ISBN eksik, kayıt eklendi (#${result.id})`
              : `Satır ${rowNumber}: kitap eklendi (#${result.id})`,
          });
        } else if (result.status === 'skipped' && result.reason === 'duplicate') {
          job.skipped += 1;
          pushImportLog(job, {
            level: 'warning',
            rowNumber,
            message: `Satır ${rowNumber}: ISBN ${result.isbn || 'belirsiz'} katalogda mevcut (id ${result.existingId})`,
          });
        } else if (result.status === 'skipped') {
          job.skipped += 1;
          pushImportLog(job, {
            level: 'warning',
            rowNumber,
            message: `Satır ${rowNumber}: ${result.reason || 'Atlandı'}`,
          });
        }
      } catch (rowErr) {
        job.errors += 1;
        pushImportLog(job, {
          level: 'error',
          rowNumber,
          message: `Satır ${rowNumber}: ${rowErr?.message || rowErr}`,
        });
      }

      job.processed += 1;
      job.remaining = Math.max(job.total - job.processed, 0);

      if (index % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    job.status = 'completed';
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = 'error';
    job.error = err.message || String(err);
    job.finishedAt = Date.now();
  } finally {
    job.remaining = Math.max(job.total - job.processed, 0);
    scheduleImportJobCleanup(jobId);
    try {
      await fs.promises.rm(filePath, { force: true });
    } catch {}
  }
}

async function insertBookFromRow({ row, branchId, reqInfo, insertStmt, findByIsbnStmt }) {
  const warnings = [];
  const isbnValue = sanitizeText(row.isbn);
  if (!isbnValue) {
    warnings.push('missing_isbn');
  }

  if (isbnValue) {
    const existing = findByIsbnStmt.get(isbnValue);
    if (existing) {
      return {
        status: 'skipped',
        reason: 'duplicate',
        existingId: existing.id,
        isbn: isbnValue,
        warnings: [...warnings, 'duplicate_isbn'],
      };
    }
  }

  const coverInputRaw = sanitizeText(row.cover_path);
  const normalizedCoverInput = normalizeImportedCoverValue(coverInputRaw, reqInfo);
  const resolvedCoverPath = await resolveImportedCoverAsset(normalizedCoverInput, isbnValue);
  const finalCoverPath =
    resolvedCoverPath ||
    (normalizedCoverInput && !/^https?:\/\//i.test(normalizedCoverInput) ? normalizedCoverInput : null);

  const copies = Number(row.copies || 1) || 1;
  const available = row.available !== null && row.available !== undefined
    ? Number(row.available) || copies
    : copies;

  const info = insertStmt.run(
    isbnValue || null,
    row.title ? normalizeTitle(row.title) : 'Adı Yok',
    normalizeAuthor(sanitizeText(row.author)),
    normalizeCategories(row.category),
    copies,
    available,
    branchId,
    finalCoverPath,
    normalizePublisher(sanitizeText(row.publisher)),
    sanitizeText(row.published_year),
    normalizeNumber(row.page_count),
    sanitizeText(row.language) || 'Türkçe',
    sanitizeText(row.shelf),
    sanitizeText(row.cabinet)
  );

  return {
    status: 'inserted',
    id: info.lastInsertRowid,
    warnings,
  };
}

export function planBulkIsbnRows(rows, lookupExisting){
  const seen = new Set();
  const plan = [];
  rows.forEach((raw, idx)=>{
    const row = idx + 1;
    const isbn = sanitizeIsbn(raw.isbn);
    const copies = Number(raw.copies||1) || 1;
    if(!isbn){
      plan.push({ row, status:'skip', reason:'missing_isbn' });
      return;
    }
    if(seen.has(isbn)){
      plan.push({ row, status:'exists', isbn, reason:'duplicate_in_upload' });
      return;
    }
    seen.add(isbn);
    const existingId = lookupExisting ? lookupExisting(isbn) : null;
    if(existingId){
      plan.push({ row, status:'exists', isbn, id:existingId, reason:'already_in_catalog' });
      return;
    }
    plan.push({ row, status:'create', isbn, copies });
  });
  return { plan };
}

export async function isbnBulkFromXlsx(req,res){
  if(!req.file) return res.status(400).json({error:'XLSX dosyası yok'});
  const wb = XLSX.readFile(req.file.path);
  const wsname = wb.SheetNames[0];
  const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
  const data = rawData.map(row => normalizeXlsxRow(row));
  const branchId = resolveBranchForWrite(req.user, req.body?.branch_id);
  const selectByIsbn = db.prepare('SELECT id FROM books WHERE isbn=?');
  const { plan } = planBulkIsbnRows(data, isbn=>{
    const existing = selectByIsbn.get(isbn);
    return existing ? existing.id : null;
  });

  let created = 0;
  let skipped = 0;
  const results = [];
  const logs = [];
  const insertBook = db.prepare(`INSERT INTO books(
      isbn,title,author,category,copies,available,branch_id,cover_path,
      publisher,published_year,page_count,language,shelf,cabinet
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for(const step of plan){
    if(step.status === 'skip'){
      skipped++;
      results.push({ row: step.row, status:'skip', reason: step.reason });
      logs.push(`Satır ${step.row}: ISBN eksik veya geçersiz, atlandı.`);
      continue;
    }
    if(step.status === 'exists'){
      skipped++;
      results.push({ row: step.row, isbn: step.isbn, status:'exists', id: step.id, reason: step.reason });
      const suffix = step.id ? ` (id ${step.id})` : '';
      const detail = step.reason === 'duplicate_in_upload' ? 'dosyada tekrar' : 'katalogda mevcut';
      logs.push(`Satır ${step.row}: ${step.isbn} ${detail}${suffix}.`);
      continue;
    }

    logs.push(`Satır ${step.row}: ${step.isbn} için meta aranıyor (Google Books + Open Library).`);
    try{
      // Her iki API'den paralel olarak bilgi çek
      const [googleData, openLibraryData] = await Promise.allSettled([
        fetchFromGoogleBooks(step.isbn),
        fetchFromOpenLibrary(step.isbn)
      ]);
      
      const google = googleData.status === 'fulfilled' ? googleData.value : null;
      const openLib = openLibraryData.status === 'fulfilled' ? openLibraryData.value : null;
      
      // Her iki kaynaktan da bilgi yoksa atla
      if(!google && !openLib){
        skipped++;
        results.push({ row: step.row, isbn: step.isbn, status:'not_found' });
        logs.push(`Satır ${step.row}: ${step.isbn} için meta bulunamadı.`);
        continue;
      }
      
      // Bilgileri birleştir
      let meta;
      if(google && openLib) {
        meta = mergeBookData(google, openLib);
        logs.push(`Satır ${step.row}: Her iki kaynaktan bilgi birleştirildi.`);
      } else {
        meta = google || openLib;
        const source = google ? 'Google Books' : 'Open Library';
        logs.push(`Satır ${step.row}: Bilgi ${source}'den alındı.`);
      }
      
      // Kapak resmini sunucuya indir (eğer URL ise)
      let finalCoverPath = meta.cover_path;
      if(meta.cover_path && meta.cover_path.startsWith('http')) {
        const localPath = await downloadCoverFromUrl(meta.cover_path, step.isbn);
        if(localPath) {
          finalCoverPath = localPath;
          logs.push(`Satır ${step.row}: Kapak resmi indirildi.`);
        }
      }
      
      const copies = step.copies ?? 1;
      const info = insertBook.run(
        meta.isbn||null,
        meta.title||'Adı Yok',
        meta.author||null,
        normalizeCategories(meta.category),
        Number(copies)||1,
        Number(copies)||1,
        branchId ?? null,
        finalCoverPath||null,
        meta.publisher || null,
        meta.published_year || null,
        normalizeNumber(meta.page_count),
        meta.language || 'Türkçe',
        null,
        null
      );
      created++;
      results.push({ row: step.row, isbn: step.isbn, status:'created', id: info.lastInsertRowid });
      logs.push(`Satır ${step.row}: ${step.isbn} (${info.lastInsertRowid}) eklendi.`);
    }catch(e){
      skipped++;
      results.push({ row: step.row, isbn: step.isbn, status:'error', error: String(e) });
      logs.push(`Satır ${step.row}: ${step.isbn} işleminde hata: ${String(e)}`);
    }
  }

  res.json({created, skipped, results, logs, branch_id: branchId ?? null});
}

export async function completeBookCovers(req, res) {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = rawIds
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0);
    const limitRaw = Number(req.body?.limit);
    const MAX_LIMIT = 500;
    const DEFAULT_LIMIT = 200;
    const batchLimit = ids.length
      ? ids.length
      : Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { clause, params } = buildBranchFilter({ user: req.user, queryValue: req.body?.branch_id });
    let books = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const sql = `SELECT id,isbn,title,cover_path,branch_id FROM books WHERE id IN (${placeholders})`;
      const rows = db.prepare(sql).all(...ids);
      books = rows.filter(row => canAccessBranch(req.user, row.branch_id));
    } else {
      books = db
        .prepare(
          `SELECT id,isbn,title,cover_path,branch_id FROM books
           WHERE (cover_path IS NULL OR TRIM(cover_path)='')
             AND isbn IS NOT NULL AND TRIM(isbn)<>''
             ${clause}
           ORDER BY id ASC LIMIT ?`
        )
        .all(...params, batchLimit);
    }

    if (!books.length) {
      const remainingRow = db
        .prepare(
          `SELECT COUNT(*) AS missing FROM books
           WHERE (cover_path IS NULL OR TRIM(cover_path)='')
             AND isbn IS NOT NULL AND TRIM(isbn)<>''
             ${clause}`
        )
        .get(...params);
      return res.json({
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        remaining: Number(remainingRow?.missing ?? 0),
        message: ids.length
          ? 'Seçilen kitaplar için kapak eksik değil.'
          : 'Kapak resmi eksik kitap bulunamadı.',
      });
    }

    const updateStmt = db.prepare('UPDATE books SET cover_path=? WHERE id=?');
    const results = [];
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const book of books) {
      const isbn = sanitizeIsbn(book.isbn);
      if (!isbn) {
        skipped += 1;
        results.push({ id: book.id, isbn: book.isbn, status: 'skipped', reason: 'missing_isbn' });
        continue;
      }
      if (!ids.length && book.cover_path && String(book.cover_path).trim()) {
        skipped += 1;
        results.push({ id: book.id, isbn: book.isbn, status: 'skipped', reason: 'already_has_cover' });
        continue;
      }
      try {
        const cover = await resolveCoverForIsbn(isbn);
        if (!cover?.cover_path) {
          skipped += 1;
          results.push({ id: book.id, isbn: book.isbn, status: 'skipped', reason: 'not_found' });
          continue;
        }
        updateStmt.run(cover.cover_path, book.id);
        updated += 1;
        results.push({
          id: book.id,
          isbn: book.isbn,
          status: 'updated',
          cover_path: cover.cover_path,
          source: cover.source,
        });
      } catch (err) {
        errors += 1;
        results.push({
          id: book.id,
          isbn: book.isbn,
          status: 'error',
          error: err?.message || String(err),
        });
      }
    }

    const remainingRow = db
      .prepare(
        `SELECT COUNT(*) AS missing FROM books
         WHERE (cover_path IS NULL OR TRIM(cover_path)='')
           AND isbn IS NOT NULL AND TRIM(isbn)<>''
           ${clause}`
      )
      .get(...params);

    res.json({
      processed: books.length,
      updated,
      skipped,
      errors,
      remaining: Number(remainingRow?.missing ?? 0),
      results,
    });
  } catch (error) {
    console.error('completeBookCovers error', error);
    res.status(500).json({ error: 'Kapak tamamlama sırasında hata oluştu', detail: error.message });
  }
}

export function normalizeAllBooks(req, res) {
  try {
    const { clause, params } = buildBranchFilter({
      user: req.user,
      queryValue: req.query.branch_id,
    });
    
    // Tüm kitapları getir
    const sql = `SELECT * FROM books WHERE 1=1${clause}`;
    const books = db.prepare(sql).all(...params);
    
    let updated = 0;
    const updateStmt = db.prepare(`
      UPDATE books 
      SET title=?, author=?, publisher=? 
      WHERE id=?
    `);
    
    for (const book of books) {
      const normalizedTitle = normalizeTitle(book.title);
      const normalizedAuthor = normalizeAuthor(book.author);
      const normalizedPublisher = normalizePublisher(book.publisher);
      
      // Değişiklik varsa güncelle
      if (normalizedTitle !== book.title || 
          normalizedAuthor !== book.author || 
          normalizedPublisher !== book.publisher) {
        updateStmt.run(normalizedTitle, normalizedAuthor, normalizedPublisher, book.id);
        updated++;
      }
    }
    
    res.json({ 
      ok: true, 
      total: books.length, 
      updated, 
      message: `${updated} kitap düzeltildi.` 
    });
  } catch (error) {
    console.error('Normalize all books error:', error);
    res.status(500).json({ error: 'Kitap düzeltme sırasında hata oluştu', detail: error.message });
  }
}
