# Okul Kütüphane Otomasyonu — Extended (Express + React)
## 1) Gereksinimler
- Node.js 20+

## 2) Kurulum
### Backend
```
cd server
cp .env.example .env
npm i
npm run migrate   # mevcut veritabanını şemaya getirir
npm run seed
npm run dev   # http://localhost:5174
```
### Frontend
```
cd ../client
npm i
npm run dev   # http://localhost:5173
```
Giriş: cumhuriyet / 11062300

## 3) Özellikler (özet)
- CRUD: kitap/üye; kapak yükleme; CSV & XLSX içe/dışa aktarma; ISBN ile otomatik doldurma
- Ödünç–İade: gecikme-cezası (ayarlarla), rezervasyon kuyruğu entegrasyonu, şube kısıtları
- Barkod/QR: /api/books/barcode/:isbn.png, /api/members/qr/:id.png, kitap barkod sayfası PDF, üyelik kartı PDF
- Raporlar: popüler kitaplar (JSON), geciken PDF, aylık dolaşım (JSON/CSV/PDF), loans.csv
- Ayarlar: okul adı/logo, varsayılan ödünç günü, gecikme ücreti, SMTP yapılandırması arayüzden yönetilebilir
- OPAC: /api/public/books (login gerektirmez)
- Bildirim: raporlar ekranından tek tuşla geciken e‑posta gönderimi (SMTP opsiyonel)
- Yedek: `npm run backup`
- Üye yönetimi: askıya alma + uyarı notu, gecikmesi olan veya limit aşanlara otomatik engel (ayarlar)
- Ücretsiz senaryo desteği: para cezası ayarı varsayılan kapalı, gecikmelerde ücret yansıtılmaz
- Üye geçmişi: tek sayfada aktif/kapalı ödünçler, rezervasyonlar, blokaj geçmişi ve CSV dışa aktarım
- Envanter: raf tarama (last_seen), mükerrer ISBN listesi, şubeler arası transfer akışı, kiosk PIN kilidi, rezervasyon hazır bildirim uçları
- E-Okul senkron: EOKUL_API_URL (+ opsiyonel EOKUL_API_KEY) ile öğrencileri çekip üyelere ekleme/güncelleme

## 4) Çevre Değişkenleri
- JWT_SECRET (zorunlu)
- SMTP_* (opsiyonel bildirim)
- SMTP_TRANSPORT=json (opsiyonel, test veya debug için ağ bağlantısı olmadan göndermek isterseniz)

## 5) CSV Şablonları
- books: isbn,title,author,category,copies
- members: student_no,name,grade,phone,email

## 6) Güvenlik
- Helmet + RateLimit aktif


## Notlar
- Gecikme ücreti kuruş bazında `Ayarlar` ekranından pasif (0) veya aktif hale getirilebilir.
- Geciken raporları okul adı/logosu ile PDF çıktısı verir.


## TR Genişletmeler
- Okul adı/logo ayarı, raporlara başlık.
- OPAC filtreleri: kategori, yazar, sadece mevcut.
- XLSX şablon uçları, toplu ISBN planlayıcı, veritabanı yedeği indirme.
- Üyelik kartı PDF, barkod sayfası PDF, aylık dolaşım raporu.
