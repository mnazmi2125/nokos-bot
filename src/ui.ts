import { InlineKeyboard } from "grammy";

function csUrl(csContact?: string | null): string {
  if (!csContact) return "https://t.me/belzzzea";
  if (csContact.startsWith("http")) return csContact;
  return `https://t.me/${csContact.replace(/^@/, "")}`;
}

function buildMenu(csContact?: string | null): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(" Cara Penggunaan", "help")
    .row()
    .text(" Order OTP", "order")
    .text(" Deposit", "deposit")
    .row()
    .text(" Histori Order", "hist_order")
    .text(" Histori Deposit", "hist_deposit")
    .row()
    .text(" Referral", "referral")
    .url(" Contact CS", csUrl(csContact))
    .row();
  if (process.env.RESELLER_MODE !== "1") {
    kb.text(" Reseller Bot", "reseller").text("SMM Panel", "panel").row();
  }
  return kb.text(" Syarat Ketentuan", "tos");
}

export const menu = buildMenu();

export function buildMenuKb(csContact?: string | null): InlineKeyboard {
  return buildMenu(csContact);
}

export const backMenu = new InlineKeyboard().text("↩️ Kembali", "back_menu");

export const resellerText = `👤 *RESELLER / WHITELABEL BOT*

Kelola bot Telegram Anda sendiri untuk menjual layanan ini secara whitelabel — tanpa coding, tanpa modal.

• Harga jual = harga asli bot utama + margin Anda
• Margin minimum 5% per transaksi
• Semua katalog, stok, & transaksi memakai sistem pusat yang sama
• Hasil margin otomatis masuk ke saldo akun Anda di bot ini

_Silakan klik tombol di bawah untuk memulai._`;

export const resellerKb = new InlineKeyboard()
  .text("+ Buat Bot Baru", "rb_new")
  .row()
  .text("⬅ Kembali ke Menu Utama", "back_menu");

export const resellerTokenText = `👤 *CARA MENDAPATKAN TOKEN BOT* (dari @BotFather)

1. Buka @BotFather di Telegram
2. Ketik \`/newbot\` dan ikuti instruksinya
3. Setelah selesai, Anda mendapat token seperti:
\`1234567890:AAHFXHzemLQ4...\`
4. Salin token tersebut lalu tempel/kirim ke chat ini

⚠️ *PENTING:*
• Token hanya milik Anda — jangan gunakan di bot lain
• Anda hanya memiliki satu bot reseller

_Silakan kirim token Anda sekarang._`;

export const resellerTokenKb = new InlineKeyboard().text("⬅ Kembali", "reseller");

export const resellerBackKb = new InlineKeyboard().text("⬅ Kembali", "reseller");

export function resellerMarginMenuText(
  marginPct: number,
  marginType: "PCT" | "AMOUNT",
  marginAmount: number
): string {
  const current =
    marginType === "AMOUNT"
      ? `Rp ${marginAmount.toLocaleString("id-ID")} / nomor`
      : `${marginPct}%`;
  return `💲 *ATUR MARGIN KEUNTUNGAN*

Margin saat ini: ${current}

Pilih tipe, lalu kirim nilai baru:
• *Persen* (minimal 5%) — contoh: \`10\`
• *Nominal Rupiah* (contoh: \`1500\`)`;
}

export const resellerMarginMenuKb = new InlineKeyboard()
  .text("Ubah Margin (Persen)", "rm_margin:p")
  .row()
  .text("Ubah Margin (Rupiah)", "rm_margin:r")
  .row()
  .text("⬅ Kembali", "reseller");

export const resellerMarginPctPromptText =
  "📊 *UBAH MARGIN PERSEN*\n\n" +
  "Kirim persentase margin baru (minimal `5`, tanpa batas maksimal), contoh: `10`.\n" +
  "Harga jual otomatis naik sebesar persen itu dari harga dasar.";

export const resellerMarginAmountPromptText =
  "💵 *UBAH MARGIN RUPIAH*\n\n" +
  "Kirim nominal margin Rupiah (contoh: `1500`) untuk bot Anda.\n" +
  "Nilai ini ditambahkan ke harga setiap nomor.";

