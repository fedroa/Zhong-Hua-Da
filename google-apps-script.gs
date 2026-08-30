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
 */

const SHEET_NAME = "Pesanan";

function doPost(e) {
  const sheet = getOrCreateSheet();
  const data = JSON.parse(e.postData.contents);

  const itemsSummary = (data.items || [])
    .map((it) => `${it.nama} (${it.kategori}) x${it.qty}, ¥${it.hargaAsal}, ${it.beratPcs}kg/pcs`)
    .join(" | ");

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
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

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Waktu",
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
