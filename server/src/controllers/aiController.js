import db from '../db.js';
import { sanitizeModelName } from '../services/geminiClient.js';

const KEY_SETTING = 'gemini_api_key';
const MODEL_SETTING = 'gemini_model';

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

function deleteSetting(key) {
  db.prepare('DELETE FROM settings WHERE key=?').run(key);
}

export function getAiConfig(_req, res) {
  const apiKey = getSetting(KEY_SETTING);
  const storedModel = getSetting(MODEL_SETTING);
  const model = sanitizeModelName(storedModel);
  if (storedModel !== null && storedModel !== model) {
    setSetting(MODEL_SETTING, model);
  }
  res.json({
    hasKey: Boolean(apiKey || process.env.GEMINI_API_KEY),
    keyPreview: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : null,
    model,
    source: apiKey ? 'database' : process.env.GEMINI_API_KEY ? 'env' : 'none',
  });
}

export function saveAiConfig(req, res) {
  const { apiKey, model } = req.body || {};

  if (apiKey !== undefined) {
    const trimmed = String(apiKey || '').trim();
    if (trimmed) {
      setSetting(KEY_SETTING, trimmed);
    } else {
      deleteSetting(KEY_SETTING);
    }
  }

  if (model !== undefined) {
    const sanitized = sanitizeModelName(model);
    if (sanitized) {
      setSetting(MODEL_SETTING, sanitized);
    } else {
      deleteSetting(MODEL_SETTING);
    }
  }

  res.json({ ok: true });
}
