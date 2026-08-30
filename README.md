# Zhong Hua Da 中华达 — Website Jasa Titip

Website statis (HTML/CSS/JS, tanpa backend) untuk jasa titip belanja dari Tiongkok. Berisi landing page, kalkulator estimasi biaya (kurs + ongkir + bea masuk), dan form order yang mengirim pesan WhatsApp otomatis + mencatat pesanan ke Google Sheets.

## Struktur file

```
index.html              → halaman utama
style.css                → semua styling
script.js                → logika kalkulator, kurs otomatis, form order
google-apps-script.gs    → kode untuk dipasang di Google Apps Script (pencatat ke Sheets)
./logo.png          → logo
```

## 1. Sebelum diunggah — wajib diisi

Buka `script.js`, ganti tiga hal di bagian paling atas:

| Variabel | Isi dengan |
|---|---|
| `ADMIN_WA` | Nomor WhatsApp bisnismu, format `62xxxxxxxxxx` (tanpa tanda `+`) |
| `SHEET_WEBHOOK_URL` | URL Web App dari Google Apps Script — lihat langkah 2 di bawah |
| `ADMIN_SETTINGS` | Tarif ongkir/kg, fee jastip, dan persentase pajak yang kamu pakai |

`ADMIN_SETTINGS` sengaja **tidak** dibuat jadi kolom isian di halaman web — supaya pembeli tidak bisa mengubah tarif lewat form. Kalau tarif berubah (misalnya ongkir naik), edit langsung di file ini lalu unggah ulang.

## 2. Menghubungkan ke Google Sheets (mencatat semua pesanan otomatis)

1. Buka [sheets.google.com](https://sheets.google.com), buat spreadsheet baru.
2. Menu **Extensions → Apps Script**.
3. Hapus kode default, tempel seluruh isi `google-apps-script.gs`.
4. **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Klik **Deploy**. Google akan menampilkan peringatan izin (karena ini scriptmu sendiri) — klik **Advanced/Lanjutan** → **Go to (nama project) (unsafe)** → **Allow**.
6. Salin URL yang muncul (`https://script.google.com/macros/s/.../exec`).
7. Tempel ke `SHEET_WEBHOOK_URL` di `script.js`.

Setiap pesanan yang disubmit lewat form akan otomatis jadi satu baris baru di sheet "Pesanan", termasuk rincian modal & estimasi untung — kolom ini **hanya ada di spreadsheet**, tidak pernah ditampilkan ke pembeli di halaman web.

> Catatan: karena keterbatasan CORS di Google Apps Script, permintaan dikirim dengan mode `no-cors`. Data tetap masuk ke sheet, tapi browser tidak bisa mengonfirmasi keberhasilannya secara visual di halaman — cek langsung ke spreadsheet untuk memverifikasi.

## 3. Upload ke GitHub Pages

1. Buat repository baru di GitHub, upload semua file (pertahankan struktur folder `assets/`).
2. Masuk ke **Settings → Pages**.
3. Pilih branch `main` dan folder `/ (root)`, klik **Save**.
4. Tunggu beberapa menit, situs akan tersedia di `https://<username>.github.io/<nama-repo>/`.

## 4. Tentang kurs otomatis

Kurs Yuan→Rupiah diambil otomatis dari sumber kurs pasar publik (open.er-api.com, gratis, tanpa API key, update harian) setiap kali halaman dibuka, ditambah margin tetap (`kursMarginPerYuan`, default Rp50) untuk mendekati kurs jual BCA. Ini **bukan** kurs resmi BCA — hanya pendekatan. Kalau butuh presisi penuh terhadap kurs BCA hari itu, sesuaikan manual `kursMarginPerYuan` dari waktu ke waktu berdasarkan pengecekan langsung ke BCA.

## 5. Batasan keamanan yang perlu kamu tahu

Situs ini statis dan berjalan sepenuhnya di browser pembeli. Menyembunyikan tarif dari tampilan (tidak ada kolom isian) menghentikan mayoritas percobaan mengubah harga secara iseng, **tapi bukan pengaman mutlak** — pengguna yang mengerti DevTools browser masih bisa melihat/mengubah nilai JavaScript sebelum submit. Selalu cek ulang rincian pesanan (dari WhatsApp maupun spreadsheet) sebelum membuat invoice final, dan jangan langsung percaya angka yang dikirim dari sisi klien untuk keputusan pembayaran otomatis.

Kalau ke depannya butuh perhitungan harga yang benar-benar tidak bisa dimanipulasi dari sisi pembeli, itu perlu backend/server sendiri yang menghitung harga final — di luar cakupan situs statis GitHub Pages ini.
