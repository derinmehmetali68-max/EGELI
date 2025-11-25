import db from '../src/db.js';
import { downloadCoverFromUrl } from '../src/controllers/filesController.js';

const MAX_ERRORS_BEFORE_ABORT = 25;

function sanitizeIsbn(isbn) {
  return String(isbn || '')
    .replace(/[^0-9Xx]/g, '')
    .trim();
}

async function fetchFromGoogleBooks(isbn) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const json = await response.json();
  const item = json?.items?.[0];
  if (!item?.volumeInfo?.imageLinks) return null;

  const links = item.volumeInfo.imageLinks;
  let coverUrl =
    links.large ||
    links.medium ||
    links.extraLarge ||
    links.thumbnail ||
    links.smallThumbnail ||
    null;

  if (coverUrl && (coverUrl.includes('thumbnail') || coverUrl.includes('zoom='))) {
    if (coverUrl.includes('zoom=')) {
      coverUrl = coverUrl.replace(/zoom=\d+/, 'zoom=5');
    } else if (coverUrl.includes('?')) {
      coverUrl = `${coverUrl}&zoom=5`;
    } else {
      coverUrl = `${coverUrl}?zoom=5`;
    }
  }

  return coverUrl;
}

async function fetchFromOpenLibrary(isbn) {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) return null;
  return url.replace('?default=false', '');
}

async function resolveCoverUrl(isbn) {
  const sanitized = sanitizeIsbn(isbn);
  if (!sanitized || sanitized.length < 10) return null;

  const [googleResult, openLibraryResult] = await Promise.allSettled([
    fetchFromGoogleBooks(sanitized),
    fetchFromOpenLibrary(sanitized),
  ]);

  const googleUrl = googleResult.status === 'fulfilled' ? googleResult.value : null;
  const openLibraryUrl = openLibraryResult.status === 'fulfilled' ? openLibraryResult.value : null;

  return googleUrl || openLibraryUrl || null;
}

async function main() {
  const rows = db
    .prepare(
      `SELECT id, isbn, title FROM books
       WHERE (cover_path IS NULL OR TRIM(cover_path) = '')
         AND isbn IS NOT NULL AND TRIM(isbn) <> ''`
    )
    .all();

  if (!rows.length) {
    console.log('Tüm kitapların kapağı zaten mevcut.');
    return;
  }

  console.log(`Kapakları eksik ${rows.length} kitap bulundu. İşlem başlıyor...`);
  const updateStmt = db.prepare('UPDATE books SET cover_path = ? WHERE id = ?');

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    processed += 1;
    const isbn = sanitizeIsbn(row.isbn);
    if (!isbn || isbn.length < 10) {
      skipped += 1;
      continue;
    }

    try {
      const coverUrl = await resolveCoverUrl(isbn);
      if (!coverUrl) {
        skipped += 1;
        continue;
      }

      const localPath = await downloadCoverFromUrl(coverUrl, isbn);
      if (!localPath) {
        skipped += 1;
        continue;
      }

      updateStmt.run(localPath, row.id);
      updated += 1;
    } catch (error) {
      errors += 1;
      console.warn(`ISBN ${isbn} kapak getirilemedi: ${error.message || error}`);
      if (errors >= MAX_ERRORS_BEFORE_ABORT) {
        console.error('Çok fazla hata alındı. İşlem durduruldu.');
        break;
      }
    }

    if (processed % 25 === 0) {
      console.log(
        `İşlenen: ${processed}/${rows.length} · Yeni kapak: ${updated} · Atlanan: ${skipped} · Hata: ${errors}`
      );
    }
  }

  console.log('Kapak tamamlama bitti.');
  console.log(
    `Özet -> İşlenen: ${processed}, Yeni kapak: ${updated}, Atlanan: ${skipped}, Hata: ${errors}`
  );
}

main()
  .catch(err => {
    console.error('Kapak tamamlama sırasında beklenmeyen hata:', err);
    process.exit(1);
  })
  .finally(() => {
    db.close?.();
  });