export const resellerCreatedText = `✅ *Bot reseller berhasil dibuat!*

⚠️ Satu langkah lagi: atur Contact CS di panel agar bot bisa aktif.
Bot akan langsung menyala setelah Contact CS diatur.`;

export interface ResellerPanelInfo {
  name: string;
  username: string;
  marginPct: number;
  marginType: "PCT" | "AMOUNT";
  marginAmount: number;
  csContact: string | null;
  status: "PENDING" | "ACTIVE" | "STOPPED";
  saldoMargin: number;
  pembeli: number;
  sukses: number;
  engineOnline: boolean;
  engineBots: number;
}

const STATUS_LABEL: Record<ResellerPanelInfo["status"], string> = {
  PENDING: "⚠️ Belum Aktif (Contact CS belum diatur)",
  ACTIVE: "🟢 Aktif",
  STOPPED: "🛑 Dihentikan",
};

const STATUS_NOTE: Record<ResellerPanelInfo["status"], string> = {
  PENDING:
    "⚠️ *Bot belum bisa aktif.*\nTekan Contact CS dan atur jalur komplain pembeli. Bot akan langsung menyala setelah itu.",
  ACTIVE: "✅ Bot berjalan otomatis melayani pembeli 24/7.",
  STOPPED: "🛑 Bot dihentikan. Tekan 🔄 Restart Bot untuk mengaktifkan kembali.",
};

export function resellerPanelText(i: ResellerPanelInfo): string {
  const marginLine =
    i.marginType === "AMOUNT"
      ? `Rp ${i.marginAmount.toLocaleString("id-ID")} / nomor`
      : `${i.marginPct}%`;
  return `🤖 *BOT RESELLER ANDA*

🏷 Nama       : ${i.name}
🆔 Username   : @${i.username}
📊 Status     : ${STATUS_LABEL[i.status]}
💰 Margin     : ${marginLine}${i.csContact ? `\n💬 Contact CS  : ${i.csContact}` : ""}

*Statistik Ringkas:*
👥 Pembeli          : ${i.pembeli}
✅ Transaksi Sukses : ${i.sukses}
🏦 Saldo Margin     : Rp ${i.saldoMargin.toLocaleString("id-ID")}

${STATUS_NOTE[i.status]}`;
}

export const resellerPanelKb = new InlineKeyboard()
  .text("✏️ Ubah Margin", "rm_margin")
  .text("🔄 Restart Bot", "rm_restart")
  .row()
  .text("⬇️ Withdraw", "rm_withdraw")
  .text("📋 Riwayat WD", "rm_rwd")
  .row()
  .text("💬 Contact CS", "rm_cs")
  .text("✏️ Ganti Token", "rm_token")
  .row()
  .text("🛑 Hentikan Bot", "rm_stop")
  .row()
  .text("⬅ Kembali ke Menu Utama", "back_menu");

export const orderServerKb = new InlineKeyboard()
  .text("Server 1", "srv:1")
  .row()
  .text("↩️ Kembali", "back_menu");

export const orderServerText = `🖥 *PILIH SERVER OTP*

⚡ *SERVER 1 — HIGH STOCK*
Server utama dengan stok nomor dalam jumlah besar dan performa stabil.

Silakan pilih server melalui tombol di bawah ini :`;

export const PAGE_SIZE = 18;

export interface ServiceItem {
  id: number;
  name: string;
}

export function serviceListText(
  total: number,
  page: number,
  pages: number,
  query?: string
): string {
  const info = query
    ? `🔍 Hasil pencarian: *${query}* (${total} layanan)`
    : `🖥 *Server :* Server 1

*Server High Stock:* Stok nomor dalam jumlah besar dan performa stabil. (${total} layanan)`;

  return `📚 *PILIH LAYANAN OTP*

${info}

Halaman *${page}/${pages}* — ketuk layanan untuk membeli.`;
}

