import db from '../db.js';
import dayjs from 'dayjs';
import { buildBranchFilter, canAccessBranch } from '../utils/branch.js';
import { sendSms } from '../utils/sms.js';

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (row && row.value !== undefined && row.value !== null) {
    const num = Number(row.value);
    return Number.isFinite(num) ? num : row.value;
  }
  return fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const str = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'evet', 'on'].includes(str)) return true;
  if (['0', 'false', 'no', 'hayir', 'hayır', 'off'].includes(str)) return false;
  return fallback;
}

function getBooleanSetting(key, fallback = false) {
  const raw = getSetting(key, fallback ? '1' : '0');
  return toBoolean(raw, fallback);
}

function getNumericSetting(key, fallback = 0) {
  const raw = getSetting(key, fallback);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function memberLoanStats(memberId) {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN return_date IS NULL THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN return_date IS NULL AND date(due_date) < date('now') THEN 1 ELSE 0 END) AS overdue
       FROM loans
       WHERE member_id=?`
    )
    .get(memberId);
  return {
    active: Number(row?.active ?? 0),
    overdue: Number(row?.overdue ?? 0),
  };
}

function findBook({ book_id, isbn }) {
  if (book_id) {
    return db.prepare('SELECT * FROM books WHERE id=?').get(book_id);
  }
  if (isbn) {
    // ISBN'i temizle (boşluklar, tireler vs.) - sadece rakamlar ve X harfi
    const cleanIsbn = String(isbn || '').trim().replace(/[\s-]/g, '');
    if (!cleanIsbn) return null;
    
    // Önce tam eşleşme dene (hem orijinal hem temizlenmiş)
    let book = db.prepare('SELECT * FROM books WHERE isbn=?').get(isbn);
    if (book) return book;
    
    book = db.prepare('SELECT * FROM books WHERE isbn=?').get(cleanIsbn);
    if (book) return book;
    
    // Temizlenmiş versiyonla dene (boşluk ve tire olmadan)
    book = db.prepare('SELECT * FROM books WHERE REPLACE(REPLACE(isbn, \' \', \'\'), \'-\', \'\')=?').get(cleanIsbn);
    if (book) return book;
    
    // Son olarak LIKE ile dene (kısmi eşleşme)
    book = db.prepare('SELECT * FROM books WHERE REPLACE(REPLACE(isbn, \' \', \'\'), \'-\', \'\') LIKE ? LIMIT 1').get(`%${cleanIsbn}%`);
    if (book) return book;
    
    // Son çare: son 10 karakter ile eşleş (ISBN-13'ün son 10'u genelde ISBN-10'a benzer)
    if (cleanIsbn.length >= 10) {
      const last10 = cleanIsbn.slice(-10);
      book = db.prepare('SELECT * FROM books WHERE REPLACE(REPLACE(isbn, \' \', \'\'), \'-\', \'\') LIKE ? LIMIT 1').get(`%${last10}%`);
      if (book) return book;
    }
    
    return null;
  }
  return null;
}

function activeLoanCount(bookId) {
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS cnt FROM loans WHERE book_id=? AND return_date IS NULL')
      .get(bookId);
    return Number(row?.cnt ?? 0);
  } catch (error) {
    console.error('activeLoanCount hatası:', error);
    return 0;
  }
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
    const remaining = copies - activeLoanCount(book.id);
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

function findMember({ member_id, student_no }) {
  if (member_id) {
    return db.prepare('SELECT * FROM members WHERE id=?').get(member_id);
  }
  if (student_no) {
    // student_no hem string hem sayı olabilir
    const cleanStudentNo = String(student_no).trim();
    return db.prepare('SELECT * FROM members WHERE student_no=?').get(cleanStudentNo);
  }
  return null;
}

export function listLoans(req, res) {
  let sql = `SELECT l.*, b.title AS book_title, b.isbn AS isbn, m.name AS member_name, m.student_no
    FROM loans l JOIN books b ON b.id=l.book_id JOIN members m ON m.id=l.member_id WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 'l.branch_id',
  });
  sql += clause;
  const filters = [];
  if (req.query.status === 'active') {
    sql += ' AND l.return_date IS NULL';
  } else if (req.query.status === 'returned') {
    sql += ' AND l.return_date IS NOT NULL';
  }
  if (req.query.q) {
    sql += ' AND (b.title LIKE ? OR m.name LIKE ? OR m.student_no LIKE ? OR b.isbn LIKE ?)';
    filters.push(
      `%${req.query.q}%`,
      `%${req.query.q}%`,
      `%${req.query.q}%`,
      `%${req.query.q}%`
    );
  }
  sql += ' ORDER BY l.id DESC';
  const rows = db.prepare(sql).all(...params, ...filters);
  res.json(rows);
}

