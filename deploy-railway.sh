#!/bin/bash

# Railway Deployment Script for EGELI Kütüphane Sistemi
# Bu script Railway CLI kullanarak environment variables'ları ayarlar

set -e

echo "🚂 EGELI Kütüphane - Railway Deployment Script"
echo "================================================"
echo ""

# Railway CLI kontrolü
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI bulunamadı!"
    echo "Lütfen Railway CLI'yi yükleyin:"
    echo "  npm install -g @railway/cli"
    echo ""
    echo "veya"
    echo "  brew install railway"
    exit 1
fi

echo "✅ Railway CLI bulundu"
echo ""

# Railway login kontrolü
echo "🔐 Railway'e giriş yapılıyor..."
railway login

# Proje ID'leri
PROJECT_ID="eab6bd67-26a6-43dd-95e8-7a81eacb8a94"
BACKEND_SERVICE_ID="30d4608f-e617-4c52-a7a6-4e0a373126d1"
FRONTEND_SERVICE_ID="85e4e94d-c9c3-45a7-9599-45ee3d9da3f8"

echo ""
echo "📋 Proje Bilgileri:"
echo "  Proje ID: $PROJECT_ID"
echo "  Backend Service ID: $BACKEND_SERVICE_ID"
echo "  Frontend Service ID: $FRONTEND_SERVICE_ID"
echo ""

# Projeye link ol
echo "🔗 Railway projesine bağlanılıyor..."
railway link --project $PROJECT_ID

echo "✅ Proje bağlantısı başarılı"
echo ""

# Backend Environment Variables
echo "🔧 Backend environment variables ayarlanıyor..."
railway variables \
  --service=$BACKEND_SERVICE_ID \
  --set "JWT_SECRET=SmmE3RbKuunZReJDx1AboIvA5w5CzDL9Flw0p4095xhJn0p8ReVAwVohIrB7" \
  --set "PORT=5174" \
  --set "NODE_ENV=production" \
  --set "DB_PATH=/app/server/data/library.db" \
  --set "ADMIN_EMAIL=admin@egeli.com" \
  --set "ADMIN_PASSWORD=Admin123!"

echo "✅ Backend environment variables ayarlandı"
echo ""

# Frontend Environment Variables (backend URL sonra eklenecek)
echo "🔧 Frontend environment variables ayarlanıyor..."
railway variables \
  --service=$FRONTEND_SERVICE_ID \
  --set "NODE_ENV=production"

echo "✅ Frontend environment variables ayarlandı"
echo ""

echo "⚠️  ÖNEMLİ NOT:"
echo "================================================"
echo ""
echo "1️⃣  Railway Dashboard'a gidin:"
echo "    https://railway.app/project/$PROJECT_ID"
echo ""
echo "2️⃣  Backend servisi için:"
echo "    - Settings → Source → Connect Repository"
echo "    - Repository: derinmehmetali68-max/EGELI"
echo "    - Root Directory: server"
echo "    - Settings → Volumes → Add Volume"
echo "    - Mount Path: /app/server/data"
echo ""
echo "3️⃣  Frontend servisi için:"
echo "    - Settings → Source → Connect Repository"
echo "    - Repository: derinmehmetali68-max/EGELI"
echo "    - Root Directory: client"
echo ""
echo "4️⃣  Backend deployment tamamlandıktan sonra:"
echo "    - Backend URL'ini alın"
echo "    - Frontend service variables'a ekleyin:"
echo "      VITE_API_URL=<backend-url>"
echo ""
echo "5️⃣  Backend shell'de migration çalıştırın:"
echo "    railway run npm run migrate"
echo "    railway run npm run seed"
echo ""
echo "🎉 Environment variables başarıyla ayarlandı!"
echo "📖 Detaylı adımlar için RAILWAY_DEPLOYMENT.md dosyasına bakın."
