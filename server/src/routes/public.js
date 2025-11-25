import { Router } from 'express';
import db from '../db.js';
import dayjs from 'dayjs';

// IP adresi alma fonksiyonu
function ipFromRequest(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return forwarded[0];
  }
  return req.ip || req.connection?.remoteAddress || null;
}

// Loans controller'dan gerekli fonksiyonları kopyala (auth olmadan)
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (row && row.value !== undefined && row.value !== null) {
    const num = Number(row.value);
    return Number.isFinite(num) ? num : row.value;
  }
  return fallback;
}

function findBook({ book_id, isbn }) {
  if (book_id) {
    return db.prepare('SELECT * FROM books WHERE id=?').get(book_id);
  }
  if (isbn) {
    const cleanIsbn = String(isbn || '').trim().replace(/[\s-]/g, '');
    if (!cleanIsbn) return null;
    
    let book = db.prepare('SELECT * FROM books WHERE isbn=?').get(isbn);
    if (book) return book;
    
    book = db.prepare('SELECT * FROM books WHERE isbn=?').get(cleanIsbn);
    if (book) return book;
    
    book = db.prepare('SELECT * FROM books WHERE REPLACE(REPLACE(isbn, \' \', \'\'), \'-\', \'\')=?').get(cleanIsbn);
    if (book) return book;
    
    book = db.prepare('SELECT * FROM books WHERE REPLACE(REPLACE(isbn, \' \', \'\'), \'-\', \'\') LIKE ? LIMIT 1').get(`%${cleanIsbn}%`);
    if (book) return book;
    
    if (cleanIsbn.length >= 10) {
      const last10 = cleanIsbn.slice(-10);
      book = db.prepare('SELECT * FROM books WHERE REPLACE(REPLACE(isbn, \' \', \'\'), \'-\', \'\') LIKE ? LIMIT 1').get(`%${last10}%`);
      if (book) return book;
    }
    
    return null;
  }
  return null;
}

function findMember({ member_id, student_no }) {
  if (member_id) {
    return db.prepare('SELECT * FROM members WHERE id=?').get(member_id);
  }
  if (student_no) {
    const cleanStudentNo = String(student_no).trim();
    return db.prepare('SELECT * FROM members WHERE student_no=?').get(cleanStudentNo);
  }
  return null;
}

function calculateAvailable(book) {
  if (!book) return 0;
  try {
    const numericAvail = Number(book.available);
    if (Number.isFinite(numericAvail) && numericAvail >= 0) {
      return numericAvail;
    }
    const copies = Number(book.copies);
    if (!Number.isFinite(copies) || copies <= 0) return 0;
    const activeCount = db
      .prepare('SELECT COUNT(*) AS cnt FROM loans WHERE book_id=? AND return_date IS NULL')
      .get(book.id);
    const remaining = copies - Number(activeCount?.cnt ?? 0);
    return remaining > 0 ? remaining : 0;
  } catch (error) {
    console.error('calculateAvailable hatası:', error);
    return 0;
  }
}

function setBookAvailable(bookId, value) {
  try {
    const safeValue = Math.max(Number(value) || 0, 0);
    db.prepare('UPDATE books SET available=? WHERE id=?').run(safeValue, bookId);
  } catch (error) {
    console.error('setBookAvailable hatası:', error);
    throw error;
  }
}

export function buildPublicBooksQuery(query = {}) {
  const { q = '', category, author, available } = query;
  let sql = 'SELECT id,isbn,title,author,category,available,cover_path,publisher,published_year,language,copies FROM books WHERE 1=1';
  const params = [];

  if (q) {
    sql += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) {
    sql += ' AND category LIKE ?';
    params.push(`%${category}%`);
  }
  if (author) {
    sql += ' AND author LIKE ?';
    params.push(`%${author}%`);
  }
  const showAvailableOnly = typeof available !== 'undefined' &&
    ['1', 'true', 'yes', 'on'].includes(String(available).toLowerCase());
  if (showAvailableOnly) {
    sql += ' AND available > 0';
  }

  sql += ' ORDER BY created_at DESC';
  return { sql, params };
}

const r = Router();

// Public kitap listesi
r.get('/books', (req, res) => {
  try {
    const { sql, params } = buildPublicBooksQuery(req.query);
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (error) {
    console.error('Public books error:', error);
    res.status(500).json({ error: 'Kitap listesi alınamadı', detail: error.message });
  }
});

// Public kitap detayı
r.get('/books/:id', (req, res) => {
  const id = Number(req.params.id);
  const book = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!book) {
    return res.status(404).json({ error: 'Kitap bulunamadı' });
  }
  res.json(book);
});

