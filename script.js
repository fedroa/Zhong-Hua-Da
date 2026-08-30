/* =====================================================================
   ZHONG HUA DA — script.js
   Kalkulator estimasi biaya (kurs + ongkir + bea masuk) untuk pembeli,
   dan form order yang mencatat ke Google Sheets lalu menampilkan info
   transfer ke rekening BCA di halaman (tanpa mengirim apa pun ke
   WhatsApp secara otomatis).

   ⚠️ PENTING UNTUK ADMIN — atur sebelum upload ke GitHub:
   1. BCA_ACCOUNT_NUMBER / BCA_ACCOUNT_NAME → data rekening BCA-mu
   2. SHEET_WEBHOOK_URL   → URL Web App Google Apps Script (lihat
                             google-apps-script.gs & README.md untuk cara
                             membuatnya, TERMASUK cara debug kalau data
                             tidak masuk ke spreadsheet)
   3. ADMIN_SETTINGS      → tarif ongkir, fee, dan pajak yang kamu pakai.
                             Ini SENGAJA tidak dibuat jadi kolom isian di
                             halaman, supaya pembeli tidak bisa mengubah
                             angkanya sendiri lewat form.

   Catatan jujur: karena ini situs statis (client-side), seseorang yang
   membuka DevTools browser tetap bisa melihat/mengubah nilai-nilai ini
   sebelum submit. Menyembunyikannya dari tampilan menghentikan mayoritas
   percobaan iseng, tapi bukan pengaman mutlak — selalu cocokkan mutasi
   rekening dengan kode pesanan di spreadsheet sebelum memproses barang.
===================================================================== */

const BCA_ACCOUNT_NUMBER = "1411210001"; // TODO: ganti dengan nomor rekening BCA-mu
const BCA_ACCOUNT_NAME = "FEDRO ANDREANTO"; // TODO: ganti dengan nama sesuai buku tabungan

const SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx81OFlFpL6FW5YZ58VPENGYiN82z6nxbOw5PZdrzpchnyVvKz2tjS2Xg7G6XO9mhGvUw/exec";


const ADMIN_SETTINGS = {
  kursMarginPerYuan: 50, // Rp ditambahkan ke kurs pasar acuan → mendekati kurs jual BCA
  ongkirModalPerKg: 42000, // biaya ongkir asli dari forwarder (privat, untuk catatan internal)
  ongkirJualPerKg: 50000, // yang ditagihkan ke pembeli
  feeMode: "percent", // 'percent' | 'flat-item' | 'flat-order'
  feeValue: 10,
  feeLabel: "10% dari harga barang",
  asuransiPct: 1, // dibebankan sbg biaya modal internal, tidak ditagihkan terpisah
  deMinimisIDR: 45000,
  beaMasukPct: 7.5,
  ppnPct: 11,
};

/* Kategori barang. `forcedTax=true` artinya kategori ini SELALU kena
   bea masuk & pajak impor berapa pun nilainya (mengikuti ketentuan
   Bea Cukai untuk tas, sepatu, dan produk tekstil). */
const CATEGORIES = [
  { value: "umum", label: "Umum / Lainnya", forcedTax: false },
  { value: "tekstil", label: "Pakaian & Tekstil", forcedTax: true },
  { value: "sepatu-tas", label: "Sepatu & Tas", forcedTax: true },
  { value: "elektronik", label: "Elektronik & Gadget", forcedTax: false },
  { value: "kosmetik", label: "Kosmetik & Skincare", forcedTax: false },
  { value: "mainan", label: "Mainan & Aksesoris", forcedTax: false },
];

/* Kurs berjalan — diisi oleh refreshKursOtomatis(). kursModal adalah
   kurs pasar acuan mentah; kursJual = kursModal + margin tetap admin. */
let currentKurs = { modal: 0, jual: 0, lastUpdated: null };

let itemIdCounter = 0;

