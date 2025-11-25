import db from '../db.js';
import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';
import bwipjs from 'bwip-js';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canAccessBranch, buildBranchFilter } from '../utils/branch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_REGULAR_PATH = path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, '../assets/fonts/NotoSans-Bold.ttf');
const FONT_REGULAR = 'NotoSans-Regular';
const FONT_BOLD = 'NotoSans-Bold';
let customFontsAvailable = true;
let cachedFonts = null;

function loadFontBuffer(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (err) {
    console.warn(`PDF font dosyası okunamadı: ${filePath}`, err);
    return null;
  }
}

function ensureFontCache() {
  if (cachedFonts !== null || !customFontsAvailable) return cachedFonts;
  const regular = loadFontBuffer(FONT_REGULAR_PATH);
  const bold = loadFontBuffer(FONT_BOLD_PATH);
  if (regular && bold) {
    cachedFonts = { regular, bold };
  } else {
    customFontsAvailable = false;
    cachedFonts = null;
  }
  return cachedFonts;
}

function fontsFor(weight = 'regular') {
  if (!customFontsAvailable) {
    return weight === 'bold' ? 'Helvetica-Bold' : 'Helvetica';
  }
  return weight === 'bold' ? FONT_BOLD : FONT_REGULAR;
}

function applyFont(doc, weight = 'regular', size) {
  doc.font(fontsFor(weight));
  if (size) doc.fontSize(size);
}

function createPdfDocument(options = {}) {
  const doc = new PDFDocument(options);
  const fonts = ensureFontCache();
  if (fonts) {
    try {
      doc.registerFont(FONT_REGULAR, fonts.regular);
      doc.registerFont(FONT_BOLD, fonts.bold);
    } catch (err) {
      customFontsAvailable = false;
      cachedFonts = null;
      console.warn('PDF özel fontları yüklenemedi, Helvetica kullanılacak.', err);
    }
  }
  applyFont(doc, 'regular');
  return doc;
}

function getSettingStr(key, def = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? String(row.value) : def;
}

function preparePdfResponse(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  if (filename) {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  }
}

function writeTableHeader(doc, columns) {
  doc.font(fontsFor('bold'));
  const lastIndex = columns.length - 1;
  columns.forEach((col, idx) => {
    const width = typeof col === 'object' ? col.width : undefined;
    const label = typeof col === 'object' ? col.label : col;
    doc.text(label, { width, continued: idx !== lastIndex });
  });
  doc.moveDown(0.4);
  doc.font(fontsFor('regular'));
}