// Public üye bulma (kiosk giriş için)
r.get('/members/find', (req, res) => {
  try {
    const { student_no, member_id } = req.query;
    
    if (!student_no && !member_id) {
      return res.status(422).json({ error: 'student_no veya member_id gerekli' });
    }

    // member_id'yi parse et
    let parsedMemberId = null;
    if (member_id) {
      const num = Number(member_id);
      if (Number.isFinite(num) && num > 0) {
        parsedMemberId = num;
      }
    }

    const member = findMember({ member_id: parsedMemberId, student_no });
    if (!member) {
      return res.status(404).json({ error: 'Üye bulunamadı' });
    }

    // Şifre hariç bilgileri gönder
    res.json({
      id: member.id,
      name: member.name,
      student_no: member.student_no,
      grade: member.grade,
      phone: member.phone,
      email: member.email,
      member_type: member.member_type,
      branch_id: member.branch_id,
    });
  } catch (error) {
    console.error('Members find error:', error);
    res.status(500).json({ error: 'Üye bulunurken hata oluştu', detail: error.message });
  }
});

function kioskPinOk(req) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get('kiosk_pin');
  const required = row?.value || '';
  if (!required) return true;
  const provided = req.headers['x-kiosk-pin'] || req.body?.pin || req.query?.pin || '';
  return String(provided) === String(required);
}

