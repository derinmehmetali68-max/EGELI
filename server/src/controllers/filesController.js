import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Sharp'ı lazy load et - ilk kullanımda yüklenecek
let sharp = null;
let sharpLoadAttempted = false;

async function loadSharp() {
  if (sharpLoadAttempted) return sharp;
  sharpLoadAttempted = true;
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    console.log('Sharp kütüphanesi başarıyla yüklendi, HD görsel optimizasyonu aktif.');
  } catch (error) {
    console.warn('Sharp kütüphanesi yüklenemedi, görsel optimizasyonu devre dışı:', error.message);
    sharp = null;
  }
  return sharp;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coversDir = path.join(__dirname, '..', '..', 'uploads', 'covers');
const legacyCoversDir = path.join(__dirname, '..', '..', 'server', 'uploads', 'covers');

// Covers klasörünü oluştur (yoksa)
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

// Önceki sürümlerde oluşturulan yanlış klasörü taşı
if (legacyCoversDir !== coversDir && fs.existsSync(legacyCoversDir)) {
  try {
    const entries = fs.readdirSync(legacyCoversDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const currentPath = path.join(legacyCoversDir, entry.name);
      const targetPath = path.join(coversDir, entry.name);
      if (!fs.existsSync(targetPath)) {
        fs.renameSync(currentPath, targetPath);
      }
    }
    // Boş kaldıysa eski klasörü temizle
    const remaining = fs.readdirSync(legacyCoversDir);
    if (!remaining.length) {
      fs.rmSync(legacyCoversDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('Eski kapak klasörü taşınamadı:', err.message);
  }
}

/**
 * Görseli HD kalitede optimize eder
 * @param {string} inputPath - Giriş dosya yolu
 * @param {string} outputPath - Çıkış dosya yolu
 * @returns {Promise<void>}
 */
async function optimizeImage(inputPath, outputPath) {
  // Sharp'ı lazy load et
  const sharpLib = await loadSharp();
  
  // Sharp kurulu değilse, dosyayı olduğu gibi kopyala
  if (!sharpLib) {
    fs.copyFileSync(inputPath, outputPath);
    return;
  }
  
  try {
    const image = sharpLib(inputPath);
    const metadata = await image.metadata();
    
    // Format belirleme - JPEG veya PNG kalitesini yükselt
    if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
      await image
        .jpeg({ 
          quality: 95, // Yüksek kalite (0-100 arası, 95 HD için ideal)
          mozjpeg: true, // Daha iyi sıkıştırma
          progressive: true // Progressive JPEG (yavaş bağlantılarda daha iyi UX)
        })
        .toFile(outputPath);
    } else if (metadata.format === 'png') {
      await image
        .png({ 
          quality: 95, // PNG için kalite
          compressionLevel: 9, // Maksimum sıkıştırma (0-9)
          adaptiveFiltering: true // Daha iyi sıkıştırma
        })
        .toFile(outputPath);
    } else if (metadata.format === 'webp') {
      await image
        .webp({ 
          quality: 95,
          effort: 6 // Sıkıştırma çabası (0-6, 6 en yüksek kalite)
        })
        .toFile(outputPath);
    } else {
      // Bilinmeyen format - JPEG'e çevir (HD kalite)
      await image
        .jpeg({ 
          quality: 95,
          mozjpeg: true,
          progressive: true
        })
        .toFile(outputPath);
    }
  } catch (error) {
    // Sharp hatası durumunda dosyayı olduğu gibi kopyala
    console.warn('Görsel optimizasyon hatası, orijinal dosya kullanılıyor:', error.message);
    fs.copyFileSync(inputPath, outputPath);
  }
}

export async function uploadCover(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  
  try {
    const inputPath = req.file.path;
    const originalExt = path.extname(req.file.originalname || '');
    const ext = originalExt || '.jpg';
    const filename = `cover_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const outputPath = path.join(coversDir, filename);
    
    // Görseli HD kalitede optimize et
    await optimizeImage(inputPath, outputPath);
    
    // Orijinal geçici dosyayı sil
    fs.unlinkSync(inputPath);
    
    const rel = '/uploads/covers/' + filename;
    res.json({ path: rel, url: rel });
  } catch (error) {
    // Hata durumunda orijinal dosyayı kullan
    console.error('Kapak optimizasyon hatası:', error);
    const rel = '/uploads/covers/' + path.basename(req.file.path);
    res.json({ path: rel, url: rel });
  }
}

/**
 * API'den kapak resmini indirip sunucuya kaydeder (HD kalitede optimize edilmiş)
 * @param {string} coverUrl - Kapak resmi URL'i
 * @param {string} isbn - ISBN (dosya adı için)
 * @returns {Promise<string|null>} - Kaydedilen dosya yolu veya null
 */
export async function downloadCoverFromUrl(coverUrl, isbn) {
  if (!coverUrl || !isbn) return null;
  
  try {
    const response = await fetch(coverUrl);
    if (!response.ok) return null;
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) return null;
    
    const buffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(buffer);

    const tempExt = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' :
                    contentType.includes('png') ? 'png' : 
                    contentType.includes('webp') ? 'webp' : 'jpg';
    const safeIsbn = isbn.replace(/[^0-9Xx]/g, '') || 'cover';
    const baseName = `cover_${safeIsbn}_${Date.now()}`;

    const sharpLib = await loadSharp();
    let filename;
    let finalPath;

    if (sharpLib) {
      filename = `${baseName}.jpg`;
      finalPath = path.join(coversDir, filename);
      try {
        await sharpLib(imageBuffer)
          .jpeg({
            quality: 95,
            mozjpeg: true,
            progressive: true,
          })
          .toFile(finalPath);
      } catch (err) {
        console.warn('Sharp optimizasyonu başarısız:', err.message);
        filename = `${baseName}.${tempExt}`;
        finalPath = path.join(coversDir, filename);
        await fs.promises.writeFile(finalPath, imageBuffer);
      }
    } else {
      filename = `${baseName}.${tempExt}`;
      finalPath = path.join(coversDir, filename);
      await fs.promises.writeFile(finalPath, imageBuffer);
    }
    
    return '/uploads/covers/' + filename;
  } catch (error) {
    console.warn('Kapak indirme hatası:', error.message);
    return null;
  }
}
