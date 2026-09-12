# Zhong Hua Da 中华达 — Website Jasa Titip

Website statis (HTML/CSS/JS, tanpa backend) untuk jasa titip belanja dari Tiongkok. Berisi landing page, kalkulator estimasi biaya (kurs + ongkir + bea masuk), dan form order yang mencatat pesanan ke Google Sheets lalu menampilkan detail transfer ke rekening BCA.

## Struktur file

```
index.html              → halaman utama
style.css                → semua styling
script.js                → logika kalkulator, kurs otomatis, form order
google-apps-script.gs    → kode untuk dipasang di Google Apps Script (pencatat ke Sheets)
assets/logo.png          → logo
```

## 1. Sebelum diunggah — wajib diisi

Buka `script.js`, ganti bagian di bagian paling atas:

| Variabel | Isi dengan |
|---|---|
| `BCA_ACCOUNT_NUMBER` | Nomor rekening BCA-mu |
| `BCA_ACCOUNT_NAME` | Nama pemilik rekening sesuai buku tabungan |
| `SHEET_WEBHOOK_URL` | URL Web App dari Google Apps Script — lihat langkah 2 di bawah |
| `ADMIN_SETTINGS` | Tarif ongkir/kg, fee jastip, dan persentase pajak yang kamu pakai |

Setelah pembeli submit form, situs **tidak** membuka WhatsApp — sebagai gantinya, halaman langsung menampilkan kode pesanan dan detail transfer ke rekening BCA-mu. Data pesanan tetap tercatat otomatis ke Google Sheets (langkah 2).

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

Setiap pesanan yang disubmit lewat form akan otomatis jadi satu baris baru di sheet "Pesanan", termasuk kode pesanan (untuk dicocokkan dengan berita transfer) dan rincian modal & estimasi untung — kolom ini **hanya ada di spreadsheet**, tidak pernah ditampilkan ke pembeli di halaman web.

Data dikirim lewat form tersembunyi yang menyasar iframe tersembunyi (bukan `fetch`), supaya lebih tahan terhadap masalah CORS yang sering terjadi dengan Google Apps Script.

### Debug: data tidak masuk ke spreadsheet

Ikuti urutan ini:

1. **Buka URL `/exec` langsung di browser** (tempel ke address bar, tekan Enter). Harus muncul teks *"ZHD webhook aktif"*.
   - Kalau yang muncul malah halaman login Google atau pesan "izin diperlukan" → pengaturan **"Who has access"** belum di-set ke **Anyone**. Perbaiki di Deploy → Manage deployments.
2. **Cek log Executions**: di editor Apps Script, buka menu kiri **Executions**, lalu coba submit form pesanan di situs. Baris eksekusi baru akan muncul di sini — kalau berwarna merah (gagal), klik untuk lihat pesan errornya.
3. **Pastikan sudah redeploy setelah edit kode**: mengedit file `.gs` lalu hanya menekan Save (💾) **tidak cukup**. Kamu harus buka **Deploy → Manage deployments → klik ikon pensil → Version: "New version" → Deploy** supaya URL `/exec` menjalankan kode terbaru.
4. **Cocokkan URL**: pastikan `SHEET_WEBHOOK_URL` di `script.js` sama persis dengan URL `/exec` yang paling baru (URL bisa berubah kalau kamu membuat deployment baru, bukan mengedit versi yang sudah ada).
5. Kalau semua di atas sudah benar tapi masih belum masuk, buka tab sheet paling bawah — pastikan tab bernama **"Pesanan"** benar-benar dibuat (harusnya otomatis muncul saat submit pertama berhasil).

## 3. Upload ke GitHub Pages

1. Buat repository baru di GitHub, upload semua file (pertahankan struktur folder `assets/`).
2. Masuk ke **Settings → Pages**.
3. Pilih branch `main` dan folder `/ (root)`, klik **Save**.
4. Tunggu beberapa menit, situs akan tersedia di `https://<username>.github.io/<nama-repo>/`.

## 4. Tentang kurs otomatis

Kurs Yuan→Rupiah diambil otomatis dari sumber kurs pasar publik (open.er-api.com, gratis, tanpa API key, update harian) setiap kali halaman dibuka, ditambah margin tetap (`kursMarginPerYuan`, default Rp50) untuk mendekati kurs jual BCA. Ini **bukan** kurs resmi BCA — hanya pendekatan. Kalau butuh presisi penuh terhadap kurs BCA hari itu, sesuaikan manual `kursMarginPerYuan` dari waktu ke waktu berdasarkan pengecekan langsung ke BCA.

## 5. Batasan keamanan yang perlu kamu tahu

Situs ini statis dan berjalan sepenuhnya di browser pembeli. Menyembunyikan tarif dari tampilan (tidak ada kolom isian) menghentikan mayoritas percobaan mengubah harga secara iseng, **tapi bukan pengaman mutlak** — pengguna yang mengerti DevTools browser masih bisa melihat/mengubah nilai JavaScript sebelum submit. Selalu cocokkan kode pesanan di spreadsheet dengan mutasi rekening BCA sebelum memproses barang, dan jangan langsung percaya angka yang dikirim dari sisi klien untuk keputusan otomatis.

Kalau ke depannya butuh perhitungan harga yang benar-benar tidak bisa dimanipulasi dari sisi pembeli, itu perlu backend/server sendiri yang menghitung harga final — di luar cakupan situs statis GitHub Pages ini.