function createItemRow(prefill = {}) {
  const id = ++itemIdCounter;
  const tr = document.createElement("tr");
  tr.dataset.id = id;

  const categoryOptions = CATEGORIES.map(
    (c) => `<option value="${c.value}">${c.label}</option>`
  ).join("");

  tr.innerHTML = `
    <td class="col-name"><input type="text" class="f-name" placeholder="Contoh: Sweater rajut" value="${prefill.name || ""}"></td>
    <td class="col-cat"><select class="f-cat">${categoryOptions}</select></td>
    <td class="col-price"><input type="number" class="f-price" min="0" step="0.1" value="${prefill.price ?? ""}"></td>
    <td class="col-qty"><input type="number" class="f-qty" min="1" step="1" value="${prefill.qty ?? 1}"></td>
    <td class="col-weight"><input type="number" class="f-weight" min="0" step="0.05" value="${prefill.weight ?? 0.3}"></td>
    <td class="col-del"><button type="button" class="btn-del-row" title="Hapus barang" aria-label="Hapus barang">✕</button></td>
  `;

  tr.querySelector(".btn-del-row").addEventListener("click", () => {
    tr.remove();
    if (!document.getElementById("items-tbody").children.length) {
      addItemRow();
    }
    runCalculation();
  });

  tr.querySelectorAll("input, select").forEach((el) =>
    el.addEventListener("input", runCalculation)
  );

  return tr;
}

function addItemRow(prefill) {
  document.getElementById("items-tbody").appendChild(createItemRow(prefill));
}

/* ---------------------------------------------------------------------
   FORMATTERS
--------------------------------------------------------------------- */
const rupiah = (n) =>
  "Rp " + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

function roundUpToNearest(value, step) {
  return Math.ceil(value / step) * step;
}

/* ---------------------------------------------------------------------
   READ ITEMS FROM THE TABLE + BUYER'S NPWP STATUS
--------------------------------------------------------------------- */
function readItems() {
  return Array.from(document.querySelectorAll("#items-tbody tr")).map((tr) => {
    const catValue = tr.querySelector(".f-cat").value;
    const category = CATEGORIES.find((c) => c.value === catValue) || CATEGORIES[0];
    return {
      name: tr.querySelector(".f-name").value.trim() || "Barang tanpa nama",
      category,
      priceOrigin: parseFloat(tr.querySelector(".f-price").value) || 0,
      qty: Math.max(1, parseInt(tr.querySelector(".f-qty").value, 10) || 1),
      weight: parseFloat(tr.querySelector(".f-weight").value) || 0,
    };
  });
}

function readPphPct() {
  const npwpRadio = document.querySelector('input[name="npwp"]:checked');
  return npwpRadio ? parseFloat(npwpRadio.value) : 10;
}