export function serviceListKb(
  list: ServiceItem[],
  page: number,
  pages: number
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  for (let i = 0; i < slice.length; i += 2) {
    kb.text(slice[i].name, `svc:${slice[i].id}`);
    if (slice[i + 1]) kb.text(slice[i + 1].name, `svc:${slice[i + 1].id}`);
    else kb.text(" ", "noop");
    kb.row();
  }
  if (pages > 1) {
    kb.text("‹", `svc:page:${Math.max(1, page - 1)}`)
      .text(`${page}/${pages}`, "noop")
      .text("›", `svc:page:${Math.min(pages, page + 1)}`);
    kb.row();
  } else {
    kb.text(`1/1`, "noop");
    kb.row();
  }
  kb.text("🔍 Search", "svc:search").text("↩️ Kembali", "order");
  return kb;
}

export const searchPromptText = `🔍 *Pencarian Layanan*

Silakan ketik nama layanan yang ingin dicari (Contoh: Shopee, WhatsApp) langsung di obrolan ini:`;

export const searchCancelKb = new InlineKeyboard().text("❌ Batal", "svc:search_cancel");

export function searchResultText(query: string, total: number): string {
  return `✅ Ditemukan ${total} hasil untuk "${query}":`;
}

export function searchResultKb(list: ServiceItem[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const s of list) kb.text(s.name, `svc:${s.id}`).row();
  kb.text("↩️ Kembali", "svc:back_all");
  return kb;
}

export interface CountryItem {
  id: number;
  emoji: string;
  name: string;
}

export function countryListText(
  serviceName: string,
  total: number,
  page: number,
  pages: number
): string {
  return `🏳️ *PILIH NEGARA: ${serviceName.toUpperCase()}* (Hal. ${page})

Menampilkan *${total}* negara yang memiliki stok ketersediaan saat ini:

_Pilih negara tujuan Anda:_`;
}

export function countryListKb(
  list: CountryItem[],
  page: number,
  pages: number,
  svcId: number
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  for (let i = 0; i < slice.length; i += 2) {
    kb.text(`${slice[i].emoji} ${slice[i].name}`, `ctr:${svcId}:${slice[i].id}`);
    if (slice[i + 1])
      kb.text(`${slice[i + 1].emoji} ${slice[i + 1].name}`, `ctr:${svcId}:${slice[i + 1].id}`);
    else kb.text(" ", "noop");
    kb.row();
  }
  if (pages > 1) {
    kb.text("‹", `ctr:page:${Math.max(1, page - 1)}`)
      .text(`${page}/${pages}`, "noop")
      .text("›", `ctr:page:${Math.min(pages, page + 1)}`);
    kb.row();
  }
  kb.text("↩️ Kembali", "ctr:back_svc").text("🔍 Cari Negara", "ctr:search");
  return kb;
}

export const countrySearchPromptText = `🔍 *Pencarian Negara*

Silakan ketik nama negara yang ingin dicari (Contoh: Indonesia, Malaysia) langsung di obrolan ini:`;

export const countrySearchCancelKb = new InlineKeyboard().text("❌ Batal", "ctr:search_cancel");

export function countrySearchResultKb(list: CountryItem[], svcId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of list) kb.text(`${c.emoji} ${c.name}`, `ctr:${svcId}:${c.id}`).row();
  kb.text("↩️ Kembali", "ctr:back_all");
  return kb;
}

export interface OperatorItem {
  id: number | null;
  name: string;
}

export function operatorListText(
  serviceName: string,
  countryEmoji: string,
  countryName: string
): string {
  return `📶 *PILIH OPERATOR: ${serviceName.toUpperCase()}*

Negara: ${countryEmoji} *${countryName}*

_Silakan pilih operator yang diinginkan:_`;
}

export function operatorListKb(list: OperatorItem[], svcId: number, ctrId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text("🌐 Semua Operator (Acak)", `opr:${svcId}:${ctrId}:any`).row();
  for (let i = 0; i < list.length; i += 2) {
    kb.text(`📶 ${list[i].name}`, `opr:${svcId}:${ctrId}:${list[i].id ?? "any"}`);
    if (list[i + 1])
      kb.text(`📶 ${list[i + 1].name}`, `opr:${svcId}:${ctrId}:${list[i + 1].id ?? "any"}`);
    else kb.text(" ", "noop");
    kb.row();
  }
  kb.text("↩️ Kembali", "opr:back");
  return kb;
}

