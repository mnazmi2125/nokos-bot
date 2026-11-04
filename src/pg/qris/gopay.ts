// Adapter deposit QRIS statis + auto-deteksi pembayaran via GoPay Merchant
// (library tidak resmi di-vendor: ./vendor/gobiz.js — github.com/kavionn/gobiz-payment, MIT).
//
// Alur:
//   createInvoice → QRIS dinamis (emv.ts) dengan nominal + kode unik → dikirim ke user.
//   getStatus     → baca feed transaksi merchant (cache 6 detik), cocokkan
//                   nominal (amount + unique_code) + jendela waktu + status SETTLEMENT/CAPTURE,
//                   klaim atomik matched_tx_id (satu transaksi = satu deposit, anti kredit ganda).

import type { PgAdapter, PgCreateOpts, PgInvoice, PgStatus } from "../types.js";
import { DEPOSIT_EXPIRE_MIN } from "../types.js";
import { buildDynamicQris } from "./emv.js";
import GoPayMerchant, { type GopayHistoryItem } from "./vendor/gobiz.js";
import { q1, qExec } from "../../db/index.js";
import type { DbDeposit } from "../../db/deposits.js";

const FEED_TTL_MS = 6_000;
const CLOCK_SKEW_MS = 60_000; // toleransi jam server vs GoPay
const LOGIN_COOLDOWN_MS = 10 * 60_000; // anti-spam: login OTP paling sering 1x / 10 menit
const OTP_WAIT_MS = 3 * 60_000; // waktu admin mengirim kode

let merchantSingleton: GoPayMerchant | null = null;
let feedCache: { at: number; items: GopayHistoryItem[] } | null = null;
const warnedTx = new Set<string>();
let lastLoginFailAt = 0;
let cooldownWarnedAt = 0;
let otpNotifier: ((msg: string) => Promise<void>) | null = null;
let pendingOtp: { resolve: (code: string) => void; timer: ReturnType<typeof setTimeout> } | null = null;

/** Dipanggil dari index.ts: kirim pesan Telegram saat bot butuh kode OTP. */
export function setOtpNotifier(fn: (msg: string) => Promise<void>): void {
  otpNotifier = fn;
}

/** Dipanggil handler /gopayotp: setor kode dari admin → login dilanjutkan. */
export function deliverOtpCode(code: string): boolean {
  if (!pendingOtp) return false;
  clearTimeout(pendingOtp.timer);
  pendingOtp.resolve(code);
  pendingOtp = null;
  return true;
}

function waitForOtpCode(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingOtp = null;
      reject(new Error("Kode OTP tidak dikirim dalam 3 menit — login dibatalkan."));
    }, OTP_WAIT_MS);
    pendingOtp = { resolve, timer };
  });
}

function getMerchant(): GoPayMerchant {
  if (!merchantSingleton) {
    // Bot headless: OTP TIDAK dibaca dari terminal. Library mengirim OTP ke HP
    // dulu, lalu memanggil callback ini — kami minta kode via /gopayotp di Telegram.
    merchantSingleton = new GoPayMerchant({
      otpCallback: async (phone) => {
        lastLoginFailAt = Date.now(); // OTP sudah terkirim → mulai jendela anti-spam
        const admin = process.env.GOPAY_OTP_ADMIN?.trim();
        if (!admin) {
          throw new Error(
            "Token GoPay kedaluwarsa & GOPAY_OTP_ADMIN belum diisi di .env (atau jalankan node scripts/gobiz-test.js)."
          );
        }
        if (pendingOtp) throw new Error("Masih menunggu kode OTP sebelumnya.");
        if (otpNotifier)
          otpNotifier(
            `🔑 <b>Token GoPay kedaluwarsa</b>\nKode OTP dikirim ke nomor ${phone}.\n\nBalas dalam 3 menit:\n<code>/gopayotp 123456</code>`
          ).catch(() => {});
        return waitForOtpCode();
      },
    });
  }
  return merchantSingleton;
}