function drawTableWithBorders(doc, columns, rows, startY) {
  const rowHeight = 20;
  const initialFontSize = 9;
  const minFontSize = 6;
  const padding = 5;
  let currentY = startY;
  const pageWidth = doc.page.width;
  const margin = doc.page.margins;
  const tableWidth = pageWidth - margin.left - margin.right;
  
  // Sütun genişliklerini hesapla
  const totalWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0);
  const widths = columns.map(col => ((col.width || 100) / totalWidth) * tableWidth);
  
  // Hücreye sığacak şekilde font size'ı ayarla
  function fitTextInCell(text, cellWidth, cellHeight, isHeader = false) {
    let fontSize = initialFontSize;
    const maxTextWidth = cellWidth - (padding * 2);
    const maxTextHeight = cellHeight - (padding * 2);
    
    doc.font(isHeader ? fontsFor('bold') : fontsFor('regular'));
    
    // Font size'ı küçülterek sığdırmaya çalış
    while (fontSize >= minFontSize) {
      doc.fontSize(fontSize);
      const textWidth = doc.widthOfString(text);
      const textHeight = doc.heightOfString(text, { width: maxTextWidth });
      
      // Hem genişlik hem yükseklik sığıyorsa dur
      if (textWidth <= maxTextWidth && textHeight <= maxTextHeight) {
        break;
      }
      fontSize -= 0.5;
    }
    
    // Minimum font size'a ulaşıldıysa ellipsis kullan
    if (fontSize < minFontSize) {
      fontSize = minFontSize;
      doc.fontSize(fontSize);
      // Uzun metinleri kısalt
      let truncated = text;
      let textWidth = doc.widthOfString(truncated);
      while (textWidth > maxTextWidth && truncated.length > 0) {
        truncated = truncated.substring(0, truncated.length - 1);
        textWidth = doc.widthOfString(truncated + '...');
      }
      if (truncated.length < text.length) {
        text = truncated + '...';
      }
    }
    
    return { fontSize, text };
  }
  
  // Başlık satırı
  let x = margin.left;
  currentY = startY;
  
  columns.forEach((col, idx) => {
    const width = widths[idx];
    const label = typeof col === 'object' ? col.label : col;
    
    // Hücre çerçevesi
    doc.rect(x, currentY, width, rowHeight).stroke();
    
    // Metni hücreye sığdır
    const { fontSize, text: finalText } = fitTextInCell(label, width, rowHeight, true);
    doc.fontSize(fontSize);
    const textHeight = doc.heightOfString(finalText, { width: width - (padding * 2) });
    const textY = currentY + (rowHeight - textHeight) / 2;
    
    doc.text(finalText, x + padding, textY, { 
      width: width - (padding * 2),
      align: 'center'
    });
    
    x += width;
  });
  
  // Veri satırları
  currentY += rowHeight;
  
  rows.forEach((row, rowIdx) => {
    // Sayfa sonu kontrolü
    if (currentY + rowHeight > doc.page.height - margin.bottom) {
      doc.addPage();
      currentY = margin.top;
      
      // Başlık satırını tekrar çiz
      x = margin.left;
      columns.forEach((col, idx) => {
        const width = widths[idx];
        const label = typeof col === 'object' ? col.label : col;
        doc.rect(x, currentY, width, rowHeight).stroke();
        const { fontSize, text: finalText } = fitTextInCell(label, width, rowHeight, true);
        doc.fontSize(fontSize);
        const textHeight = doc.heightOfString(finalText, { width: width - (padding * 2) });
        const textY = currentY + (rowHeight - textHeight) / 2;
        doc.text(finalText, x + padding, textY, { 
          width: width - (padding * 2),
          align: 'center'
        });
        x += width;
      });
      currentY += rowHeight;
    }
    
    x = margin.left;
    columns.forEach((col, colIdx) => {
      const width = widths[colIdx];
      const value = Array.isArray(row) ? row[colIdx] : '';
      const text = String(value || '-');
      
      // Hücre çerçevesi
      doc.rect(x, currentY, width, rowHeight).stroke();
      
      // Metni hücreye sığdır
      const { fontSize, text: finalText } = fitTextInCell(text, width, rowHeight, false);
      doc.fontSize(fontSize);
      const textHeight = doc.heightOfString(finalText, { width: width - (padding * 2) });
      const textY = currentY + (rowHeight - textHeight) / 2;
      
      doc.text(finalText, x + padding, textY, {
        width: width - (padding * 2),
        ellipsis: true
      });
      
      x += width;
    });
    
    currentY += rowHeight;
  });
  
  return currentY;
}