export interface PriceItem {
  id: number;
  modal: number;
  sell: number;
  buyerPrice?: number;
  available: number;
}

export function priceListText(
  serviceName: string,
  countryEmoji: string,
  countryName: string,
  operatorName: string,
  page: number,
  pages: number,
  total: number
): string {
  return `✨ *LAYANAN TERPILIH: ${serviceName.toUpperCase()}*

Negara: ${countryEmoji} *${countryName}*
Operator: *${operatorName}*

*(Halaman ${page} dari ${pages})*
Berikut adalah *${total}* pilihan harga yang tersedia saat ini:

_Pilih harga yang menurut Anda paling stabil:_`;
}

export function priceListKb(
  list: PriceItem[],
  page: number,
  pages: number,
  svcId: number,
  ctrId: number,
  oprId: number | null
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  for (let i = 0; i < slice.length; i += 2) {
    const fmt = (p: PriceItem) =>
      `Rp. ${(p.buyerPrice ?? p.sell).toLocaleString("id-ID")} | Stok ${p.available}`;
    kb.text(fmt(slice[i]), `beli:${svcId}:${ctrId}:${oprId ?? "any"}:${slice[i].id}`);
    if (slice[i + 1])
      kb.text(fmt(slice[i + 1]), `beli:${svcId}:${ctrId}:${oprId ?? "any"}:${slice[i + 1].id}`);
    else kb.text(" ", "noop");
    kb.row();
  }
  if (pages > 1) {
    kb.text("‹", `plc:page:${Math.max(1, page - 1)}`)
      .text(`${page}/${pages}`, "noop")
      .text("›", `plc:page:${Math.min(pages, page + 1)}`);
    kb.row();
  }
  kb.text("↩️ Kembali", "opr:back");
  return kb;
}

export function buyConfirmText(
  countryEmoji: string,
  countryName: string,
  serviceName: string,
  stock: number,
  sell: number
): string {
  return `Klik beli untuk membeli nomor:
—————————————
• Negara: ${countryEmoji} ${countryName}
• Aplikasi: ${serviceName}
• Stok: ${stock} nomor
• Harga: Rp ${sell.toLocaleString("id-ID")}`;
}

export function buyConfirmKb(
  svcId: number,
  ctrId: number,
  oprId: number | null,
  productId: number
): InlineKeyboard {
  const tag = `${svcId}:${ctrId}:${oprId ?? "any"}:${productId}`;
  return new InlineKeyboard()
    .text("Beli Banyak", `buyn:${tag}`)
    .text("Beli", `buy1:${tag}`)
    .row()
    .text("↩️ Kembali", "buy:back");
}

export function buyManyText(
  countryEmoji: string,
  countryName: string,
  serviceName: string,
  stock: number,
  sell: number,
  qty: number
): string {
  const total = sell * qty;
  return `Pilih jumlah pembelian:
—————————————
• Negara: ${countryEmoji} ${countryName}
• Aplikasi: ${serviceName}
• Stok: ${stock} nomor
• Harga: Rp ${sell.toLocaleString("id-ID")}
• Total: Rp ${total.toLocaleString("id-ID")}`;
}

export function buyManyKb(
  svcId: number,
  ctrId: number,
  oprId: number | null,
  productId: number,
  qty: number,
  stock: number
): InlineKeyboard {
  const tag = `${svcId}:${ctrId}:${oprId ?? "any"}:${productId}`;
  const kb = new InlineKeyboard();
  kb.text("➖", qty > 1 ? `qty:${tag}:${qty}:dec` : "noop")
    .text(String(qty), "noop")
    .text("➕", qty < stock ? `qty:${tag}:${qty}:inc` : "noop");
  kb.row()
    .text("Beli", `buyqty:${tag}:${qty}`)
    .row()
    .text("↩️ Kembali", `buyconf:${tag}`);
  return kb;
}

export function insufficientBalanceText(need: number, have: number): string {
  return `⚠️ *SALDO TIDAK CUKUP*

Dibutuhkan: Rp ${need.toLocaleString("id-ID")}
Saldo Anda: Rp ${have.toLocaleString("id-ID")}
Kurang: Rp ${(need - have).toLocaleString("id-ID")}`;
}

