# PLAN — Extended
Modüller (tamamlandı)
1) ✅ Auth: /auth/login
2) ✅ Books: CRUD + kapak yükleme + CSV/XLSX + barkod PNG + toplu ISBN
3) ✅ Members: CRUD + CSV/XLSX eksport + QR PNG + üyelik kartı PDF
4) ✅ Loans: checkout/return + gecikme hesaplama + rezervasyon kuyruğu
5) ✅ Reservations: oluştur/iptal/listele, ödünçte sıradaki rezervasyonu karşılama
6) ✅ Reports: popular JSON, overdue.pdf, circulation JSON/CSV/PDF, loans.csv
7) ✅ Settings: loan_days_default, fine_cents_per_day, okul bilgileri, SMTP yapılandırması
8) ✅ Notifications: SMTP (env/ayar) ile geciken e‑posta tetikleme
9) ✅ Public OPAC: /api/public/books
10) ✅ Backup: /api/backup/db
11) ✅ Audit: CRUD işlemleri kayıt altında
12) ✅ UI: Books, Members, Loans, Reservations, Reports, Import/Export, Settings, Public Catalog

Dağıtım
- server/ (API) — PORT=5174
- client/ (SPA) — 5173 (Vite)