export function checkout(req, res) {
  try {
    // req.user kontrolü
    if (!req.user) {
      console.error('Checkout: req.user tanımsız');
      return res.status(401).json({ error: 'Yetkilendirme hatası' });
    }
    
    const { book_id, member_id, isbn, student_no, due_date } = req.body;
    
    console.log('Checkout isteği:', { book_id, isbn, member_id, student_no, due_date, user: req.user.email });
    
    // Validasyon
    if (!book_id && !isbn) {
      return res.status(422).json({ error: 'Kitap ID veya ISBN gerekli' });
    }
    if (!member_id && !student_no) {
      return res.status(422).json({ error: 'Üye ID veya okul numarası gerekli' });
    }
    
    const book = findBook({ book_id, isbn });
    console.log('Bulunan kitap:', book ? { id: book.id, title: book.title, isbn: book.isbn } : null);
    if (!book) {
      return res.status(404).json({ error: `ISBN "${isbn || book_id}" ile kitap bulunamadı` });
    }
    
    const availableCount = calculateAvailable(book);
    console.log('Mevcut kitap sayısı:', availableCount);
    if (availableCount <= 0) {
      return res.status(400).json({ error: 'Kitap uygun değil (stokta yok)' });
    }
    
    if (!canAccessBranch(req.user, book.branch_id)) {
      return res.status(403).json({ error: 'Kitabın şubesine erişim yetkiniz yok' });
    }

    const member = findMember({ member_id, student_no });
    console.log('Bulunan üye:', member ? { id: member.id, name: member.name, student_no: member.student_no } : null);
    if (!member) {
      return res.status(404).json({ error: `Okul numarası "${student_no || member_id}" ile üye bulunamadı` });
    }
    
    if (!canAccessBranch(req.user, member.branch_id)) {
      return res.status(403).json({ error: 'Üyenin şubesine erişim yetkiniz yok' });
    }

    if (member.is_blocked) {
      return res.status(403).json({
        error: 'Üye askıya alınmış. Önce üye durumunu güncelleyin.',
        note: member.note || null,
        code: 'member_blocked',
      });
    }

    // SMS ile bilgilendirme (isteğe bağlı)
    if (req.body?.notify === 'sms' && member.phone) {
      sendSms({
        to: member.phone,
        message: `${member.name}, "${book.title}" kitabını teslim aldınız. Son tarih ${due}.`,
      }).catch(() => {});
    }

    const stats = memberLoanStats(member.id);
    const maxActive = getNumericSetting('max_active_loans', 0);
    if (Number.isFinite(maxActive) && maxActive > 0 && stats.active >= maxActive) {
      return res.status(409).json({
        error: `Üye en fazla ${maxActive} aktif ödünç alabilir.`,
        active_loans: stats.active,
        limit: maxActive,
        code: 'loan_limit',
      });
    }

    if (getBooleanSetting('block_on_overdue', true) && stats.overdue > 0) {
      return res.status(409).json({
        error: 'Üyenin gecikmiş iadesi var. Önce geciken kitapları iade alın.',
        overdue_loans: stats.overdue,
        code: 'overdue_block',
      });
    }

    // Rezervasyon kontrolü
    const reservations = db
      .prepare("SELECT * FROM reservations WHERE book_id=? AND status='active' ORDER BY id ASC")
      .all(book.id);
    if (reservations.length) {
      if (reservations[0].member_id !== member.id) {
        return res.status(409).json({ error: 'Rezervasyon sırası var' });
      }
      db.prepare("UPDATE reservations SET status='fulfilled' WHERE id=?").run(reservations[0].id);
    }

    // Tarih hesaplama
    const defaultDays = getSetting('loan_days_default', 15);
    let due;
    if (due_date) {
      // Türkçe format (DD.MM.YYYY) veya ISO format (YYYY-MM-DD) destekle
      let parsed = dayjs(due_date);
      if (!parsed.isValid() && typeof due_date === 'string') {
        // DD.MM.YYYY formatını dene
        const parts = due_date.split('.');
        if (parts.length === 3) {
          parsed = dayjs(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
      }
      if (!parsed.isValid()) {
        return res.status(422).json({ error: `Geçersiz tarih formatı: "${due_date}"` });
      }
      due = parsed.format('YYYY-MM-DD');
    } else {
      due = dayjs().add(defaultDays, 'day').format('YYYY-MM-DD');
    }

    console.log('Ödünç verme kaydı oluşturuluyor:', { book_id: book.id, member_id: member.id, due, branch_id: book.branch_id });
    console.log('req.user:', req.user ? { id: req.user.id, email: req.user.email } : 'undefined');

    // Ödünç verme kaydı oluştur - loan_date otomatik olarak DEFAULT (DATE('now')) ile doldurulacak
    try {
      const insertStmt = db.prepare('INSERT INTO loans(book_id,member_id,due_date,branch_id,loan_date) VALUES (?,?,?,?,?)');
      const now = dayjs();
      const nowStr = now.format('YYYY-MM-DDTHH:mm:ss');
      
      console.log('INSERT parametreleri:', { 
        book_id: book.id, 
        member_id: member.id, 
        due_date: due, 
        branch_id: book.branch_id || null,
        loan_date: nowStr
      });
      
      const result = insertStmt.run(
        book.id,
        member.id,
        due,
        book.branch_id || null, // branch_id NULL olabilir
        nowStr
      );
      
      console.log('INSERT başarılı, son ID:', result.lastInsertRowid);
    } catch (dbError) {
      console.error('Veritabanı hatası:', dbError);
      console.error('Hata detayı:', {
        message: dbError.message,
        code: dbError.code,
        stack: dbError.stack
      });
      return res.status(500).json({ error: 'Veritabanı hatası', detail: dbError.message });
    }
    
    // Mevcut kitap sayısını güncelle
    setBookAvailable(book.id, Math.max(availableCount - 1, 0));
    
    console.log('Ödünç verme başarılı');
    res.json({ ok: true, due_date: due });
  } catch (error) {
    console.error('Checkout hatası:', error);
    console.error('Hata stack:', error.stack);
    res.status(500).json({ error: 'Ödünç verme sırasında hata oluştu', detail: error.message });
  }
}

export function returnBook(req, res) {
  try {
    console.log('ReturnBook called with:', { body: req.body, user: req.user?.email || 'NO USER' });
    
    // req.user kontrolü
    if (!req.user) {
      console.error('ReturnBook: req.user tanımsız');
      return res.status(401).json({ error: 'Yetkilendirme hatası' });
    }
    
    const { loan_id, isbn, student_no } = req.body;
    
    console.log('ReturnBook isteği:', { loan_id, isbn, student_no, user: req.user.email });
    
    // Validasyon
    if (!loan_id && (!isbn || !student_no)) {
      return res.status(422).json({ error: 'İşlem ID veya ISBN+Okul numarası gerekli' });
    }
    
    let loan = null;
    if (loan_id) {
      loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loan_id);
      console.log('Loan ID ile bulundu:', loan ? { id: loan.id, book_id: loan.book_id } : null);
    } else if (isbn && student_no) {
      // ISBN'i temizle (findBook gibi)
      const cleanIsbn = String(isbn || '').trim().replace(/[\s-]/g, '');
      const cleanStudentNo = String(student_no || '').trim();
      
      console.log('ISBN ve student_no ile aranıyor:', { isbn, cleanIsbn, student_no: cleanStudentNo });
      
      try {
        // Önce temizlenmiş ISBN ile dene
        console.log('ReturnBook: İlk sorgu deneniyor', { cleanIsbn, cleanStudentNo });
        loan = db
          .prepare(
            `SELECT l.* FROM loans l
             JOIN books b ON b.id=l.book_id
             JOIN members m ON m.id=l.member_id
             WHERE l.return_date IS NULL AND REPLACE(REPLACE(b.isbn, \' \', \'\'), \'-\', \'\')=? AND m.student_no=?`
          )
          .get(cleanIsbn, cleanStudentNo);
        console.log('ReturnBook: İlk sorgu sonucu', loan ? 'Bulundu' : 'Bulunamadı');
      } catch (queryError) {
        console.error('ReturnBook: İlk sorgu hatası', queryError);
        throw queryError;
      }
      
      // Bulunamadıysa orijinal ISBN ile dene
      if (!loan) {
        try {
          console.log('ReturnBook: İkinci sorgu deneniyor', { isbn, cleanStudentNo });
          loan = db
            .prepare(
              `SELECT l.* FROM loans l
               JOIN books b ON b.id=l.book_id
               JOIN members m ON m.id=l.member_id
               WHERE l.return_date IS NULL AND b.isbn=? AND m.student_no=?`
            )
            .get(isbn, cleanStudentNo);
          console.log('ReturnBook: İkinci sorgu sonucu', loan ? 'Bulundu' : 'Bulunamadı');
        } catch (queryError) {
          console.error('ReturnBook: İkinci sorgu hatası', queryError);
          throw queryError;
        }
      }
      
      console.log('ISBN/student_no ile bulundu:', loan ? { id: loan.id, book_id: loan.book_id } : null);
    }
    
    if (!loan) {
      return res.status(404).json({ error: 'Aktif ödünç işlemi bulunamadı' });
    }
    
    if (loan.return_date) {
      return res.status(400).json({ error: 'Bu işlem zaten iade edilmiş' });
    }
    
    if (!canAccessBranch(req.user, loan.branch_id)) {
      return res.status(403).json({ error: 'Şube yetkiniz yok' });
    }
    
    const now = dayjs();
    const nowStr = now.format('YYYY-MM-DDTHH:mm:ss');
    
    // Fine hesaplama (fine_cents kolonu varsa)
  let fine = 0;
  try {
    const fineEnabled = getBooleanSetting('fine_enabled', false);
    if (fineEnabled) {
      const fineDay = getSetting('fine_cents_per_day', 200);
      const late = now.diff(dayjs(loan.due_date), 'day');
      if (late > 0) fine = late * fineDay;
    } else {
      fine = 0;
    }
  } catch (fineError) {
    console.warn('Fine hesaplama hatası (göz ardı ediliyor):', fineError);
  }
    
    // return_date güncelle (fine_cents kolonu şu an veritabanında yok)
    try {
      console.log('Loan güncelleniyor:', { loan_id: loan.id, return_date: nowStr });
      const updateStmt = db.prepare('UPDATE loans SET return_date=? WHERE id=?');
      updateStmt.run(nowStr, loan.id);
      console.log('Loan return_date başarıyla güncellendi');
    } catch (updateError) {
      console.error('Loan güncelleme hatası:', updateError);
      console.error('Hata detayı:', {
        message: updateError.message,
        code: updateError.code,
        stack: updateError.stack
      });
      return res.status(500).json({ 
        error: 'İade kaydı güncellenemedi', 
        detail: updateError.message 
      });
    }
    
    // Kitap mevcut sayısını güncelle (hataları yoksay, kritik değil)
    if (loan.book_id) {
      try {
        console.log('Kitap bilgisi aranıyor:', { book_id: loan.book_id });
        const book = findBook({ book_id: loan.book_id });
        if (!book) {
          console.warn('İade edilen kitap bulunamadı:', { book_id: loan.book_id });
        } else {
          console.log('Kitap bulundu:', { book_id: book.id, title: book.title, available: book.available, copies: book.copies });
          
          // Basit güncelleme: mevcut available değerini 1 artır
          const currentAvailable = Number(book.available) || 0;
          const copies = Number(book.copies) || currentAvailable + 1;
          const newAvailable = Math.min(currentAvailable + 1, copies);
          
          console.log('Kitap mevcut sayısı güncelleniyor:', { 
            book_id: book.id, 
            currentAvailable, 
            newAvailable 
          });
          
          if (book.id) {
            setBookAvailable(book.id, newAvailable);
            console.log('Kitap mevcut sayısı başarıyla güncellendi');
          }
        }
      } catch (bookError) {
        console.error('Kitap mevcut sayısı güncelleme hatası (kritik değil):', bookError);
        console.error('Kitap hata detayı:', {
          message: bookError?.message || String(bookError),
          stack: bookError?.stack
        });
        // Bu hata kritik değil, iade işlemi devam edebilir
      }
    } else {
      console.warn('Loan kaydında book_id yok:', { loan_id: loan.id });
    }
    
    console.log('İade işlemi başarılı:', { loan_id: loan.id, fine });
    res.json({ ok: true, fine_cents: fine });
  } catch (error) {
    console.error('ReturnBook hatası:', error);
    console.error('ReturnBook hatası - stack:', error.stack);
    console.error('ReturnBook hatası - name:', error.name);
    console.error('ReturnBook hatası - message:', error.message);
    res.status(500).json({ error: 'İade alınırken hata oluştu', detail: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
}


export function extendLoan(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Yetkilendirme hatası' });
    }

    const rawId = req.params?.loanId ?? req.body?.loan_id ?? req.body?.id;
    const rawDays = req.body?.days ?? req.query?.days;
    const loanId = Number(rawId);
    if (!loanId) {
      return res.status(422).json({ error: 'Geçerli bir işlem ID gereklidir' });
    }

    let days = Number(rawDays ?? 15);
    if (!Number.isFinite(days) || days <= 0) {
      days = 15;
    }

    const loan = db
      .prepare(
        `SELECT l.*, 
                COALESCE(l.branch_id, b.branch_id) AS effective_branch_id,
                b.title AS book_title,
                m.name AS member_name
           FROM loans l
           LEFT JOIN books b ON b.id = l.book_id
           LEFT JOIN members m ON m.id = l.member_id
          WHERE l.id=?`
      )
      .get(loanId);

    if (!loan) {
      return res.status(404).json({ error: 'İşlem bulunamadı' });
    }

    if (loan.return_date) {
      return res.status(400).json({ error: 'İade edilmiş işlemler uzatılamaz' });
    }

    if (!canAccessBranch(req.user, loan.effective_branch_id)) {
      return res.status(403).json({ error: 'Şube yetkiniz yok' });
    }

    const currentDue = loan.due_date ? dayjs(loan.due_date) : dayjs();
    if (!currentDue.isValid()) {
      return res.status(422).json({ error: 'Geçersiz mevcut son teslim tarihi' });
    }

    const newDueDate = currentDue.add(days, 'day').format('YYYY-MM-DDTHH:mm:ss');
    db.prepare('UPDATE loans SET due_date=? WHERE id=?').run(newDueDate, loanId);

    res.json({
      ok: true,
      loan_id: loanId,
      due_date: newDueDate,
      days_added: days,
    });
  } catch (error) {
    console.error('extendLoan hatası:', error);
    res.status(500).json({
      error: 'Süre uzatma sırasında hata oluştu',
      detail: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

export function checkLoan(req, res) {
  try {
    console.log('CheckLoan called with:', { body: req.body, user: req.user?.email || 'NO USER' });
    
    // Test database connection
    try {
      db.prepare('SELECT 1').get();
      console.log('CheckLoan: Database connection OK');
    } catch (dbTestError) {
      console.error('CheckLoan: Database connection test failed:', dbTestError);
      throw new Error(`Database connection error: ${dbTestError.message}`);
    }
    
    const { isbn, student_no } = req.body || {};
    if (!isbn || !student_no) {
      return res.status(422).json({ error: 'ISBN ve okul numarası gerekli' });
    }
    
    // ISBN'i temizle
    const cleanIsbn = String(isbn || '').trim().replace(/[\s-]/g, '');
    const cleanStudentNo = String(student_no || '').trim();
    
    console.log('CheckLoan: Cleaned values', { cleanIsbn, cleanStudentNo, originalIsbn: isbn, originalStudentNo: student_no });
    
    // Önce temizlenmiş ISBN ile dene
    let row;
    try {
      console.log('CheckLoan: İlk sorgu deneniyor', { cleanIsbn, cleanStudentNo });
      row = db
        .prepare(
          `SELECT l.*, b.title AS book_title, m.name AS member_name
           FROM loans l
           JOIN books b ON b.id = l.book_id
           JOIN members m ON m.id = l.member_id
           WHERE l.return_date IS NULL AND REPLACE(REPLACE(b.isbn, ' ', ''), '-', '')=? AND m.student_no=?`
        )
        .get(cleanIsbn, cleanStudentNo);
      console.log('CheckLoan: İlk sorgu sonucu', row ? 'Bulundu' : 'Bulunamadı');
    } catch (queryError) {
      console.error('CheckLoan: İlk sorgu hatası', queryError);
      throw queryError;
    }
    
    // Bulunamadıysa orijinal ISBN ile dene
    if (!row) {
      try {
        console.log('CheckLoan: İkinci sorgu deneniyor', { isbn, cleanStudentNo });
        row = db
          .prepare(
            `SELECT l.*, b.title AS book_title, m.name AS member_name
             FROM loans l
             JOIN books b ON b.id = l.book_id
             JOIN members m ON m.id = l.member_id
             WHERE l.return_date IS NULL AND b.isbn=? AND m.student_no=?`
          )
          .get(isbn, cleanStudentNo);
        console.log('CheckLoan: İkinci sorgu sonucu', row ? 'Bulundu' : 'Bulunamadı');
      } catch (queryError) {
        console.error('CheckLoan: İkinci sorgu hatası', queryError);
        throw queryError;
      }
    }
    
    if (!row) return res.status(404).json({ error: 'Aktif işlem bulunamadı' });
    res.json(row);
  } catch (error) {
    console.error('CheckLoan hatası:', error);
    console.error('CheckLoan hatası - stack:', error.stack);
    console.error('CheckLoan hatası - name:', error.name);
    console.error('CheckLoan hatası - message:', error.message);
    res.status(500).json({ error: 'İşlem kontrolü sırasında hata oluştu', detail: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
}