export function systemEmptyText(): string {
  return `⚠️ *SISTEM SEDANG KOSONG*

Saldo sistem di penyedia habis / order gagal dibuat.
Saldo Anda sudah dikembalikan. Silakan coba lagi nanti atau hubungi admin.`;
}

export function orderFailedText(msg: string): string {
  return `⚠️ *ORDER GAGAL*

${msg}
Saldo Anda sudah dikembalikan.`;
}

export function orderCreatedText(
  orders: { phone: string | null; expiresAt: string | null }[],
  total: number
): string {
  const lines = orders
    .map((o, i) => `${i + 1}. \`${o.phone ?? "-"}\`${o.expiresAt ? ` · berlaku s/d ${o.expiresAt}` : ""}`)
    .join("\n");
  return `✅ *ORDER BERHASIL DIBUAT*

Nomor Anda:
${lines}

Total: Rp ${total.toLocaleString("id-ID")}

⏳ *Menunggu kode OTP masuk...*
Kode akan dikirim otomatis ke chat ini.`;
}

export function orderWaitKb() {
  return new InlineKeyboard();
}

function fmtWib(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false }) + " WIB";
}

export function orderCardText(o: {
  idx: number;
  serviceName: string;
  countryEmoji: string;
  countryName: string;
  phone: string | null;
  priceSell: number;
  balanceAfter?: number | null;
  expiresAt: string | null;
  status: "ACTIVE" | "OTP_RECEIVED" | "COMPLETED" | "CANCELED" | "EXPIRED" | "FAILED";
  otpCode?: string | null;
}): string {
  const otpLine =
    o.status === "OTP_RECEIVED" || o.status === "COMPLETED"
      ? `💬 *OTP CODE :* \`${o.otpCode ?? "-"}\``
      : o.status === "CANCELED"
        ? "💬 *OTP CODE :* ❌ Dibatalkan"
        : o.status === "EXPIRED" || o.status === "FAILED"
          ? "💬 *OTP CODE :* ⌛ Kedaluwarsa (saldo dikembalikan)"
          : "💬 *OTP CODE :* ⏳ Waiting For OTP••";
  const saldoLine =
    o.balanceAfter != null
      ? `\n👤 Saldo: Rp ${o.balanceAfter.toLocaleString("id-ID")}`
      : "";
  return `✅ *ORDER BERHASIL (#${o.idx})*

📶 Layanan: *${o.serviceName.toUpperCase()}*
🌐 Negara: ${o.countryEmoji} *${o.countryName}*
📱 Nomor: \`${o.phone ?? "-"}\`
💲 Harga: Rp ${o.priceSell.toLocaleString("id-ID")}${saldoLine}

${otpLine}
⏰ Nokos Expired Pada: *${fmtWib(o.expiresAt)}*`;
}

export function orderCardKb(
  dbOrderId: number,
  status: "ACTIVE" | "OTP_RECEIVED" | "COMPLETED" | "CANCELED" | "EXPIRED" | "FAILED"
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (status === "ACTIVE") kb.text("❌ Cancel", `ocancel:${dbOrderId}`);
  if (status === "OTP_RECEIVED") kb.text("✅ Selesai", `ofinish:${dbOrderId}`);
  kb.row().text("🏠 Menu Utama", "back_menu");
  return kb;
}

function fmtWibFull(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false });
  return `${date}, ${time} WIB`;
}

const HISTORY_STATUS: Record<string, { icon: string; label: string }> = {
  PENDING: { icon: "⏳", label: "Menunggu OTP" },
  ACTIVE: { icon: "⏳", label: "Menunggu OTP" },
  OTP_RECEIVED: { icon: "📨", label: "OTP Masuk" },
  COMPLETED: { icon: "✅", label: "Selesai" },
  CANCELED: { icon: "✖️", label: "Batal" },
  EXPIRED: { icon: "⌛", label: "Kedaluwarsa" },
  FAILED: { icon: "⚠️", label: "Gagal" },
};

