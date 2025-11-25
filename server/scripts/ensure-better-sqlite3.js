import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Buffer } from 'buffer';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const projectRoot = path.resolve(__dirname, '..');
const bindingPath = path.join(
  projectRoot,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

const platformSignatures = {
  win32: 'MZ',
  linux: '\u007fELF',
  darwin: '\u00cf\u00fa\u00ed\u00fe', // Mach-O
};

function detectSignature(file) {
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  if (!Buffer.isBuffer(buf)) {
    return null;
  }
  return buf.subarray(0, 4).toString('latin1');
}

function rebuildModule() {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    console.error('[better-sqlite3] npm_execpath bulunamadı, lütfen `npm rebuild better-sqlite3 --build-from-source` komutunu elle çalıştırın.');
    process.exit(1);
  }

  console.log('[better-sqlite3] Platform uyumsuzluğu tespit edildi, yeniden derleniyor...');
  const result = spawnSync(
    process.execPath,
    [npmExecPath, 'rebuild', 'better-sqlite3', '--build-from-source'],
    { cwd: projectRoot, stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.error('[better-sqlite3] Otomatik yeniden derleme başarısız oldu. Lütfen gerekli derleme araçlarının (Windows için Build Tools, macOS için Xcode CLI, Linux için build-essential) kurulu olduğundan emin olun ve komutu elle tekrar deneyin:');
    console.error('  npm rebuild better-sqlite3 --build-from-source');
    process.exit(result.status ?? 1);
  }
}

function canLoadBinding() {
  try {
    // better-sqlite3'ü mevcut Node sürümü ile yüklemeyi dene; ABI uyumsuzluklarında burada patlar.
    const Mod = require('better-sqlite3');
    const db = new Mod(':memory:'); // Native bindingi gerçekten yükle
    db.close();
    return true;
  } catch (err) {
    const message = err?.message || '';
    const firstLine = message.split('\n')[0];
    console.warn(`[better-sqlite3] Yerel modül yüklenemedi: ${firstLine}`);
    // NODE_MODULE_VERSION/ERR_DLOPEN_FAILED gibi ABI sorunlarında yeniden derle.
    return false;
  }
}

function ensureBinding() {
  if (process.env.SKIP_BETTER_SQLITE3_CHECK) {
    return;
  }

  const expectedSignature = platformSignatures[process.platform];
  if (!expectedSignature) {
    console.warn(`[better-sqlite3] Bilinmeyen platform (${process.platform}). Kontrol atlanıyor.`);
    return;
  }

  const signature = detectSignature(bindingPath);
  if (!signature) {
    console.warn('[better-sqlite3] Yerel modül bulunamadı, yeniden derleniyor.');
    rebuildModule();
    if (!canLoadBinding()) {
      console.error('[better-sqlite3] Yeniden derleme sonrası modül hâlâ yüklenemiyor.');
      process.exit(1);
    }
    return;
  }

  if (signature && signature.startsWith(expectedSignature)) {
    if (canLoadBinding()) return;
    rebuildModule();
    if (!canLoadBinding()) {
      console.error('[better-sqlite3] Yeniden derleme sonrası modül hâlâ yüklenemiyor.');
      process.exit(1);
    }
    return;
  }

  rebuildModule();

  const signatureAfter = detectSignature(bindingPath);
  if (!signatureAfter || !signatureAfter.startsWith(expectedSignature)) {
    console.error('[better-sqlite3] Yeniden derleme sonrası platform imzası hâlâ uyumsuz.');
    console.error(`[better-sqlite3] Beklenen imza: ${JSON.stringify(expectedSignature)}, mevcut: ${JSON.stringify(signatureAfter)}`);
    process.exit(1);
  }
  if (!canLoadBinding()) {
    console.error('[better-sqlite3] Yeniden derleme sonrası modül hâlâ yüklenemiyor.');
    process.exit(1);
  }
}

ensureBinding();
