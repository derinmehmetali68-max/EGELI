import db from '../db.js';
export function getSettings(req,res){
  const rows=db.prepare('SELECT key,value FROM settings').all(); const obj=Object.fromEntries(rows.map(r=>[r.key,r.value])); res.json(obj);
}
export function setSettings(req,res){
  const entries=Object.entries(req.body||{});
  const stmt=db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for(const [k,v] of entries){ stmt.run(k,String(v)); }
  res.json({ok:true});
}