export function popularBooks(req, res) {
  let sql = `SELECT b.title, COUNT(l.id) AS loan_count
    FROM loans l JOIN books b ON b.id=l.book_id WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  sql += clause;
  sql += ' GROUP BY b.id ORDER BY loan_count DESC LIMIT 50';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}

export function overdueReportPdf(req, res) {
  let sql = `SELECT l.*, b.title AS book_title, m.name AS member_name
    FROM loans l JOIN books b ON b.id=l.book_id JOIN members m ON m.id=l.member_id
    WHERE l.return_date IS NULL AND DATE(l.due_date) < DATE('now')`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  sql += clause;
  sql += ' ORDER BY l.due_date ASC';
  const rows = db.prepare(sql).all(...params);

  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  const doc = createPdfDocument({ size: 'A4', margin: 40 });
  preparePdfResponse(res, 'overdue-report.pdf');
  doc.pipe(res);
  applyFont(doc, 'bold', 16);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 14);
  doc.text('GEÇİKEN İADELER RAPORU', { align: 'center' });
  doc.moveDown();
  applyFont(doc, 'regular', 11);

  if (!rows.length) {
    doc.text('Seçilen kriterlere göre geciken kayıt bulunamadı.');
  } else {
    writeTableHeader(doc, [
      { label: 'Üye', width: 140 },
      { label: 'Kitap', width: 220 },
      { label: 'Son Tarih', width: 100 },
      { label: 'Gün', width: 60 },
    ]);
    rows.forEach(r => {
      const overdueDays = dayjs().diff(dayjs(r.due_date), 'day');
      doc.text(r.member_name || '-', { width: 140, continued: true });
      doc.text(r.book_title || '-', { width: 220, continued: true });
      doc.text(r.due_date || '-', { width: 100, continued: true });
      doc.text(String(Math.max(overdueDays, 0)), { width: 60 });
    });
  }
  doc.end();
}

export function exportLoansCsv(req, res) {
  let sql = `SELECT l.id,b.title,m.name,l.loan_date,l.due_date,l.return_date,l.branch_id
    FROM loans l JOIN books b ON b.id=l.book_id JOIN members m ON m.id=l.member_id WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  sql += clause;
  sql += ' ORDER BY l.id DESC';
  const rows = db.prepare(sql).all(...params);
  // UTF-8 BOM ekle (Excel'de Türkçe karakterler için)
  const BOM = '\uFEFF';
  const header = BOM + 'ID,Kitap,Üye,Ödünç Tarihi,Son Teslim Tarihi,İade Tarihi,Şube ID\n';
  const body = rows
    .map(r =>
      [r.id, r.title || '', r.name || '', r.loan_date || '', r.due_date || '', r.return_date || '', r.branch_id ?? '']
        .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="odunc-islemleri.csv"');
  res.send(header + body);
}

function parseMonth(queryMonth) {
  const fallback = dayjs().format('YYYY-MM');
  if (!queryMonth || !/^\d{4}-\d{2}$/.test(queryMonth)) return fallback;
  return queryMonth;
}

function circulationRows({ month, user, branchQuery }) {
  const start = dayjs(`${month}-01`).startOf('month').format('YYYY-MM-DD');
  const end = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');
  let sql = `SELECT DATE(l.loan_date) AS loan_day,
      l.branch_id,
      COUNT(*) AS loans,
      SUM(CASE WHEN l.return_date IS NOT NULL THEN 1 ELSE 0 END) AS returns,
      SUM(CASE WHEN l.return_date IS NULL AND DATE(l.due_date) < DATE('now') THEN 1 ELSE 0 END) AS overdue_open,
      SUM(CASE WHEN l.return_date IS NOT NULL AND DATE(l.return_date) > DATE(l.due_date) THEN 1 ELSE 0 END) AS overdue_closed
    FROM loans l
    WHERE DATE(l.loan_date) BETWEEN ? AND ?`;
  const params = [start, end];
  const branchFilter = buildBranchFilter({
    user,
    queryValue: branchQuery,
    column: 'l.branch_id',
  });
  sql += branchFilter.clause;
  params.push(...branchFilter.params);
  sql += ' GROUP BY loan_day, l.branch_id ORDER BY loan_day ASC';
  return { rows: db.prepare(sql).all(...params), start, end };
}

function summariseCirculation(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.loans += r.loans;
      acc.returns += r.returns;
      acc.overdue_open += r.overdue_open;
      acc.overdue_closed += r.overdue_closed;
      return acc;
    },
    { loans: 0, returns: 0, overdue_open: 0, overdue_closed: 0 }
  );
}

export function circulationMonthly(req, res) {
  const month = parseMonth(req.query.month);
  const { rows, start, end } = circulationRows({
    month,
    user: req.user,
    branchQuery: req.query?.branch_id,
  });
  const totals = summariseCirculation(rows);
  res.json({ month, start_date: start, end_date: end, totals, items: rows });
}

