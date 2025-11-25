import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname,'..','data','library.db');
const out = path.join(__dirname,'..',`backup-library-${Date.now()}.db`);
fs.copyFileSync(dbPath,out); console.log('Yedek:', out); process.exit(0);
