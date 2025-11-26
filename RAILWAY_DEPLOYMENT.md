# 🚂 EGELI Kütüphane Sistemi - Railway Deployment Rehberi

Bu rehber, EGELI Kütüphane Sistemi'nin Railway platformunda deployment sürecini adım adım açıklar.

## 📋 Ön Gereksinimler

- ✅ Railway hesabı (https://railway.app)
- ✅ GitHub repository: `derinmehmetali68-max/EGELI`
- ✅ Railway CLI (opsiyonel ama önerilir)

## 🎯 Deployment Stratejisi

Railway API kısıtlamaları nedeniyle **hibrid yaklaşım** kullanıyoruz:

### Otomatik Adımlar (Script ile)
- Environment variables ayarlama
- Temel konfigürasyon

### Manuel Adımlar (Railway Dashboard)
- GitHub repository bağlantısı
- Persistent volume ekleme
- Domain oluşturma

---

## 🚀 ADIM 1: Otomatik Konfigürasyon (Script)

### 1.1 Railway CLI Kurulumu

```bash
# npm ile
npm install -g @railway/cli

# veya Homebrew ile (macOS)
brew install railway
```

### 1.2 Deployment Script'ini Çalıştırın

```bash
cd /Users/ege86/Desktop/egeli/\ nodejs.\ kutuphane
./deploy-railway.sh
```

Script şunları yapar:
- ✅ Railway'e giriş yapar
- ✅ Backend environment variables ayarlar
- ✅ Frontend environment variables ayarlar
- ✅ Size manuel adımları hatırlatır

---

## 🔧 ADIM 2: Backend Servisi Yapılandırma (Manuel)

### 2.1 Railway Dashboard'a Gidin

🔗 **Dashboard URL:** https://railway.app/project/eab6bd67-26a6-43dd-95e8-7a81eacb8a94

### 2.2 GitHub Repository Bağlantısı

1. **Backend** servisine tıklayın
2. **Settings** → **Source** sekmesine gidin
3. **Connect Repository** butonuna tıklayın
4. Repository seçin: `derinmehmetali68-max/EGELI`
5. Şu ayarları yapın:
   - **Root Directory:** `server`
   - **Build Command:** (boş bırakın, Dockerfile kullanacak)
   - **Start Command:** (boş bırakın, Dockerfile kullanacak)
6. **Connect** butonuna tıklayın

### 2.3 Persistent Volume Ekleme (KRİTİK! 🔴)

> **Uyarı:** Bu adım çok önemli! SQLite veritabanı için persistent volume gerekli, yoksa her deployment'ta veriler kaybolur.

1. Backend servisinde **Settings** → **Volumes** sekmesine gidin
2. **Add Volume** butonuna tıklayın
3. Şu ayarları yapın:
   - **Mount Path:** `/app/server/data`
   - **Size:** `1 GB` (veya daha fazla)
4. **Add** butonuna tıklayın

### 2.4 Environment Variables Kontrolü

**Settings** → **Variables** sekmesinde şu değişkenlerin olduğunu kontrol edin (script tarafından eklenmiş olmalı):

```
JWT_SECRET=SmmE3RbKuunZReJDx1AboIvA5w5CzDL9Flw0p4095xhJn0p8ReVAwVohIrB7
PORT=5174
NODE_ENV=production
DB_PATH=/app/server/data/library.db
ADMIN_EMAIL=admin@egeli.com
ADMIN_PASSWORD=Admin123!
```

### 2.5 Deployment'ı Bekleyin

- GitHub bağlantısı yapıldıktan sonra otomatik deployment başlar
- **Deployments** sekmesinden ilerlemeyi takip edin
- 5-10 dakika sürebilir

---

## 🎨 ADIM 3: Frontend Servisi Yapılandırma (Manuel)

### 3.1 GitHub Repository Bağlantısı

1. **Frontend** servisine tıklayın
2. **Settings** → **Source** sekmesine gidin
3. **Connect Repository** butonuna tıklayın
4. Repository seçin: `derinmehmetali68-max/EGELI`
5. Şu ayarları yapın:
   - **Root Directory:** `client`
   - **Build Command:** (boş bırakın, Dockerfile kullanacak)
   - **Start Command:** (boş bırakın, Dockerfile kullanacak)
6. **Connect** butonuna tıklayın

### 3.2 Environment Variables

Şu an sadece `NODE_ENV=production` olmalı (script tarafından eklendi).

> **Not:** Backend URL'ini deployment tamamlandıktan sonra ekleyeceğiz.

### 3.3 Deployment'ı Bekleyin

- İlk deployment başlayacak
- 5-10 dakika sürebilir

---

## 🌐 ADIM 4: Domain ve URL Ayarları

### 4.1 Backend Domain Oluşturma

1. **Backend** servisine gidin
2. **Settings** → **Networking** sekmesine gidin
3. **Generate Domain** butonuna tıklayın
4. Oluşturulan URL'i kopyalayın (örn: `https://backend-production-xxxx.up.railway.app`)

### 4.2 Frontend'e Backend URL Ekleme

1. **Frontend** servisine gidin
2. **Settings** → **Variables** sekmesine gidin
3. Yeni variable ekleyin:
   ```
   VITE_API_URL=<backend-url-buraya>
   ```
   Örnek: `VITE_API_URL=https://backend-production-xxxx.up.railway.app`
4. **Add** butonuna tıklayın
5. Frontend otomatik olarak yeniden deploy olacak

### 4.3 Frontend Domain Oluşturma

1. **Frontend** servisine gidin
2. **Settings** → **Networking** sekmesine gidin
3. **Generate Domain** butonuna tıklayın
4. Oluşturulan URL'i kopyalayın (örn: `https://frontend-production-xxxx.up.railway.app`)

---

## 💾 ADIM 5: Database Migration ve Seed

Backend deployment tamamlandıktan sonra veritabanını hazırlamalıyız.

### 5.1 Railway CLI ile Shell Açma

```bash
# Backend servisine bağlan
railway shell --service=30d4608f-e617-4c52-a7a6-4e0a373126d1
```

### 5.2 Migration ve Seed Çalıştırma

Railway shell içinde:

```bash
# Migration çalıştır
npm run migrate

# Seed data ekle (admin kullanıcı + örnek veriler)
npm run seed
```

### 5.3 Kontrol

Migration ve seed loglarını kontrol edin. Başarılı olduğunu doğrulayın.

---

## ✅ ADIM 6: Test ve Doğrulama

### 6.1 Frontend URL'ine Erişim

Browser'da frontend URL'inizi açın:
```
https://frontend-production-xxxx.up.railway.app
```

### 6.2 Admin Girişi

Giriş bilgileri:
- **Email:** `admin@egeli.com`
- **Şifre:** `Admin123!`

> **Güvenlik:** İlk girişten sonra mutlaka şifrenizi değiştirin!

### 6.3 Fonksiyon Testleri

- ✅ Kitap ekleme/düzenleme/silme
- ✅ Üye ekleme/düzenleme/silme
- ✅ Ödünç verme işlemi
- ✅ İade işlemi
- ✅ Raporları görüntüleme
- ✅ Barkod tarama (varsa)

---

## 🎊 Tamamlandı!

### 📊 Deployment Özeti

| Öğe | Değer |
|-----|-------|
| **Proje Adı** | EGELI-Kutuphane |
| **Proje ID** | eab6bd67-26a6-43dd-95e8-7a81eacb8a94 |
| **Backend Service ID** | 30d4608f-e617-4c52-a7a6-4e0a373126d1 |
| **Frontend Service ID** | 85e4e94d-c9c3-45a7-9599-45ee3d9da3f8 |
| **Backend URL** | (Railway Dashboard'dan aldınız) |
| **Frontend URL** | (Railway Dashboard'dan aldınız) |

---

## 🔧 Troubleshooting

### Backend Başlamıyor

**Kontrol Listesi:**
- [ ] Persistent volume `/app/server/data` path'ine mount edilmiş mi?
- [ ] Environment variables doğru mu?
- [ ] Dockerfile build loglarında hata var mı?

**Çözüm:**
```bash
# Railway shell'de
cd /app/server
npm run migrate
npm start
```

### Frontend Backend'e Bağlanamıyor

**Kontrol Listesi:**
- [ ] `VITE_API_URL` doğru backend URL'ini gösteriyor mu?
- [ ] Backend servisi çalışıyor mu?
- [ ] CORS ayarları doğru mu?

**Çözüm:**
- Frontend environment variables'ı kontrol edin
- Backend loglarında CORS hatası var mı bakın
- Backend'de `server/src/server.js` dosyasındaki CORS ayarlarını kontrol edin

### Veritabanı Kayboldu

**Neden:** Persistent volume eklenmemiş veya yanlış path

**Çözüm:**
1. Backend servisi → Settings → Volumes
2. Volume ekleyin: `/app/server/data`
3. Servisi yeniden deploy edin
4. Migration ve seed'i tekrar çalıştırın

### Migration Hataları

**Çözüm:**
```bash
# Railway shell'de
cd /app/server
rm -f data/library.db  # Eski DB'yi sil
npm run migrate
npm run seed
```

---

## 🌍 Opsiyonel: Custom Domain Ekleme

Kendi domain adınızı kullanmak isterseniz:

### Frontend için:

1. Frontend servisi → Settings → Domains
2. **Add Domain** butonuna tıklayın
3. Domain adınızı girin (örn: `kutuphane.okulunuz.com`)
4. DNS sağlayıcınızda CNAME kaydı oluşturun:
   - **Type:** CNAME
   - **Name:** kutuphane (veya subdomain)
   - **Value:** Railway'in verdiği domain

### Backend için:

1. Backend servisi → Settings → Domains
2. **Add Domain** butonuna tıklayın
3. API domain adınızı girin (örn: `api.okulunuz.com`)
4. DNS sağlayıcınızda CNAME kaydı oluşturun
5. Frontend'de `VITE_API_URL` variable'ı yeni domain ile güncelleyin

---

## 🔐 Güvenlik Önerileri

> [!CAUTION]
> **Üretim ortamında mutlaka yapılmalı:**

1. **JWT Secret'ı Değiştirin**
   - Railway Dashboard → Backend → Variables
   - `JWT_SECRET` için yeni bir random string oluşturun
   - Minimum 64 karakter önerilir

2. **Admin Şifresini Değiştirin**
   - İlk giriş yaptıktan hemen sonra
   - Profil → Şifre Değiştir

3. **GitHub PAT'ı Rotate Edin**
   - GitHub Settings → Developer Settings → Personal Access Tokens
   - Mevcut token'ı silin, yeni bir tane oluşturun

4. **HTTPS Kullanın**
   - Railway otomatik olarak sağlar
   - Custom domain'de de aktif edin

5. **Environment Variables'ı Gizli Tutun**
   - Asla GitHub'a commit etmeyin
   - `.env` dosyasını `.gitignore`'a ekleyin

---

## 📞 Destek ve Kaynaklar

### Railway Dokümantasyonu
- **Genel:** https://docs.railway.app/
- **Environment Variables:** https://docs.railway.app/develop/variables
- **Volumes:** https://docs.railway.app/reference/volumes
- **Custom Domains:** https://docs.railway.app/deploy/exposing-your-app

### EGELI Kütüphane
- **GitHub:** https://github.com/derinmehmetali68-max/EGELI
- **README:** Proje detayları için README.md

---

## 📝 Deployment Checklist

Deployment tamamlandıktan sonra kontrol edin:

- [ ] Backend servisi çalışıyor
- [ ] Frontend servisi çalışıyor
- [ ] Backend URL frontend'e eklendi
- [ ] Persistent volume bağlı
- [ ] Migration başarılı
- [ ] Seed data eklendi
- [ ] Frontend URL'ine erişim var
- [ ] Admin girişi çalışıyor
- [ ] Kitap ekleme/silme çalışıyor
- [ ] Üye ekleme/silme çalışıyor
- [ ] Ödünç verme/iade çalışıyor
- [ ] Admin şifresi değiştirildi
- [ ] JWT secret değiştirildi (üretim için)

---

**Deployment Tarihi:** 2025-11-26  
**Rehber Versiyonu:** 1.0

🎉 **Başarılar! EGELI Kütüphane Sistemi artık Railway'de çalışıyor!**
