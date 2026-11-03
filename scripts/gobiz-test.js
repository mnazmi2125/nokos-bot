// Script uji koneksi GoPay Merchant (langkah verifikasi sebelum integrasi bot).
// Jalankan: node scripts/gobiz-test.js
//
// Konfigurasi di file .env root proyek (pilih SATU metode login):
//   [A] Email + Password (otomatis penuh, disetel di portal GoFood Merchant):
//       GOPAY_LOGIN_METHOD=password
//       GOPAY_EMAIL=email@merchant.com
//       GOPAY_PASSWORD=****
//   [B] Nomor HP + OTP (terminal akan meminta kode OTP):
//       GOPAY_LOGIN_METHOD=otp
//       GOPAY_PHONE=08123456789

import GoPayMerchant from "../src/pg/qris/vendor/gobiz.js";

function fmtRp(n) {
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

async function main() {
  console.log("[uji] Inisialisasi GoPayMerchant (login bila token belum ada)...");
  const merchant = new GoPayMerchant();
  await merchant.init();
  console.log(`[uji] Merchant ID : ${merchant.merchantId}`);
  console.log(`[uji] Token       : ${merchant.token ? "ada" : "tidak ada"}`);

  console.log("[uji] Mengambil riwayat transaksi (1 hari terakhir)...");
  const result = await merchant.getHistory({ days: 1, size: 20 });

  if (!result.status) {
    console.error("[uji] GAGAL:", result.message);
    process.exit(1);
  }

  const rows = result.data.histories;
  console.log(`[uji] Ditemukan ${rows.length} transaksi hari ini.\n`);

  // Flag --raw: tampilkan JSON mentah transaksi terbaru (untuk identifikasi field status/refund)
  if (process.argv.includes("--raw") && rows[0]) {
    console.log("[uji] RAW JSON transaksi terbaru:");
    console.log(JSON.stringify(rows[0].raw, null, 2));
    console.log("");
  }

  rows.slice(0, 5).forEach((tx, i) => {
    const raw = tx.raw ?? {};
    console.log(`--- #${i + 1} ---`);
    console.log(`  Waktu    : ${tx.time}`);
    console.log(`  Nominal  : ${tx.amount.displayed_text}`);
    console.log(`  Status   : ${raw.status ?? "-"}`);
    console.log(`  Tipe     : ${raw.payment_type ?? "-"}`);
    console.log(`  ID Tx    : ${raw.transaction_id ?? raw.id ?? raw.order_id ?? "-"}`);
    console.log(`  Payer    : ${raw.transaction_source ?? raw.payment_source ?? "-"}`);
  });

  console.log(
    rows.length === 0
      ? "\n[uji] Tidak ada transaksi hari ini — buat 1 transaksi kecil dulu dari app GoPay Merchant (mis. bayar QRIS mana pun), lalu jalankan ulang."
      : "\n[uji] ✅ KONEKSI OK — data transaksi terbaca. Langkah integrasi aman dilanjutkan."
  );

  if (rows.length > 0) {
    console.log("\n[uji] === DUMP JSON mentah transaksi #1 (untuk desain matcher) ===");
    console.log(JSON.stringify(rows[0].raw, null, 2));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("\n[uji] ERROR:", e.message);
  if (String(e.message).includes("OTP") || String(e.message).includes("GOPAY_")) {
    console.error("[uji] Periksa konfigurasi GOPAY_* di file .env root proyek.");
  }
  process.exit(1);
});
