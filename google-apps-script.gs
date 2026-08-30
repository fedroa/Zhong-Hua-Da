/**
 * ZHONG HUA DA — pencatat pesanan ke Google Sheets
 *
 * CARA PAKAI:
 * 1. Buka https://sheets.google.com, buat spreadsheet baru (boleh kosong).
 * 2. Di menu Sheet: Extensions/Ekstensi → Apps Script.
 * 3. Hapus kode contoh yang ada, ganti dengan seluruh isi file ini.
 * 4. Klik Deploy → New deployment (Deployment baru).
 *    - Pilih tipe: Web app
 *    - Execute as: Me (kamu)
 *    - Who has access: Anyone (siapa saja) ← wajib, supaya situs bisa kirim data
 * 5. Klik Deploy, izinkan aksesnya (akan ada peringatan Google, klik
 *    "Advanced" → "Go to ... (unsafe)" karena ini scriptmu sendiri).
 * 6. Salin URL Web App yang muncul (diawali https://script.google.com/macros/s/.../exec)
 * 7. Tempel URL itu ke variabel SHEET_WEBHOOK_URL di file script.js situs.
 *
 * Setiap kali form order di situs disubmit, satu baris baru otomatis
 * ditambahkan ke sheet "Pesanan" (dibuat otomatis kalau belum ada).
 *
 * ⚠️ SETIAP KALI KAMU MENGEDIT FILE INI, kamu WAJIB membuat versi
 * deployment baru supaya perubahannya benar-benar aktif:
 * Deploy → Manage deployments → klik ikon pensil pada deployment yang
 * ada → Version: "New version" → Deploy. Menekan tombol Save (💾) saja
 * TIDAK cukup — URL /exec akan tetap menjalankan kode versi lama.
 *
 * CARA CEK KALAU DATA TIDAK MASUK KE SHEET (debug):
 * 1. Buka URL /exec langsung di browser (GET). Harus muncul teks
 *    "ZHD webhook aktif" — kalau muncul halaman login Google atau error
 *    izin, berarti "Who has access" belum diset ke "Anyone".
 * 2. Di editor Apps Script, buka menu kiri "Executions" / "Eksekusi"
 *    setelah kamu coba submit form di situs. Kalau ada baris doPost
 *    berwarna merah (gagal), klik untuk lihat pesan errornya.
 * 3. Pastikan kamu deploy ulang (lihat catatan di atas) setelah tiap
 *    edit ke file ini.
 * 4. Pastikan SHEET_WEBHOOK_URL di script.js situs sama persis dengan
 *    URL /exec yang terbaru.
 */

const SHEET_NAME = "Pesanan";

function doGet(e) {
  return ContentService.createTextOutput("ZHD webhook aktif — siap menerima pesanan.");
}

function doPost(e) {
  const sheet = getOrCreateSheet();
  const data = parseIncomingData(e);

  const itemsSummary = (data.items || [])
    .map((it) => `${it.nama} (${it.kategori}) x${it.qty}, ¥${it.hargaAsal}, ${it.beratPcs}kg/pcs`)
    .join(" | ");

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.orderCode || "",
    data.nama || "",
    data.whatsapp || "",
    data.alamat || "",
    data.linkProduk || "",
    data.catatan || "",
    itemsSummary,
    data.kursJualDipakai || "",
    data.totalBarang || "",
    data.totalOngkir || "",
    data.totalPajak || "",
    data.totalFee || "",
    data.totalTagihan || "",
    data.totalModalAdmin || "",
    data.estimasiUntungAdmin || "",
  ]);

  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}

/* Situs mengirim data dengan dua cara yang mungkin:
   - form tersembunyi (application/x-www-form-urlencoded, field "payload")
   - fetch dengan body JSON mentah (text/plain atau application/json)
   Fungsi ini menangani keduanya supaya tidak gampang putus kalau salah
   satu metode berubah. */
function parseIncomingData(e) {
  try {
    if (e.parameter && e.parameter.payload) {
      return JSON.parse(e.parameter.payload);
    }
    if (e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (err) {
    // biarkan jatuh ke objek kosong di bawah — baris tetap tercatat,
    // hanya kosong, supaya kita tahu ada percobaan submit yang gagal parse.
  }
  return {};
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Waktu",
      "Kode Pesanan",
      "Nama",
      "WhatsApp",
      "Alamat",
      "Link Produk",
      "Catatan",
      "Ringkasan Barang",
      "Kurs Jual Dipakai",
      "Total Harga Barang",
      "Total Ongkir",
      "Total Pajak",
      "Total Fee",
      "Total Tagihan",
      "Total Modal (admin)",
      "Estimasi Untung (admin)",
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
