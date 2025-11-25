import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function booksTemplateXlsx(req,res){
  const rows = [{isbn:'978...', title:'Başlık', author:'Yazar', category:'Kategori', copies:1}];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'books');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="books.template.xlsx"');
  res.end(buf);
}
export function membersTemplateXlsx(req,res){
  const rows = [{
    student_no:'9B-101',
    name:'Ad Soyad',
    grade:'9B',
    phone:'05..',
    email:'mail@...',
    member_type:'Öğrenci',
    is_blocked:false,
    note:'(opsiyonel not)'
  }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'members');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="members.template.xlsx"');
  res.end(buf);
}
export function isbnBulkTemplateXlsx(req,res){
  const rows = [{isbn:'978975...', copies:1}];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'isbn');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="isbn-bulk.template.xlsx"');
  res.end(buf);
}
export function downloadBackup(req,res){
  const dbPath = path.join(__dirname,'..','data','library.db');
  if(!fs.existsSync(dbPath)) return res.status(404).json({error:'Veritabanı yok'});
  res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('Content-Disposition','attachment; filename="library-backup.db"');
  fs.createReadStream(dbPath).pipe(res);
}