/* ---------------------------------------------------------------------
   CORE CALCULATION
   Tarif (kurs, ongkir, fee, bea, PPN, asuransi) semuanya berasal dari
   ADMIN_SETTINGS / currentKurs — TIDAK ada yang bisa diketik ulang oleh
   pembeli. Satu-satunya input pembeli yang memengaruhi tarif pajak
   adalah status NPWP mereka sendiri (itu memang data mereka, bukan
   parameter bisnis).

   Untuk tiap barang:
     1. Konversi harga asal (¥) ke IDR pakai kurs modal & kurs jual.
     2. Hitung ongkir dari total berat barang itu.
     3. Hitung nilai CIF (Cost + Insurance + Freight) versi modal —
        dasar yang dipakai Bea Cukai untuk menghitung pajak.
     4. Kalau CIF melewati de minimis ATAU kategori selalu kena pajak
        (tas/sepatu/tekstil): Bea Masuk, PPN, PPh dihitung berjenjang.
     5. Fee jastip dihitung sesuai mode admin.
     6. Harga jual ke pembeli = nilai barang (kurs jual) + ongkir jual
        + pajak (diteruskan apa adanya) + fee jastip.
     7. Modal admin = nilai barang (kurs modal) + ongkir modal +
        asuransi + pajak — dipakai untuk catatan internal di Sheet,
        TIDAK ditampilkan di halaman publik.
--------------------------------------------------------------------- */
function calculate(items, pphPct) {
  const s = ADMIN_SETTINGS;
  const kursModal = currentKurs.modal;
  const kursJual = currentKurs.jual;

  let totalBarangJual = 0,
    totalOngkirJual = 0,
    totalPajak = 0,
    totalFee = 0,
    totalModal = 0,
    totalBerat = 0;

  items.forEach((item) => {
    const nilaiBarangModal = item.priceOrigin * item.qty * kursModal;
    const nilaiBarangJual = item.priceOrigin * item.qty * kursJual;
    const beratTotal = item.weight * item.qty;
    const ongkirModal = beratTotal * s.ongkirModalPerKg;
    const ongkirJual = beratTotal * s.ongkirJualPerKg;
    const asuransi = (nilaiBarangModal * s.asuransiPct) / 100;

    const cif = nilaiBarangModal + ongkirModal + asuransi;
    const kenaPajak = item.category.forcedTax || cif > s.deMinimisIDR;

    let pajak = 0;
    if (kenaPajak) {
      const beaMasuk = (cif * s.beaMasukPct) / 100;
      const dasarPajak = cif + beaMasuk;
      const ppn = (dasarPajak * s.ppnPct) / 100;
      const pph = (dasarPajak * pphPct) / 100;
      pajak = beaMasuk + ppn + pph;
    }

    let fee = 0;
    if (s.feeMode === "percent") {
      fee = (nilaiBarangModal * s.feeValue) / 100;
    } else if (s.feeMode === "flat-item") {
      fee = s.feeValue * item.qty;
    }
    // flat-order fee is added once, after the loop.

    totalBarangJual += nilaiBarangJual;
    totalOngkirJual += ongkirJual;
    totalPajak += pajak;
    totalFee += fee;
    totalBerat += beratTotal;
    totalModal += nilaiBarangModal + ongkirModal + asuransi + pajak;
  });

  if (s.feeMode === "flat-order" && items.length) {
    totalFee += s.feeValue;
  }

  const totalTagihanRaw = totalBarangJual + totalOngkirJual + totalPajak + totalFee;
  const totalTagihan = roundUpToNearest(totalTagihanRaw, 500);
  const totalUntung = totalTagihan - totalModal;
  const marginPct = totalTagihan > 0 ? (totalUntung / totalTagihan) * 100 : 0;

  return {
    totalBarangJual,
    totalOngkirJual,
    totalPajak,
    totalFee,
    totalModal,
    totalBerat,
    totalTagihan,
    totalUntung,
    marginPct,
  };
}

/* ---------------------------------------------------------------------
   RENDER: tarif info (read-only) + hasil publik + ringkasan form order
--------------------------------------------------------------------- */
function renderRateInfo() {
  document.getElementById("info-kurs").textContent =
    currentKurs.jual > 0 ? rupiah(currentKurs.jual) + " /¥" : "Memuat...";
  document.getElementById("info-ongkir").textContent =
    rupiah(ADMIN_SETTINGS.ongkirJualPerKg) + " /kg";
  document.getElementById("info-fee").textContent = ADMIN_SETTINGS.feeLabel;
  document.getElementById("info-pajak").textContent =
    `${ADMIN_SETTINGS.beaMasukPct}% + ${ADMIN_SETTINGS.ppnPct}%`;
}

function runCalculation() {
  const items = readItems();
  const pphPct = readPphPct();
  const r = calculate(items, pphPct);

  document.getElementById("res-total-tagihan").textContent = rupiah(r.totalTagihan);
  document.getElementById("res-barang").textContent = rupiah(r.totalBarangJual);
  document.getElementById("res-ongkir").textContent = rupiah(r.totalOngkirJual);
  document.getElementById("res-pajak").textContent = rupiah(r.totalPajak);
  document.getElementById("res-fee").textContent = rupiah(r.totalFee);

  document.getElementById("res-berat").textContent =
    r.totalBerat.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " kg";
  document.getElementById("res-jenis").textContent = items.filter((it) => it.priceOrigin > 0).length;
  document.getElementById("res-kurs-used").textContent =
    currentKurs.jual > 0 ? rupiah(currentKurs.jual) + " /¥" : "-";

  renderRateInfo();
  updateOrderSummary(items, r);
  return { items, pphPct, result: r };
}