export const HISTORY_PAGE_SIZE = 6;

export function historyOrderText(o: {
  idx: number;
  serviceName: string;
  phone: string | null;
  priceSell: number;
  status: string;
  otpCode: string | null;
  createdAt: string;
}): string {
  const s = HISTORY_STATUS[o.status] ?? { icon: "❔", label: o.status };
  return `📭 *${o.serviceName}* | #${o.idx}

📱 No : \`${o.phone ?? "-"}\`
💬 Kode : \`${o.otpCode ?? "-"}\`
💲 Harga : Rp ${o.priceSell.toLocaleString("id-ID")}
${s.icon} Status : ${s.label}
🕐 Waktu : ${fmtWibFull(o.createdAt)}
${"―".repeat(26)}`;
}

export function historyOrderKb(page: number, totalPages: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (totalPages > 1) {
    if (page > 1) kb.text("◀️", `hist:${page - 1}`);
    kb.text(`${page}/${totalPages}`, "hist:p");
    if (page < totalPages) kb.text("▶️", `hist:${page + 1}`);
    kb.row();
  }
  kb.text("🔙 Kembali", "back_menu");
  return kb;
}

const HISTORY_DEPOSIT_STATUS: Record<string, { icon: string; label: string }> = {
  PENDING: { icon: "•••", label: "Pending" },
  PAID: { icon: "✅", label: "Selesai" },
  EXPIRED: { icon: "✖️", label: "Batal" },
  FAILED: { icon: "⚠️", label: "Gagal" },
};

export function historyDepositText(o: {
  idx: number;
  amount: number;
  externalId: string;
  status: string;
  createdAt: string;
}): string {
  const s = HISTORY_DEPOSIT_STATUS[o.status] ?? { icon: "❔", label: o.status };
  return `👁 Rp ${o.amount.toLocaleString("id-ID")} | #${o.idx}

💳 ID : \`${o.externalId}\`
${s.icon} Status : ${s.label}
🕐 Waktu : ${fmtWibFull(o.createdAt)}
${"―".repeat(26)}`;
}

export function historyDepositKb(page: number, totalPages: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (totalPages > 1) {
    if (page > 1) kb.text("◀️", `hdep:${page - 1}`);
    kb.text(`${page}/${totalPages}`, "hdep:p");
    if (page < totalPages) kb.text("▶️", `hdep:${page + 1}`);
    kb.row();
  }
  kb.text("👁 Kembali", "back_menu");
  return kb;
}

export const DEPOSIT_PRESETS = [2_000, 5_000, 10_000, 25_000, 50_000, 100_000];
export const DEPOSIT_MIN = 2_000;
export const DEPOSIT_MAX = 1_000_000;

export const depositNominalText = `💳 *PILIH NOMINAL DEPOSIT*

Silakan pilih nominal deposit instan di bawah ini, atau gunakan *Nominal Kustom:*`;

export function depositNominalKb(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < DEPOSIT_PRESETS.length; i += 2) {
    const a = DEPOSIT_PRESETS[i];
    const b = DEPOSIT_PRESETS[i + 1];
    kb.text(`Rp ${a.toLocaleString("id-ID")}`, `dep:${a}`);
    if (b) kb.text(`Rp ${b.toLocaleString("id-ID")}`, `dep:${b}`);
    kb.row();
  }
  kb.text("✏️ Nominal Kustom", "dep:custom").row().text("🔙 Kembali", "back_menu");
  return kb;
}

export const depositCustomText = `✏️ *NOMINAL KUSTOM*

Silakan ketik angka nominal deposit yang Anda inginkan (tanpa titik/koma).

_Minimal: Rp ${DEPOSIT_MIN.toLocaleString("id-ID")}_
_Maksimal: Rp ${DEPOSIT_MAX.toLocaleString("id-ID")}_`;

export function depositMethodText(nominal: number): string {
  return `💳 *METODE PEMBAYARAN DEPOSIT*

*Nominal Deposit :* Rp ${nominal.toLocaleString("id-ID")}

Silakan pilih salah satu metode QRIS di bawah.
Metode yang tersedia bisa discan dari aplikasi bank / e-wallet apa pun.`;
}

