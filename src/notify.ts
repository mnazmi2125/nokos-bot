// Notifikasi publik (history transaksi & deposit) ke channel/grup Telegram.
// Aktif bila NOTIFY_CHANNEL_ID diisi di .env — kosong = fitur mati.
// Nomor HP pembeli disensor (4 digit awal + **** + 4 digit akhir) demi keamanan publik.
import type { Bot } from "grammy";
import type { DbOrder } from "./db/orders.js";
import type { DbDeposit } from "./db/deposits.js";

const HR = "━━━━━";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Sensor nomor: 4 digit awal + **** + 4 digit akhir (contoh: 6285****9340). */
export function maskPhone(p: string | null): string {
  if (!p) return "-";
  const s = p.replace(/\D/g, "");
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

function header(): string {
  return esc(process.env.NOTIFY_HEADER?.trim() || "HISTORY TRANSAKSI");
}

/** Fitur notifikasi aktif? (NOTIFY_CHANNEL_ID terisi & format benar) */
export function notifyEnabled(): boolean {
  const t = process.env.NOTIFY_CHANNEL_ID?.trim();
  if (!t) return false;
  if (t.startsWith("-") || t.startsWith("@")) return true;
  console.warn("[notify] NOTIFY_CHANNEL_ID tidak valid (pakai -100xxx atau @username)");
  return false;
}

async function send(bot: Bot, text: string): Promise<void> {
  try {
    await bot.api.sendMessage(process.env.NOTIFY_CHANNEL_ID!.trim(), text, {
      parse_mode: "HTML",
    });
  } catch (e) {
    console.warn("[notify] gagal kirim ke channel (cek ID & bot sudah admin?):", (e as Error).message);
  }
}

/** Notifikasi transaksi OTP berhasil (nomor disensor, kode SMS ditampilkan). */
export async function notifyOrder(
  bot: Bot | null,
  o: DbOrder,
  otpMessage: string | null
): Promise<void> {
  if (!bot || !notifyEnabled()) return;
  try {
    const sms = otpMessage ?? o.otp_message ?? "-";
    const text = [
      `🔐 <b>${header()} — REAL TIME OTP</b>`,
      HR,
      `🖥 SERVER: ${esc(o.server)}`,
      `🆔 ID: <code>${o.provider_order_id}</code>`,
      `📱 LAYANAN: ${esc(o.service_name)}`,
      `🌍 NEGARA: ${esc(o.country_emoji)} ${esc(o.country_name)}`,
      `📱 NOMOR: <code>${maskPhone(o.phone_number)}</code>`,
      `💵 HARGA: Rp ${o.price_sell.toLocaleString("id-ID")}`,
      HR,
      `📩 SMS:`,
      `<pre>${esc(sms)}</pre>`,
    ].join("\n");
    await send(bot, text);
  } catch (e) {
    console.warn("[notify] order gagal dikirim:", (e as Error).message);
  }
}

/** Notifikasi deposit berhasil masuk. */
export async function notifyDeposit(bot: Bot | null, d: DbDeposit): Promise<void> {
  if (!bot || !notifyEnabled()) return;
  try {
    const lines = [
      `💳 <b>${header()} — DEPOSIT BERHASIL</b>`,
      HR,
      `🆔 ORDER ID: <code>${esc(d.external_id)}</code>`,
      `💰 NOMINAL: Rp ${d.amount.toLocaleString("id-ID")}`,
    ];
    if (d.unique_code > 0) lines.push(`🧾 FEE: Rp ${d.unique_code.toLocaleString("id-ID")}`);
    lines.push(`💳 METODE: ${esc(d.method)}`);
    await send(bot, lines.join("\n"));
  } catch (e) {
    console.warn("[notify] deposit gagal dikirim:", (e as Error).message);
  }
}