// Kiosk ödünç alma
r.post('/kiosk/checkout', (req, res) => {
  try {
    if (!kioskPinOk(req)) {
      return res.status(403).json({ error: 'Kiosk PIN hatalı' });
    }
    const { book_id, isbn, member_id, student_no } = req.body;

    // Validasyon
    if (!book_id && !isbn) {
      return res.status(422).json({ error: 'Kitap ID veya ISBN gerekli' });
    }
    if (!member_id && !student_no) {
      return res.status(422).json({ error: 'Üye ID veya okul numarası gerekli' });
    }

    // Kitap bul
    const book = findBook({ book_id, isbn });
    if (!book) {
      return res.status(404).json({ error: 'Kitap bulunamadı' });
    }

    // Müsaitlik kontrolü
    const availableCount = calculateAvailable(book);
    if (availableCount <= 0) {
      return res.status(400).json({ error: 'Kitap uygun değil (stokta yok)' });
    }

    // Üye bul
    const member = findMember({ member_id, student_no });
    if (!member) {
      return res.status(404).json({ error: 'Üye bulunamadı' });
    }

    // Rezervasyon kontrolü
    const reservations = db
      .prepare("SELECT * FROM reservations WHERE book_id=? AND status='active' ORDER BY id ASC")
      .all(book.id);
    if (reservations.length && reservations[0].member_id !== member.id) {
      return res.status(409).json({ error: 'Rezervasyon sırası var' });
    }
    if (reservations.length && reservations[0].member_id === member.id) {
      db.prepare("UPDATE reservations SET status='fulfilled' WHERE id=?").run(reservations[0].id);
    }

    // Varsayılan ödünç süresi
    const defaultDays = getSetting('loan_days_default', 14);
    const due = dayjs().add(defaultDays, 'day').format('YYYY-MM-DDTHH:mm:ss');
    const now = dayjs().format('YYYY-MM-DDTHH:mm:ss');

    // Ödünç kaydı oluştur
    const insertStmt = db.prepare('INSERT INTO loans(book_id,member_id,due_date,branch_id,loan_date) VALUES (?,?,?,?,?)');
    insertStmt.run(book.id, member.id, due, book.branch_id || null, now);

    // Kitap mevcut sayısını güncelle
    setBookAvailable(book.id, Math.max(availableCount - 1, 0));

    // Log kaydı ekle
    try {
      db.prepare(`INSERT INTO kiosk_logs(action_type, book_id, member_id, isbn, student_no, success, ip_address, branch_id) 
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run('checkout', book.id, member.id, book.isbn || isbn, member.student_no || student_no, 1, ipFromRequest(req), book.branch_id);
    } catch (logError) {
      console.error('Kiosk log yazma hatası:', logError);
    }

    res.json({ ok: true, due_date: due, message: 'Ödünç verme başarılı' });
  } catch (error) {
    console.error('Kiosk checkout hatası:', error);
    
    // Hata durumunda log kaydı ekle
    try {
      db.prepare(`INSERT INTO kiosk_logs(action_type, book_id, member_id, isbn, student_no, success, error_message, ip_address) 
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run('checkout', null, null, isbn || null, student_no || null, 0, error.message, ipFromRequest(req));
    } catch (logError) {
      console.error('Kiosk error log yazma hatası:', logError);
    }
    
    res.status(500).json({ error: 'Ödünç verme sırasında hata oluştu', detail: error.message });
  }
});

// Kiosk iade
r.post('/kiosk/return', (req, res) => {
  try {
    if (!kioskPinOk(req)) {
      return res.status(403).json({ error: 'Kiosk PIN hatalı' });
    }
    const { loan_id, isbn, student_no } = req.body;

    // Validasyon
    if (!loan_id && (!isbn || !student_no)) {
      return res.status(422).json({ error: 'İşlem ID veya ISBN+Okul numarası gerekli' });
    }

    let loan = null;
    if (loan_id) {
      loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loan_id);
    } else if (isbn && student_no) {
      const cleanIsbn = String(isbn || '').trim().replace(/[\s-]/g, '');
      const cleanStudentNo = String(student_no || '').trim();

      loan = db
        .prepare(
          `SELECT l.* FROM loans l
           JOIN books b ON b.id=l.book_id
           JOIN members m ON m.id=l.member_id
           WHERE l.return_date IS NULL AND REPLACE(REPLACE(b.isbn, ' ', ''), '-', '')=? AND m.student_no=?`
        )
        .get(cleanIsbn, cleanStudentNo);

      if (!loan) {
        loan = db
          .prepare(
            `SELECT l.* FROM loans l
             JOIN books b ON b.id=l.book_id
             JOIN members m ON m.id=l.member_id
             WHERE l.return_date IS NULL AND b.isbn=? AND m.student_no=?`
          )
          .get(isbn, cleanStudentNo);
      }
    }

    if (!loan) {
      return res.status(404).json({ error: 'Aktif ödünç işlemi bulunamadı' });
    }

    if (loan.return_date) {
      return res.status(400).json({ error: 'Bu işlem zaten iade edilmiş' });
    }

    const now = dayjs().format('YYYY-MM-DDTHH:mm:ss');

    // İade tarihini güncelle
    db.prepare('UPDATE loans SET return_date=? WHERE id=?').run(now, loan.id);

    // Kitap mevcut sayısını güncelle
    if (loan.book_id) {
      try {
        const book = findBook({ book_id: loan.book_id });
        if (book) {
          const currentAvailable = Number(book.available) || 0;
          const copies = Number(book.copies) || currentAvailable + 1;
          const newAvailable = Math.min(currentAvailable + 1, copies);
          setBookAvailable(book.id, newAvailable);
        }
      } catch (bookError) {
        console.error('Kitap güncelleme hatası (kritik değil):', bookError);
      }
    }

    // Log kaydı ekle
    try {
      const book = loan.book_id ? findBook({ book_id: loan.book_id }) : null;
      const member = loan.member_id ? db.prepare('SELECT * FROM members WHERE id=?').get(loan.member_id) : null;
      db.prepare(`INSERT INTO kiosk_logs(action_type, book_id, member_id, isbn, student_no, success, ip_address, branch_id) 
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run('return', loan.book_id, loan.member_id, book?.isbn || isbn || null, member?.student_no || student_no || null, 1, ipFromRequest(req), loan.branch_id);
    } catch (logError) {
      console.error('Kiosk log yazma hatası:', logError);
    }

    res.json({ ok: true, message: 'İade işlemi başarılı' });
  } catch (error) {
    console.error('Kiosk return hatası:', error);
    
    // Hata durumunda log kaydı ekle
    try {
      db.prepare(`INSERT INTO kiosk_logs(action_type, book_id, member_id, isbn, student_no, success, error_message, ip_address) 
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run('return', null, null, isbn || null, student_no || null, 0, error.message, ipFromRequest(req));
    } catch (logError) {
      console.error('Kiosk error log yazma hatası:', logError);
    }
    
    res.status(500).json({ error: 'İade sırasında hata oluştu', detail: error.message });
  }
});

// Kiosk öğrencinin ödünçleri
r.get('/kiosk/my-loans', (req, res) => {
  try {
    const { member_id, student_no } = req.query;

    if (!member_id && !student_no) {
      return res.status(422).json({ error: 'member_id veya student_no gerekli' });
    }

    const member = findMember({ member_id: member_id ? Number(member_id) : null, student_no });
    if (!member) {
      return res.status(404).json({ error: 'Üye bulunamadı' });
    }

    const loans = db
      .prepare(
        `SELECT l.*, b.title AS book_title, b.isbn 
         FROM loans l 
         JOIN books b ON b.id=l.book_id 
         WHERE l.member_id=? AND l.return_date IS NULL 
         ORDER BY l.due_date ASC`
      )
      .all(member.id);

    res.json(loans);
  } catch (error) {
    console.error('Kiosk my-loans hatası:', error);
    res.status(500).json({ error: 'Ödünç listesi alınamadı', detail: error.message });
  }
});

export default r;
