// Basit MCP-benzeri JSON-RPC shim — IDE'lerde 'custom tool' olarak kullanılabilir.
import { readFileSync } from 'fs'
const tools = [
  { name: 'isbn_lookup', description: 'ISBN ile kitap meta getir', input_schema: { type:'object', properties:{ isbn:{type:'string'} }, required:['isbn'] } },
  { name: 'books_create_from_isbn', description: 'ISBN ile kitap oluştur', input_schema: { type:'object', properties:{ isbn:{type:'string'} }, required:['isbn'] } },
  { name: 'books_import_xlsx', description: 'XLSX kitap import (dosya yolu)', input_schema: { type:'object', properties:{ path:{type:'string'} }, required:['path'] } },
  { name: 'backup_download', description: 'Veritabanı yedeği indir', input_schema: { type:'object', properties:{} } },
]
const API = process.env.API_URL || 'http://localhost:5174/api'
async function callTool(name, params){
  if(name==='isbn_lookup'){
    const r = await fetch(`${API}/books/isbn/${encodeURIComponent(params.isbn)}/fetch`); if(!r.ok) throw new Error('Bulunamadı'); return await r.json()
  }
  if(name==='books_create_from_isbn'){
    const r = await fetch(`${API}/books/isbn/${encodeURIComponent(params.isbn)}/create`, { method:'POST' }); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Hata'); return j
  }
  if(name==='books_import_xlsx'){ const buf = readFileSync(params.path); return { ok:true, bytes: buf.length, note:'Gerçek upload için /api/books/import.xlsx kullanın.' } }
  if(name==='backup_download'){ return { url: `${API}/tools/backup/db` } }
  throw new Error('Bilinmeyen araç')
}
let idCounter=1; process.stdin.setEncoding('utf8'); let buf=''
process.stdin.on('data', async chunk=>{
  buf += chunk
  try{
    const msg = JSON.parse(buf); buf=''
    if(msg.method==='initialize' || msg.method==='tools/list'){
      const resp={ jsonrpc:'2.0', id: msg.id||idCounter++, result:{ tools } }; process.stdout.write(JSON.stringify(resp)+'\n'); return
    }
    if(msg.method==='tools/call'){
      try{ const out = await callTool(msg.params.name, msg.params.arguments||{})
        const resp={ jsonrpc:'2.0', id: msg.id||idCounter++, result:{ content: out } }
        process.stdout.write(JSON.stringify(resp)+'\n')
      }catch(e){
        const err={ jsonrpc:'2.0', id: msg.id||idCounter++, error:{ code:-32000, message:String(e.message||e) } }
        process.stdout.write(JSON.stringify(err)+'\n')
      } return
    }
    const resp={ jsonrpc:'2.0', id: msg.id||idCounter++, error:{ code:-32601, message:'Method not found' } }
    process.stdout.write(JSON.stringify(resp)+'\n')
  }catch{ /* daha fazla veri bekle */ }
})
