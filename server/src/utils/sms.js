export async function sendSms({ to, message }) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url || !to || !message) {
    console.warn('SMS gönderimi atlandı (eksik URL veya parametre).');
    return { ok: false, skipped: true };
  }
  const payload = { to, message, token: process.env.SMS_WEBHOOK_TOKEN || undefined };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SMS webhook hata: ${res.status} ${text}`);
    }
    return { ok: true };
  } catch (err) {
    console.error('SMS gönderimi başarısız:', err);
    return { ok: false, error: err.message };
  }
}