export const depositMethodKb = new InlineKeyboard()
  .text("QRIS", "dep:pay")
  .row()
  .text("🔙 Kembali", "dep:back");

export function depositCreatedText(o: {
  orderId: string;
  method: string;
  totalBayar: number;
  nominal: number;
  uniqueCode: number;
  status: string;
  expiredWib: string;
}): string {
  const rincian = [`🧾 *Rincian :*`, `• Nominal: Rp ${o.nominal.toLocaleString("id-ID")}`];
  if (o.uniqueCode > 0) rincian.push(`• Fee: Rp ${o.uniqueCode.toLocaleString("id-ID")}`);
  return `✅ *DEPOSIT DIBUAT*

🆔 *Order ID :* \`${o.orderId}\`
🏧 *Metode :* ${o.method}
💰 *Total Bayar :* Rp ${o.totalBayar.toLocaleString("id-ID")}

${rincian.join("\n")}

🔄 *Status:* ${o.status}
⏰ *Expired pada :* ${o.expiredWib} WIB`;
}

export const depositWaitKb = new InlineKeyboard().text("🔴 Batalkan Deposit", "dep:cancel");

export function depositPaidText(nominal: number, balanceAfter: number): string {
  return `✅ *PEMBAYARAN DITERIMA*

💰 Nominal: Rp ${nominal.toLocaleString("id-ID")}
🏦 Saldo Anda: Rp ${balanceAfter.toLocaleString("id-ID")}

Saldo sudah masuk. Terima kasih!`;
}

export function depositStatusText(status: "CANCELED" | "EXPIRED" | "FAILED"): string {
  const map = {
    CANCELED: "🔴 *DEPOSIT DIBATALKAN*\n\nDeposit dibatalkan. Tidak ada saldo yang masuk.",
    EXPIRED: "⌛ *DEPOSIT KEDALUWARSA*\n\nWaktu pembayaran habis. Silakan buat deposit baru.",
    FAILED: "⚠️ *DEPOSIT GAGAL*\n\nPembayaran gagal diproses. Silakan coba lagi.",
  };
  return map[status];
}

export const backToMenuKb = new InlineKeyboard().text("🏠 Menu Utama", "back_menu");

// ── WITHDRAW RESELLER ──────────────────────────────────────────────────────

export function wdRequestText(
  saldoMargin: number,
  paymentMethod: string | null,
  paymentInfo: string | null,
  min = 0
): string {
  const rekening = paymentMethod && paymentInfo
    ? `${paymentMethod} — ${paymentInfo}`
    : "_Belum diatur_";
  return `⬇️ *WITHDRAW SALDO MARGIN*

🏦 Saldo Margin : Rp ${saldoMargin.toLocaleString("id-ID")}
💳 Rekening     : ${rekening}

Kirim nominal withdraw yang diinginkan (contoh: \`50000\`).
Minimal Rp ${min.toLocaleString("id-ID")}.`;
}

export const wdRequestKb = new InlineKeyboard()
  .text("✏️ Ubah Rekening", "wd_set_payment")
  .row()
  .text("⬅ Kembali", "reseller");

export const wdSetPaymentMethodText =
  "💳 *ATUR REKENING WITHDRAW*\n\nKirim nama metode pembayaran, contoh:\n`BCA`, `GoPay`, `Dana`, `OVO`, `BRI`";

export function wdSetPaymentInfoText(method: string): string {
  return `💳 *ATUR REKENING WITHDRAW*\n\nMetode: *${method}*\n\nKirim nomor rekening / nomor HP tujuan:`;
}

export function wdConfirmText(amount: number, method: string, info: string): string {
  return `⬇️ *KONFIRMASI WITHDRAW*

💰 Nominal  : Rp ${amount.toLocaleString("id-ID")}
💳 Tujuan   : ${method} — ${info}

Lanjutkan?`;
}

export function wdConfirmKb(amount: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Ya, Withdraw", `wd_confirm:${amount}`)
    .row()
    .text("⬅ Batal", "rm_withdraw");
}