export function circulationMonthlyCsv(req, res) {
  const month = parseMonth(req.query.month);
  const { rows, start, end } = circulationRows({
    month,
    user: req.user,
    branchQuery: req.query?.branch_id,
  });
  // UTF-8 BOM ekle (Excel'de Türkçe karakterler için)
  const BOM = '\uFEFF';
  const header = BOM + 'Tarih,Şube ID,Ödünç,İade,Açık Gecikme,Kapalı Gecikme\n';
  const body = rows
    .map(r =>
      [r.loan_day || '', r.branch_id ?? '', r.loans || 0, r.returns || 0, r.overdue_open || 0, r.overdue_closed || 0]
        .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dolasim-${month}.csv"`);
  res.send(header + body);
}

export function circulationMonthlyPdf(req, res) {
  const month = parseMonth(req.query.month);
  const { rows, start, end } = circulationRows({
    month,
    user: req.user,
    branchQuery: req.query?.branch_id,
  });
  const totals = summariseCirculation(rows);
  const doc = createPdfDocument({ size: 'A4', margin: 40 });
  preparePdfResponse(res, `circulation-${month}.pdf`);
  doc.pipe(res);
  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  applyFont(doc, 'bold', 16);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 14);
  doc.text(`Aylık Dolaşım Özeti (${month})`, { align: 'center' });
  doc.moveDown(0.5);
  applyFont(doc, 'regular', 11);
  doc.text(`Dönem: ${start} — ${end}`);
  doc.moveDown(0.5);
  doc.text(
    `Toplam Ödünç: ${totals.loans} | İade: ${totals.returns} | Açık Gecikme: ${totals.overdue_open} | Kapalı Gecikme: ${totals.overdue_closed}`
  );
  doc.moveDown();
  if (!rows.length) {
    doc.text('Kayıt bulunamadı.');
  } else {
    writeTableHeader(doc, [
      { label: 'Tarih', width: 90 },
      { label: 'Şube', width: 60 },
      { label: 'Ödünç', width: 60 },
      { label: 'İade', width: 70 },
      { label: 'Açık Gecikme', width: 90 },
      { label: 'Kapalı Gecikme', width: 90 },
    ]);
    rows.forEach(r => {
      doc.text(r.loan_day, { width: 90, continued: true });
      doc.text(r.branch_id ?? '-', { width: 60, continued: true });
      doc.text(String(r.loans), { width: 60, continued: true });
      doc.text(String(r.returns), { width: 70, continued: true });
      doc.text(String(r.overdue_open), { width: 90, continued: true });
      doc.text(String(r.overdue_closed), { width: 90 });
    });
  }
  doc.end();
}

