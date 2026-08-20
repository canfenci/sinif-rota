# Sınıf Rota

Sınıf Rota, öğretmenlerin okul sınıflarında ödev, defter, kitap, materyal ve devam durumlarını mümkün olan en az dokunuşla takip etmesi için geliştirilmiş mobil öncelikli bir prototiptir.

## Çalışan akış

- Ana Sayfa → Sınıf → Hızlı Kontrol → Kaydet → Öğrenci İstatistiği
- Sınıf ve öğrenci ekleme, düzenleme ve silme
- XLSX, XLS ve CSV dosyalarından önizlemeli öğrenci aktarımı
- Otomatik başlık/sütun algılama ve ayrı ad-soyad sütunlarını birleştirme
- Aktarımda hatalı ve tekrarlanan okul numaralarını işaretleme
- Mevcut öğrencileri atlama veya adını güncelleme seçeneği
- İndirilebilir örnek Excel şablonu
- Öğrenci arama; ada veya okul numarasına göre sıralama
- Çoklu öğrenci seçimi ve toplu taşıma, kopyalama, silme
- Öğrencileri aktif veya pasif yapma; pasif öğrencileri yeni kontrollerden çıkarma
- Sınıf çoğaltma ve arşivleme
- Toplu işlemlerde önizleme, numara çakışması kontrolü ve geri alma
- Düzenlenebilir eğitim yılı başlangıç ve bitiş tarihleriyle iş takvimi
- Tatil ve ders yapılmayan dönemleri iş günü hesabından çıkarma
- İş takviminden otomatik oluşturulan hafta hafta yıllık plan
- Her sınıf için haftalık konu/kazanım, öğretmen notu ve tamamlanma takibi
- Planlanan, tamamlanan ve konu girilmeyen haftaları filtreleme
- Öğrenci numarası düzenleme ve sınıf içinde numara çakışmasını önleme
- İlişkili geçmiş kayıtlarını da kapsayan iki aşamalı güvenli silme
- Ödev, Defter, Kitap ve Materyal kontrolleri
- Yeni kontrolde bütün öğrencileri varsayılan olarak `✓ Tam` başlatma
- `✓`, `~`, `×` ve `G` durumları için canlı özet
- `G — Gelmedi` kayıtlarını başarı oranının paydasından çıkarma
- Cihaz üzerinde yerel veri saklama
- Bozuk veya uyumsuz yerel veriye karşı güvenli başlangıç
- Kaydedilmemiş hızlı kontrolden çıkarken veri kaybı uyarısı
- Telefon ve tablet uyumlu arayüz

## Teknoloji

- React 19
- vinext ve Vite
- TypeScript
- Cloudflare Worker uyumlu Sites çıktısı
- Yerel veri erişimi için UI'dan ayrılmış repository katmanı

## Yerel geliştirme

Node.js `22.13.0` veya üzeri gerekir.

```bash
npm install
npm run dev
```

Doğrulama:

```bash
npm test
```

## Veri yaklaşımı

Bu prototip Firebase veya başka bir bulut veri tabanı kullanmaz. Veriler tarayıcıdaki yerel depoda tutulur. Veri erişimi `app/lib/storage.ts` altında ayrı bir repository olarak tanımlandığı için ileride bulut tabanlı bir uygulamaya geçiş UI bileşenlerini değiştirmeden yapılabilir.

## Durum

Bu sürüm ürün deneyimini değerlendirmek için hazırlanmıştır; nihai okul yönetim sistemi değildir.
