import React,{useEffect,useState} from 'react';
import api from '../api';
import { withAuth } from '../utils/url';
const defaults={
  okul_adi:'',
  okul_logo_url:'',
  loan_days_default:'15',
  fine_cents_per_day:'0',
  fine_enabled:'false',
  max_active_loans:'5',
  block_on_overdue:'true',
  kiosk_pin:'',
  smtp_host:'',
  smtp_port:'587',
  smtp_secure:'false',
  smtp_user:'',
  smtp_pass:'',
  smtp_from:'',
  smtp_transport:''
};

export default function Settings(){
  const [settings,setSettings]=useState(defaults);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let cancelled=false;
    api.get('/settings').then(r=>{
      if(!cancelled){
        setSettings({...defaults, ...r.data});
        setLoading(false);
      }
    }).catch(()=>setLoading(false));
    return ()=>{ cancelled=true; };
  },[]);

  function update(key,value){
    setSettings(prev=>({ ...prev, [key]:value }));
  }

  async function save(){
    try {
      await api.post('/settings',settings);
      alert('Ayarlar başarıyla kaydedildi.');
    } catch (err) {
      alert(err.response?.data?.error || 'Ayarlar kaydedilirken hata oluştu.');
    }
  }

  if(loading){
    return <div>Yükleniyor...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Ayarlar</h2>

      <div className="card grid md:grid-cols-2 gap-3">
        <h3 className="md:col-span-2 font-semibold">Genel</h3>
        <label>Okul Adı
          <input className="input" value={settings.okul_adi} onChange={e=>update('okul_adi',e.target.value)} />
        </label>
        <label>Okul Logo URL
          <input className="input" value={settings.okul_logo_url} onChange={e=>update('okul_logo_url',e.target.value)} />
        </label>
        <label>Varsayılan Ödünç Günü
          <input className="input" type="number" min="1" value={settings.loan_days_default} onChange={e=>update('loan_days_default',e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Para Cezası Uygula
          <select className="input" value={settings.fine_enabled} onChange={e=>update('fine_enabled',e.target.value)}>
            <option value="false">Hayır, ücretsiz okul (önerilen)</option>
            <option value="true">Evet, gecikmeye para cezası var</option>
          </select>
        </label>
        <label>Gecikme Ücreti (kuruş/gün)
          <input
            className="input"
            type="number"
            min="0"
            value={settings.fine_cents_per_day}
            onChange={e=>update('fine_cents_per_day',e.target.value)}
            disabled={settings.fine_enabled !== 'true'}
          />
          {settings.fine_enabled !== 'true' && (
            <span className="text-xs text-slate-500">Para cezası kapalı; gecikmelerde ücret yansıtılmaz.</span>
          )}
        </label>
        <label>Kiosk PIN (opsiyonel)
          <input
            className="input"
            value={settings.kiosk_pin}
            onChange={e=>update('kiosk_pin',e.target.value)}
            placeholder="Varsayılan: boş (PIN yok)"
          />
          <span className="text-xs text-slate-500">Belirlerseniz kiosk işlemleri bu PIN'i ister.</span>
        </label>
        <label>En Fazla Aktif Ödünç (0 = sınırsız)
          <input className="input" type="number" min="0" value={settings.max_active_loans} onChange={e=>update('max_active_loans',e.target.value)} />
        </label>
        <label>Gecikmesi Olanlara Yeni Ödünç Verme
          <select className="input" value={settings.block_on_overdue} onChange={e=>update('block_on_overdue',e.target.value)}>
            <option value="true">Engelle (önerilen)</option>
            <option value="false">Uyar ama izin ver</option>
          </select>
        </label>
      </div>

      <div className="card grid md:grid-cols-2 gap-3">
        <h3 className="md:col-span-2 font-semibold">SMTP Bildirim</h3>
        <label>Sunucu (Host)
          <input className="input" value={settings.smtp_host} onChange={e=>update('smtp_host',e.target.value)} placeholder="smtp.okul.local" />
        </label>
        <label>Port
          <input className="input" type="number" value={settings.smtp_port} onChange={e=>update('smtp_port',e.target.value)} />
        </label>
        <label>Güvenli (TLS)
          <select className="input" value={settings.smtp_secure} onChange={e=>update('smtp_secure',e.target.value)}>
            <option value="false">Hayır (STARTTLS)</option>
            <option value="true">Evet (SMTPS 465)</option>
          </select>
        </label>
        <label>Kullanıcı Adı
          <input className="input" value={settings.smtp_user} onChange={e=>update('smtp_user',e.target.value)} />
        </label>
        <label>Parola
          <input className="input" type="password" value={settings.smtp_pass} onChange={e=>update('smtp_pass',e.target.value)} />
        </label>
        <label>Gönderen
          <input className="input" value={settings.smtp_from} onChange={e=>update('smtp_from',e.target.value)} placeholder="Kütüphane <noreply@okul.local>" />
        </label>
      </div>

      <div className="card space-y-2">
        <h3 className="font-semibold">Araçlar</h3>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={withAuth('/tools/templates/books.xlsx')}>Kitap XLSX Şablonu</a>
          <a className="btn" href={withAuth('/tools/templates/members.xlsx')}>Üye XLSX Şablonu</a>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={withAuth('/tools/templates/isbn-bulk.xlsx')}>ISBN Toplu XLSX</a>
          <a className="btn" href={withAuth('/tools/backup/db')}>Veritabanı Yedeği</a>
        </div>
        <button className="btn" onClick={save}>Kaydet</button>
      </div>
    </div>
  );
}