export async function memberCardPdf(req, res) {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(id);
  if (!m) {
    return res.status(404).json({ error: 'Üye bulunamadı' });
  }
  if (!canAccessBranch(req.user, m.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  const doc = createPdfDocument({ size: 'A7', margin: 16, layout: 'landscape' });
  preparePdfResponse(res, `member-${id}-card.pdf`);
  doc.pipe(res);
  const okul = getSettingStr('okul_adi', 'KÜTÜPHANE');
  applyFont(doc, 'bold', 12);
  doc.text(okul, { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'regular', 10);
  doc.text(`Ad Soyad: ${m.name}`);
  doc.text(`Sınıf: ${m.grade || ''}`);
  doc.text(`No: ${m.student_no || ''}`);
  try {
    const qrBuffer = await QRCode.toBuffer(`member:${id}`, { margin: 1, width: 160 });
    const x = doc.page.width - doc.page.margins.right - 90;
    const y = doc.page.height - doc.page.margins.bottom - 90;
    doc.image(qrBuffer, x, y, { fit: [80, 80] });
  } catch {
    doc.moveDown();
    doc.fontSize(8).text('QR kod oluşturulamadı.');
  }
  doc.end();
}

export async function booksQrSheetPdf(req, res) {
  const idsParam = Array.isArray(req.query.ids) ? req.query.ids.join(',') : req.query?.ids;
  const ids = typeof idsParam === 'string'
    ? idsParam
        .split(',')
        .map(value => Number(value.trim()))
        .filter(n => Number.isInteger(n) && n > 0)
    : [];

  let sql = `SELECT id,isbn,title,author,publisher,branch_id
    FROM books WHERE 1=1`;
  const params = [];
  const { clause, params: branchParams } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'branch_id',
  });
  sql += clause;
  params.push(...branchParams);
  if (ids.length) {
    sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  sql += ' ORDER BY title COLLATE NOCASE ASC';
  if (!ids.length) {
    sql += ' LIMIT 120';
  }
  const rows = db.prepare(sql).all(...params);
  if (!rows.length) {
    return res.status(404).json({ error: 'Kitap bulunamadı' });
  }
  const doc = createPdfDocument({ size: 'A4', margin: 36 });
  const suffix = ids.length ? 'secililer' : 'tum';
  preparePdfResponse(res, `books-qr-${suffix}.pdf`);
  doc.pipe(res);
  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  applyFont(doc, 'bold', 16);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 12);
  doc.text('KİTAP QR ETİKETLERİ', { align: 'center' });
  doc.moveDown(0.5);
  applyFont(doc, 'regular');

  const cols = 3;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cellWidth = usableWidth / cols;
  const cellHeight = 150;
  let column = 0;
  let x = doc.page.margins.left;
  let y = doc.y;

  for (const book of rows) {
    if (column === cols) {
      column = 0;
      x = doc.page.margins.left;
      y += cellHeight;
    }
    if (y + cellHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      x = doc.page.margins.left;
      y = doc.page.margins.top;
      column = 0;
    }
    const qrSize = Math.min(cellWidth - 24, 110);
    const qrBuffer = await QRCode.toBuffer(`book:${book.id}`, { margin: 1, width: qrSize });
    const qrX = x + (cellWidth - qrSize) / 2;
    const qrY = y;
    doc.image(qrBuffer, qrX, qrY, { fit: [qrSize, qrSize] });
    const textY = qrY + qrSize + 6;
    doc.fontSize(10).text(book.title || '-', x, textY, { width: cellWidth, align: 'center' });
    doc.fontSize(8).text(book.author || '', x, doc.y + 2, { width: cellWidth, align: 'center' });
    doc.fontSize(7).text(book.isbn || '', x, doc.y + 2, { width: cellWidth, align: 'center' });
    column += 1;
    x += cellWidth;
  }

  doc.end();
}

export function membersListPdf(req, res) {
  let sql = `SELECT id,student_no,name,grade,phone,email,member_type,branch_id
    FROM members WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
  });
  sql += clause;
  sql += ' ORDER BY name COLLATE NOCASE ASC';
  const rows = db.prepare(sql).all(...params);
  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  const doc = createPdfDocument({ size: 'A4', margin: 36 });
  preparePdfResponse(res, 'kutuphane-uyeler-listesi.pdf');
  doc.pipe(res);
  applyFont(doc, 'bold', 18);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.2);
  applyFont(doc, 'bold', 16);
  doc.text('KÜTÜPHANE', { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 14);
  doc.text('ÜYE LİSTESİ', { align: 'center' });
  doc.moveDown(0.2);
  applyFont(doc, 'regular', 10);
  doc.text(`Toplam ${rows.length} üye`, { align: 'center' });
  doc.moveDown();
  if (!rows.length) {
    applyFont(doc, 'regular', 11);
    doc.text('Listelenecek üye bulunamadı.');
    doc.end();
    return;
  }
  
  const columns = [
    { label: 'ID', width: 40 },
    { label: 'No', width: 70 },
    { label: 'Ad Soyad', width: 160 },
    { label: 'Sınıf', width: 70 },
    { label: 'Telefon', width: 100 },
    { label: 'E-posta', width: 140 },
    { label: 'Tür', width: 70 },
  ];
  
  const tableRows = rows.map(r => [
    String(r.id || '-'),
    r.student_no || '-',
    r.name || '-',
    r.grade || '-',
    r.phone || '-',
    r.email || '-',
    r.member_type || '-'
  ]);
  
  drawTableWithBorders(doc, columns, tableRows, doc.y);
  doc.end();
}

export function booksListPdf(req, res) {
  let sql = `SELECT id,isbn,title,author,publisher,published_year,page_count,language,category,copies,available,shelf,cabinet,branch_id
    FROM books WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'branch_id',
  });
  sql += clause;
  if (req.query.q) {
    sql += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
    const searchTerm = `%${req.query.q}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  sql += ' ORDER BY title COLLATE NOCASE ASC';
  const rows = db.prepare(sql).all(...params);
  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  const doc = createPdfDocument({ size: 'A4', margin: 36, layout: 'landscape' });
  preparePdfResponse(res, 'kutuphane-kitaplar-listesi.pdf');
  doc.pipe(res);
  applyFont(doc, 'bold', 18);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.2);
  applyFont(doc, 'bold', 16);
  doc.text('KÜTÜPHANE', { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 14);
  doc.text('KİTAP LİSTESİ', { align: 'center' });
  doc.moveDown(0.2);
  applyFont(doc, 'regular', 10);
  doc.text(`Toplam ${rows.length} kitap`, { align: 'center' });
  doc.moveDown();
  if (!rows.length) {
    applyFont(doc, 'regular', 9);
    doc.text('Listelenecek kitap bulunamadı.');
    doc.end();
    return;
  }
  
  const columns = [
    { label: 'ID', width: 35 },
    { label: 'ISBN', width: 100 },
    { label: 'Kitap Adı', width: 180 },
    { label: 'Yazar', width: 120 },
    { label: 'Yayınevi', width: 100 },
    { label: 'Yıl', width: 45 },
    { label: 'Sayfa', width: 45 },
    { label: 'Dil', width: 60 },
    { label: 'Kategori', width: 100 },
    { label: 'Adet', width: 40 },
    { label: 'Mevcut', width: 50 },
    { label: 'Raf', width: 50 },
    { label: 'Dolap', width: 50 },
  ];
  
  const tableRows = rows.map(r => [
    String(r.id || '-'),
    r.isbn || '-',
    r.title || '-',
    r.author || '-',
    r.publisher || '-',
    r.published_year || '-',
    r.page_count ? String(r.page_count) : '-',
    r.language || '-',
    r.category || '-',
    String(r.copies || 0),
    String(r.available || 0),
    r.shelf || '-',
    r.cabinet || '-'
  ]);
  
  drawTableWithBorders(doc, columns, tableRows, doc.y);
  doc.end();
}

export function loansListPdf(req, res) {
  let sql = `SELECT l.id,l.loan_date,l.due_date,l.return_date,
    b.title AS book_title, b.isbn,
    m.name AS member_name, m.student_no,
    l.branch_id
    FROM loans l 
    JOIN books b ON b.id=l.book_id 
    JOIN members m ON m.id=l.member_id 
    WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  sql += clause;
  if (req.query.status === 'active') {
    sql += ' AND l.return_date IS NULL';
  } else if (req.query.status === 'returned') {
    sql += ' AND l.return_date IS NOT NULL';
  }
  if (req.query.q) {
    sql += ' AND (b.title LIKE ? OR m.name LIKE ? OR m.student_no LIKE ?)';
    const searchTerm = `%${req.query.q}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  sql += ' ORDER BY l.id DESC';
  const rows = db.prepare(sql).all(...params);
  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  const doc = createPdfDocument({ size: 'A4', margin: 36, layout: 'landscape' });
  preparePdfResponse(res, 'kutuphane-islemler-listesi.pdf');
  doc.pipe(res);
  applyFont(doc, 'bold', 18);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.2);
  applyFont(doc, 'bold', 16);
  doc.text('KÜTÜPHANE', { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 14);
  doc.text('ÖDÜNÇ İŞLEMLERİ LİSTESİ', { align: 'center' });
  doc.moveDown(0.2);
  applyFont(doc, 'regular', 10);
  doc.text(`Toplam ${rows.length} işlem`, { align: 'center' });
  doc.moveDown();
  if (!rows.length) {
    applyFont(doc, 'regular', 9);
    doc.text('Listelenecek işlem bulunamadı.');
    doc.end();
    return;
  }
  
  const columns = [
    { label: 'ID', width: 35 },
    { label: 'Kitap', width: 180 },
    { label: 'ISBN', width: 100 },
    { label: 'Üye', width: 140 },
    { label: 'Okul No', width: 80 },
    { label: 'Ödünç Tarihi', width: 90 },
    { label: 'Son Teslim', width: 90 },
    { label: 'İade Tarihi', width: 90 },
    { label: 'Durum', width: 70 },
  ];
  
  const today = dayjs().format('YYYY-MM-DD');
  const tableRows = rows.map(r => {
    const isOverdue = !r.return_date && r.due_date < today;
    const status = r.return_date ? 'İade Edildi' : isOverdue ? 'Gecikmiş' : 'Aktif';
    return [
      String(r.id || '-'),
      r.book_title || '-',
      r.isbn || '-',
      r.member_name || '-',
      r.student_no || '-',
      r.loan_date ? dayjs(r.loan_date).format('DD.MM.YYYY') : '-',
      r.due_date ? dayjs(r.due_date).format('DD.MM.YYYY') : '-',
      r.return_date ? dayjs(r.return_date).format('DD.MM.YYYY') : '-',
      status
    ];
  });
  
  drawTableWithBorders(doc, columns, tableRows, doc.y);
  doc.end();
}

export async function membersQrSheetPdf(req, res) {
  const idsParam = Array.isArray(req.query.ids) ? req.query.ids.join(',') : req.query?.ids;
  const ids = typeof idsParam === 'string'
    ? idsParam
        .split(',')
        .map(value => Number(value.trim()))
        .filter(n => Number.isInteger(n) && n > 0)
    : [];

  let sql = `SELECT id,name,student_no,grade,member_type,branch_id
    FROM members WHERE 1=1`;
  const params = [];
  const { clause, params: branchParams } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
  });
  sql += clause;
  params.push(...branchParams);
  if (ids.length) {
    sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  sql += ' ORDER BY name COLLATE NOCASE ASC';
  if (!ids.length) {
    sql += ' LIMIT 120';
  }
  const rows = db.prepare(sql).all(...params);
  if (!rows.length) {
    return res.status(404).json({ error: 'Üye bulunamadı' });
  }
  const doc = createPdfDocument({ size: 'A4', margin: 36 });
  const suffix = ids.length ? 'secililer' : 'tum';
  preparePdfResponse(res, `members-qr-${suffix}.pdf`);
  doc.pipe(res);
  const okulAdi = getSettingStr('okul_adi', 'KÜTÜPHANE');
  applyFont(doc, 'bold', 16);
  doc.text(okulAdi, { align: 'center' });
  doc.moveDown(0.3);
  applyFont(doc, 'bold', 12);
  doc.text('ÜYE QR ETİKETLERİ', { align: 'center' });
  doc.moveDown(0.5);
  applyFont(doc, 'regular');

  const cols = 3;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cellWidth = usableWidth / cols;
  const cellHeight = 150;
  let column = 0;
  let x = doc.page.margins.left;
  let y = doc.y;

  for (const member of rows) {
    if (column === cols) {
      column = 0;
      x = doc.page.margins.left;
      y += cellHeight;
    }
    if (y + cellHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      x = doc.page.margins.left;
      y = doc.page.margins.top;
      column = 0;
    }
    const qrSize = Math.min(cellWidth - 24, 110);
    const qrBuffer = await QRCode.toBuffer(`member:${member.id}`, { margin: 1, width: qrSize });
    const qrX = x + (cellWidth - qrSize) / 2;
    const qrY = y;
    doc.image(qrBuffer, qrX, qrY, { fit: [qrSize, qrSize] });
    const textY = qrY + qrSize + 6;
    doc.fontSize(11).text(member.name || '-', x, textY, { width: cellWidth, align: 'center' });
    doc.fontSize(9).text(member.student_no || '', x, doc.y + 2, { width: cellWidth, align: 'center' });
    doc.fontSize(8).text(member.grade || '', x, doc.y + 2, { width: cellWidth, align: 'center' });
    column += 1;
    x += cellWidth;
  }

  doc.end();
}