export function wdSuccessText(amount: number, saldoAfter: number): string {
  return `✅ *WITHDRAW BERHASIL DIAJUKAN*

💰 Nominal  : Rp ${amount.toLocaleString("id-ID")}
🏦 Sisa Margin : Rp ${saldoAfter.toLocaleString("id-ID")}

Request Anda sudah masuk dengan status *PENDING*.
Admin akan memproses dan mentransfer ke rekening Anda.`;
}

export const WD_HISTORY_PAGE_SIZE = 5;

const WD_STATUS_LABEL: Record<string, { icon: string; label: string }> = {
  PENDING:  { icon: "⏳", label: "Menunggu" },
  APPROVED: { icon: "✅", label: "Disetujui" },
  REJECTED: { icon: "❌", label: "Ditolak" },
};

export function wdHistoryText(
  items: { id: number; amount: number; status: string; note: string | null; created_at: string }[],
  page: number,
  totalPages: number
): string {
  if (!items.length) return `📋 *RIWAYAT WITHDRAW*\n\nBelum ada riwayat withdraw.`;
  const lines = items.map((w, i) => {
    const s = WD_STATUS_LABEL[w.status] ?? { icon: "❔", label: w.status };
    const note = w.note ? `\n   📝 ${w.note}` : "";
    return `${i + 1 + (page - 1) * WD_HISTORY_PAGE_SIZE}. Rp ${w.amount.toLocaleString("id-ID")} — ${s.icon} ${s.label}${note}\n   🕐 ${fmtWibFull(w.created_at)}`;
  });
  return `📋 *RIWAYAT WITHDRAW* (Hal. ${page}/${totalPages})\n\n${lines.join("\n\n")}`;
}

export function wdHistoryKb(page: number, totalPages: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (totalPages > 1) {
    if (page > 1) kb.text("◀️", `wd_hist:${page - 1}`);
    kb.text(`${page}/${totalPages}`, "noop");
    if (page < totalPages) kb.text("▶️", `wd_hist:${page + 1}`);
    kb.row();
  }
  kb.text("⬅ Kembali", "reseller");
  return kb;
}

export function menuText(
  name: string,
  id: number,
  username: string,
  balance: number,
  totalUser: number
): string {
  const d = new Date();
  const tanggal = d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const jam = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false });
  const now = `${tanggal} pukul ${jam} WIB`;
  return ` **
 HI *${name}*,
${now}

 *User Info :*
 *ID:* \`${id}\`
 *Username:* @${username}

 *Balance Info :*
 *Balance :* Rp ${balance.toLocaleString("id-ID")}
 
 *History OTP :* @InfoNokosHachi

 *Bot Stats :*
 *Total User :* ${totalUser.toLocaleString("id-ID")}

 *Shortcuts :*
 /start - Mulai Bot`;
}

export const helpText = `*CARA PENGGUNAAN BOT*

*Deposit Saldo*
Tekan menu *Deposit*, pilih nominal atau ketik nominal kustom, lalu bayar melalui QRIS yang diberikan.

*Pilih Server & Layanan*
Tekan menu *Order OTP*, pilih server:
• *Server 1* — Stok besar, harga variatif
• *Server 2* — Full text (isi SMS utuh)
Lalu pilih layanan yang diinginkan.

*Beli Nomor*
Pilih harga yang tersedia, lalu tekan *Beli* atau *Beli Banyak* untuk membeli lebih dari 1 nomor sekaligus.

*Tunggu Kode OTP*
Masukkan nomor yang diberikan ke aplikasi tujuan. Kode OTP akan muncul otomatis di tiket order Anda.

*Selesai atau Batal*
• Tekan ✅ *Selesai* jika OTP sudah masuk
• Tekan 🔄 *Resend* untuk minta SMS baru
• Tekan ❌ *Cancel* untuk membatalkan (saldo dikembalikan otomatis)

────────────────
💡 *Tips:*
Gunakan nomor segera setelah order agar kemungkinan OTP masuk lebih tinggi.`;

export function helpTextFor(csContact?: string | null): string {
  const cs = csContact ? csContact : "@belzzzea";
  return `${helpText}

────────────────
💬 *Butuh bantuan?*
Contact CS : ${cs}`;
}