function updateOrderSummary(items, r) {
  const list = document.getElementById("order-summary-list");
  const empty = document.getElementById("order-summary-empty");
  const hasRealItems = items.some((it) => it.priceOrigin > 0);

  if (!hasRealItems) {
    list.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.hidden = false;
  list.innerHTML = "";

  items.forEach((it) => {
    if (it.priceOrigin <= 0) return;
    const li = document.createElement("li");
    li.innerHTML = `<span>${it.name} ×${it.qty}</span><span>¥ ${(it.priceOrigin * it.qty).toFixed(2)}</span>`;
    list.appendChild(li);
  });

  const totalLi = document.createElement("li");
  totalLi.innerHTML = `<span><strong>Estimasi total tagihan</strong></span><span><strong>${rupiah(r.totalTagihan)}</strong></span>`;
  list.appendChild(totalLi);
}

/* ---------------------------------------------------------------------
   AUTO KURS
   Mengambil kurs pasar acuan CNY→IDR dari API publik gratis
   (open.er-api.com, tanpa API key, update harian), lalu menambahkan
   margin tetap admin supaya mendekati kurs jual BCA. Nilainya TIDAK
   bisa diketik ulang oleh pembeli.
--------------------------------------------------------------------- */
const KURS_API_URL = "https://open.er-api.com/v6/latest/CNY";

async function refreshKursOtomatis() {
  const btn = document.getElementById("btn-refresh-kurs");
  const status = document.getElementById("kurs-status");

  btn.disabled = true;
  btn.innerHTML = '<span class="btn-refresh-spin">↻</span> Mengambil kurs...';
  status.className = "kurs-status";
  status.textContent = "Menghubungi sumber kurs...";

  try {
    const res = await fetch(KURS_API_URL);
    if (!res.ok) throw new Error("Respon server tidak valid (" + res.status + ")");
    const data = await res.json();
    const rate = data?.rates?.IDR;
    if (!rate || typeof rate !== "number") throw new Error("Data kurs IDR tidak ditemukan");

    currentKurs.modal = rate;
    currentKurs.jual = rate + ADMIN_SETTINGS.kursMarginPerYuan;
    currentKurs.lastUpdated = new Date();

    const time = currentKurs.lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    status.className = "kurs-status is-ok";
    status.textContent = `Diperbarui pukul ${time} · kurs pasar Rp ${Math.round(rate).toLocaleString("id-ID")} + margin Rp${ADMIN_SETTINGS.kursMarginPerYuan}`;

    runCalculation();
  } catch (err) {
    status.className = "kurs-status is-error";
    status.textContent = currentKurs.jual > 0
      ? "Gagal menyegarkan kurs — memakai kurs terakhir yang berhasil diambil."
      : "Gagal mengambil kurs otomatis. Coba lagi sebentar lagi, atau hubungi admin.";
  } finally {
    btn.disabled = false;
    btn.innerHTML = "↻ Segarkan Kurs";
  }
}

/* ---------------------------------------------------------------------
   KODE PESANAN
   Dipakai sebagai referensi berita transfer, supaya mudah dicocokkan
   dengan baris di spreadsheet.
--------------------------------------------------------------------- */
function generateOrderCode() {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ZHD-${datePart}-${randPart}`;
}

/* ---------------------------------------------------------------------
   CATAT PESANAN KE GOOGLE SHEETS
   Dikirim lewat form tersembunyi yang menyasar iframe tersembunyi
   (bukan fetch). Cara ini menghindari masalah CORS yang sering muncul
   dengan Google Apps Script Web App, karena submit <form> ke iframe
   tidak tunduk pada aturan CORS seperti fetch/XHR — permintaannya
   pasti terkirim ke server selama URL & deployment-nya benar.

   Kalau data tetap tidak masuk ke sheet, itu HAMPIR SELALU berarti
   masalah di sisi Apps Script, bukan di kode ini. Cek README.md bagian
   "Debug: data tidak masuk ke spreadsheet" untuk langkah-langkahnya.
--------------------------------------------------------------------- */
function submitOrderToSheet(payload) {
  if (!SHEET_WEBHOOK_URL) {
    console.warn("SHEET_WEBHOOK_URL belum diisi — pesanan tidak dicatat ke spreadsheet.");
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = SHEET_WEBHOOK_URL;
  form.target = "zhd-hidden-frame";
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(payload);
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 3000);
}

/* ---------------------------------------------------------------------
   ORDER FORM SUBMIT → CATAT KE SHEET + TAMPILKAN INFO TRANSFER BCA
--------------------------------------------------------------------- */
function handleOrderSubmit(e) {
  e.preventDefault();

  const nama = document.getElementById("ord-nama").value.trim();
  const wa = document.getElementById("ord-wa").value.trim();
  const alamat = document.getElementById("ord-alamat").value.trim();
  const link = document.getElementById("ord-link").value.trim();
  const catatan = document.getElementById("ord-catatan").value.trim();

  const { items, result } = runCalculation();
  const realItems = items.filter((it) => it.priceOrigin > 0);
  const orderCode = generateOrderCode();

  submitOrderToSheet({
    orderCode,
    timestamp: new Date().toISOString(),
    nama,
    whatsapp: wa,
    alamat,
    linkProduk: link,
    catatan,
    items: realItems.map((it) => ({
      nama: it.name,
      kategori: it.category.label,
      hargaAsal: it.priceOrigin,
      qty: it.qty,
      beratPcs: it.weight,
    })),
    kursJualDipakai: currentKurs.jual,
    totalBarang: Math.round(result.totalBarangJual),
    totalOngkir: Math.round(result.totalOngkirJual),
    totalPajak: Math.round(result.totalPajak),
    totalFee: Math.round(result.totalFee),
    totalTagihan: Math.round(result.totalTagihan),
    totalModalAdmin: Math.round(result.totalModal),
    estimasiUntungAdmin: Math.round(result.totalUntung),
  });

  showPaymentConfirmation(orderCode, result.totalTagihan);
}

function showPaymentConfirmation(orderCode, totalTagihan) {
  document.getElementById("order-form").hidden = true;
  document.getElementById("payment-order-code").textContent = orderCode;
  document.getElementById("payment-account-number").textContent = BCA_ACCOUNT_NUMBER;
  document.getElementById("payment-account-name").textContent = BCA_ACCOUNT_NAME;
  document.getElementById("payment-amount").textContent = rupiah(totalTagihan);
  document.getElementById("payment-confirm").hidden = false;
  document.getElementById("payment-confirm").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------------------------------------------------------------
   INIT
--------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  addItemRow({ name: "Sweater rajut", price: 79, qty: 2, weight: 0.35 });

  document.getElementById("btn-add-item").addEventListener("click", () => {
    addItemRow();
    runCalculation();
  });

  document.getElementById("btn-refresh-kurs").addEventListener("click", refreshKursOtomatis);

  document
    .querySelectorAll('input[name="npwp"]')
    .forEach((el) => el.addEventListener("input", runCalculation));

  document.getElementById("order-form").addEventListener("submit", handleOrderSubmit);

  document.getElementById("btn-order-again").addEventListener("click", () => {
    document.getElementById("order-form").reset();
    document.getElementById("order-form").hidden = false;
    document.getElementById("payment-confirm").hidden = true;
    runCalculation();
  });

  document.getElementById("footer-year").textContent = new Date().getFullYear();

  renderRateInfo();
  refreshKursOtomatis(); // ambil kurs begitu halaman dibuka
});