/** Feed transaksi hari ini (SETTLEMENT/CAPTURE/REFUND) — di-cache agar hemat request. */
async function getFeed(): Promise<GopayHistoryItem[]> {
  if (feedCache && Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.items;
  // Anti-spam OTP: library MENGIRIM OTP sebelum callback dipanggil, jadi
  // percobaan login harus dicegah DI SINI — setelah gagal, tahan dulu.
  if (Date.now() - lastLoginFailAt < LOGIN_COOLDOWN_MS) {
    const menit = Math.ceil((LOGIN_COOLDOWN_MS - (Date.now() - lastLoginFailAt)) / 60_000);
    throw new Error(`login GoPay ditahan anti-spam OTP (${menit} menit lagi)`);
  }
  const m = getMerchant();
  try {
    const res = await m.getHistory({ days: 1, size: 50 });
    if (!res.status) throw new Error(res.message ?? "Gagal membaca feed transaksi GoPay");
    const items = res.data?.histories ?? [];
    feedCache = { at: Date.now(), items };
    return items;
  } catch (e) {
    const msg = (e as Error).message;
    if (/otp|login|verifikasi|kode/i.test(msg)) {
      lastLoginFailAt = Date.now(); // kegagalan login → jangan ulangi (cegah banjir OTP)
      if (otpNotifier)
        otpNotifier(`❌ <b>Login GoPay gagal</b>: ${msg}\nCoba lagi setelah jendela anti-spam selesai.`).catch(() => {});
    }
    throw e;
  }
}

export class GopayQrAdapter implements PgAdapter {
  readonly name = "gopayqris";

  configError(): string | null {
    if (!process.env.GOPAY_QRIS_STATIC?.trim())
      return "Deposit QRIS belum dikonfigurasi — hubungi admin";
    return null;
  }

  async createInvoice(opts: PgCreateOpts): Promise<PgInvoice> {
    const staticQris = process.env.GOPAY_QRIS_STATIC!.trim();
    const payload = buildDynamicQris(staticQris, opts.amount);
    const expiresAt = new Date(
      Date.now() + (opts.expiresInMin ?? DEPOSIT_EXPIRE_MIN) * 60_000
    );
    return {
      ref: opts.displayRef,
      displayRef: opts.displayRef,
      link: "",
      qrString: payload,
      amount: opts.amount,
      expiresAt,
    };
  }

  async getStatus(ref: string): Promise<PgStatus> {
    const d = await q1<DbDeposit>(
      "SELECT * FROM tb_deposits WHERE external_id = ?",
      [ref]
    );
    if (!d) return "PENDING"; // tidak ada di list pending → aman
    if (d.status !== "PENDING") return d.status;
    // Sudah diklaim siklus sebelumnya (crash tepat setelah klaim) → lunas.
    if (d.matched_tx_id) return "PAID";

    const expected = d.amount + d.unique_code;
    const createdMs = new Date(d.created_at).getTime();
    const windowStart = createdMs - CLOCK_SKEW_MS;
    const windowEnd = createdMs + DEPOSIT_EXPIRE_MIN * 60_000 + CLOCK_SKEW_MS;

    let items: GopayHistoryItem[];
    try {
      items = await getFeed();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("anti-spam")) {
        // Wajar selama cooldown — cukup log sesekali, jangan spam terminal
        if (Date.now() - cooldownWarnedAt > 10 * 60_000) {
          cooldownWarnedAt = Date.now();
          console.warn(`[qris] ⏳ ${msg} — menunggu /gopayotp dari admin`);
        }
        return "PENDING";
      }
      throw e;
    }
    // Urutkan dari terlama agar deposit lama diprioritaskan.
    const sorted = [...items].sort(
      (a, b) =>
        new Date(a.raw.transaction_time ?? 0).getTime() -
        new Date(b.raw.transaction_time ?? 0).getTime()
    );

    for (const it of sorted) {
      const tx = it.raw;
      const status = (tx.transaction_status ?? "").toUpperCase();
      if (status !== "SETTLEMENT" && status !== "CAPTURE") continue; // buang REFUND
      if ((tx.payment_type ?? "").toUpperCase() !== "QRIS") continue;
      if (typeof tx.gross_amount !== "number") continue;
      if (Math.round(tx.gross_amount / 100) !== expected) continue;

      const txMs = new Date(tx.transaction_time ?? 0).getTime();
      const txId = tx.id;
      if (!txId || Number.isNaN(txMs)) continue;

      if (txMs < windowStart || txMs > windowEnd) {
        // Nominal cocok di luar jendela deposit → uang tidak cocok siapa pun.
        if (!warnedTx.has(txId)) {
          warnedTx.add(txId);
          console.warn(
            `[qris] ⚠️ transaksi Rp ${expected} (${txId}) di luar jendela deposit — periksa manual`
          );
        }
        continue;
      }

      // Transaksi sudah dipakai deposit lain?
      const used = await q1<{ id: number }>(
        "SELECT id FROM tb_deposits WHERE matched_tx_id = ?",
        [txId]
      );
      if (used) continue;

      // Klaim atomik: hanya menang bila deposit masih PENDING & belum diklaim.
      const claim = await qExec(
        "UPDATE tb_deposits SET matched_tx_id = ? WHERE external_id = ? AND status = 'PENDING' AND matched_tx_id IS NULL",
        [txId, ref]
      );
      if (claim.affectedRows === 1) {
        console.log(
          `[qris] ✅ deposit ${ref} cocok transaksi ${txId} (Rp ${expected})`
        );
        return "PAID";
      }
      // Kandidat dipakai proses lain → lanjut transaksi berikutnya.
    }
    return "PENDING";
  }
}
