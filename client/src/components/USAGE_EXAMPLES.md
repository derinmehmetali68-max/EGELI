# 🎨 UI Bileşenleri Kullanım Örnekleri

## 📦 Kurulum

```jsx
import { Button, Input, Modal, Toast, Badge, Table, EmptyState, Spinner, Skeleton } from '../components';
import { useToast } from '../components/Toast';
```

---

## 🔘 Button

### Temel Kullanım
```jsx
<Button variant="primary">Kaydet</Button>
<Button variant="secondary">İptal</Button>
<Button variant="ghost">Daha Fazla</Button>
<Button variant="light">Hafif Buton</Button>
```

### Boyutlar
```jsx
<Button size="sm">Küçük</Button>
<Button size="md">Orta</Button>
<Button size="lg">Büyük</Button>
```

### Loading State
```jsx
<Button loading={isLoading}>Yükleniyor...</Button>
```

### Icon ile
```jsx
<Button icon="💾" iconPosition="left">Kaydet</Button>
<Button icon="→" iconPosition="right">Devam Et</Button>
```

### Disabled
```jsx
<Button disabled>Devre Dışı</Button>
```

---

## 📝 Input

### Temel Kullanım
```jsx
<Input
  label="E-posta"
  type="email"
  placeholder="ornek@email.com"
  required
/>
```

### Floating Label
```jsx
<Input
  floatingLabel
  label="Kullanıcı Adı"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>
```

### Error State
```jsx
<Input
  label="Şifre"
  type="password"
  error="Şifre en az 8 karakter olmalıdır"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
```

### Helper Text
```jsx
<Input
  label="ISBN"
  helperText="13 haneli ISBN numarasını girin"
  value={isbn}
  onChange={(e) => setIsbn(e.target.value)}
/>
```

### Icon ile
```jsx
<Input
  label="Ara"
  icon="🔍"
  placeholder="Kitap ara..."
/>
```

---

## 🪟 Modal

### Temel Kullanım
```jsx
const [showModal, setShowModal] = useState(false);

<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Onay"
  footer={
    <>
      <Button variant="secondary" onClick={() => setShowModal(false)}>
        İptal
      </Button>
      <Button variant="primary" onClick={handleConfirm}>
        Onayla
      </Button>
    </>
  }
>
  <p>Bu işlemi gerçekleştirmek istediğinizden emin misiniz?</p>
</Modal>
```

### Boyutlar
```jsx
<Modal size="sm">Küçük Modal</Modal>
<Modal size="md">Orta Modal</Modal>
<Modal size="lg">Büyük Modal</Modal>
<Modal size="xl">Çok Büyük Modal</Modal>
<Modal size="full">Tam Ekran Modal</Modal>
```

---

## 🍞 Toast

### Hook ile Kullanım
```jsx
import { useToast } from '../components/Toast';

function MyComponent() {
  const { success, error, warning, info } = useToast();

  const handleSuccess = () => {
    success('İşlem başarıyla tamamlandı!');
  };

  const handleError = () => {
    error('Bir hata oluştu!', { duration: 0 }); // Otomatik kapanmaz
  };

  return (
    <>
      <Button onClick={handleSuccess}>Başarılı</Button>
      <Button onClick={handleError}>Hata</Button>
    </>
  );
}
```

### Action ile
```jsx
const { success } = useToast();

success('Kitap silindi', {
  action: (
    <button onClick={handleUndo} className="underline">
      Geri Al
    </button>
  ),
});
```

---

## 🏷️ Badge

### Varyantlar
```jsx
<Badge variant="success">Aktif</Badge>
<Badge variant="error">Kapalı</Badge>
<Badge variant="warning">Beklemede</Badge>
<Badge variant="info">Yeni</Badge>
<Badge variant="default">Varsayılan</Badge>
```

### Boyutlar
```jsx
<Badge size="sm">Küçük</Badge>
<Badge size="md">Orta</Badge>
<Badge size="lg">Büyük</Badge>
```

### Dot ile
```jsx
<Badge variant="success" dot>Aktif</Badge>
```

---

## 📊 Table

