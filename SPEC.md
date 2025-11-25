# SPEC — Okul Kütüphane Otomasyonu (Extended, JS Full-Stack)
Kapsam (end-to-end):
- Kimlik Doğrulama: JWT, roller (admin, staff)
- Envanter: kitaplar (kapak resmi, barkod/QR), çoklu şube desteği
- Üyeler: öğrenciler, iletişim, QR kimlik
- Dolaşım: ödünç–iade, rezervasyon (sıra), gecikme-cezası (yapılandırılabilir)
- Arama/Filtre: başlık, yazar, ISBN, kategori, şube
- Raporlama: popüler kitaplar, gecikenler, aylık dolaşım (JSON/CSV/PDF)
- Veri İşleme: CSV içe/dışa aktarma (kitap/üye)
- Bildirimler: e‑posta ile geciken iade uyarısı (SMTP)
- Audit Log: CRUD işlemleri
- Yedekleme: SQLite dosyası indirme
- OPAC: genel katalog (public endpoint)
- Barkod/QR: ISBN barkod PNG, üye QR PNG
- Kapak Yükleme: kapak görseli servis etme
- Ayarlar: gecikme bedeli, varsayılan ödünç günü
Teknoloji: Node.js (Express) + SQLite (better-sqlite3) + React (Vite) + Tailwind.