### Temel Kullanım
```jsx
const columns = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: 'İsim' },
  { key: 'email', title: 'E-posta' },
  {
    key: 'actions',
    title: 'İşlemler',
    render: (value, row) => (
      <Button size="sm" onClick={() => handleEdit(row)}>
        Düzenle
      </Button>
    ),
  },
];

const data = [
  { id: 1, name: 'Ahmet', email: 'ahmet@example.com' },
  { id: 2, name: 'Mehmet', email: 'mehmet@example.com' },
];

<Table
  columns={columns}
  data={data}
  stickyHeader
  striped
  hover
  onRowClick={(row) => console.log('Row clicked:', row)}
/>
```

### Empty State
```jsx
<Table
  columns={columns}
  data={[]}
  emptyState={
    <EmptyState
      icon="📚"
      title="Kitap bulunamadı"
      description="Henüz kitap eklenmemiş."
      action={
        <Button onClick={handleAdd}>Kitap Ekle</Button>
      }
    />
  }
/>
```

---

## 📭 EmptyState

```jsx
<EmptyState
  icon="📚"
  title="Kitap bulunamadı"
  description="Henüz bu kategoride kitap yok. İlk kitabı eklemek ister misiniz?"
  action={
    <Button onClick={handleAdd}>Kitap Ekle</Button>
  }
/>
```

---

## ⏳ Loading States

### Spinner
```jsx
<Spinner size="sm" />
<Spinner size="md" />
<Spinner size="lg" />
```

### Skeleton
```jsx
<Skeleton width="200px" height="20px" />
<SkeletonText lines={3} />
<SkeletonCard />
<SkeletonTable rows={5} cols={4} />
```

### Loading Overlay
```jsx
{isLoading && <LoadingOverlay message="Yükleniyor..." />}
```

---

## 🎨 Card İyileştirmeleri

### Hover Effect
```jsx
<div className="card card-hover">
  <h3>Başlık</h3>
  <p>İçerik</p>
</div>
```

### Clickable Card
```jsx
<div className="card card-clickable" onClick={handleClick}>
  <h3>Başlık</h3>
  <p>İçerik</p>
</div>
```

---

## 📋 Örnek: Form ile Modal

```jsx
function BookForm() {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', author: '' });
  const [errors, setErrors] = useState({});
  const { success, error } = useToast();

  const handleSubmit = async () => {
    // Validation
    const newErrors = {};
    if (!formData.title) newErrors.title = 'Başlık gereklidir';
    if (!formData.author) newErrors.author = 'Yazar gereklidir';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await api.post('/books', formData);
      success('Kitap başarıyla eklendi!');
      setShowModal(false);
      setFormData({ title: '', author: '' });
    } catch (err) {
      error('Kitap eklenirken bir hata oluştu!');
    }
  };

  return (
    <>
      <Button onClick={() => setShowModal(true)}>Kitap Ekle</Button>
      
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Yeni Kitap Ekle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Kitap Başlığı"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            error={errors.title}
            required
          />
          <Input
            label="Yazar"
            value={formData.author}
            onChange={(e) => setFormData({ ...formData, author: e.target.value })}
            error={errors.author}
            required
          />
        </div>
      </Modal>
    </>
  );
}
```

---

## 🎯 Best Practices

1. **Button**: Her zaman uygun variant kullanın
2. **Input**: Validation için error state kullanın
3. **Modal**: Büyük formlar için kullanın
4. **Toast**: Kısa mesajlar için ideal
5. **Table**: Büyük veri setleri için sticky header kullanın
6. **Loading**: Kullanıcıya feedback verin
7. **Empty State**: Kullanıcıya ne yapması gerektiğini söyleyin

---

## 🚀 İleri Seviye

### Custom Toast
```jsx
const { showToast } = useToast();

showToast({
  type: 'info',
  message: 'Özel mesaj',
  duration: 10000, // 10 saniye
  action: <button>İşlem</button>,
});
```

### Table with Sorting
```jsx
const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

const sortedData = [...data].sort((a, b) => {
  if (!sortConfig.key) return 0;
  if (a[sortConfig.key] < b[sortConfig.key]) {
    return sortConfig.direction === 'asc' ? -1 : 1;
  }
  if (a[sortConfig.key] > b[sortConfig.key]) {
    return sortConfig.direction === 'asc' ? 1 : -1;
  }
  return 0;
});
```









