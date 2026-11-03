import "dotenv/config";
import { Api, Bot, Context, InlineKeyboard } from "grammy";
import {
  menu,
  buildMenuKb,
  backMenu,
  resellerText,
  resellerKb,
  resellerTokenText,
  resellerTokenKb,
  resellerCreatedText,
  resellerPanelText,
  resellerPanelKb,
  resellerMarginMenuText,
  resellerMarginMenuKb,
  resellerMarginPctPromptText,
  resellerMarginAmountPromptText,
  resellerBackKb,
  menuText,
  helpTextFor,
  orderServerKb,
  orderServerText,
  serviceListText,
  serviceListKb,
  searchPromptText,
  searchCancelKb,
  searchResultText,
  searchResultKb,
  countryListText,
  countryListKb,
  countrySearchPromptText,
  countrySearchCancelKb,
  countrySearchResultKb,
  operatorListText,
  operatorListKb,
  priceListText,
  priceListKb,
  buyConfirmText,
  buyConfirmKb,
  buyManyText,
  buyManyKb,
  PriceItem,
  PAGE_SIZE,
  ServiceItem,
  CountryItem,
  OperatorItem,
  historyOrderText,
  historyOrderKb,
  historyDepositText,
  historyDepositKb,
  HISTORY_PAGE_SIZE,
  insufficientBalanceText,
  systemEmptyText,
  orderFailedText,
  orderCardText,
  orderCardKb,
  backToMenuKb,
  depositNominalText,
  depositNominalKb,
  depositCustomText,
  depositMethodText,
  depositMethodKb,
  depositCreatedText,
  depositWaitKb,
  depositPaidText,
  depositStatusText,
  DEPOSIT_MIN,
  DEPOSIT_MAX,
} from "./ui.js";
import {
  getServices,
  getCountries,
  getProducts,
  filterProducts,
  getOperators,
  getProviderBalance,
  SmsService,
  SmsCountry,
  SmsProduct,
} from "./providers/smscode/catalog.js";
import { createOrder } from "./providers/smscode/orders.js";
import { calcPrice } from "./pricing.js";
import { getOrCreateUser, changeBalance } from "./db/users.js";
import { q1 } from "./db/index.js";
import {
  getResellerByTelegram,
  getResellerByUserId,
  upsertResellerToken,
  updateResellerCs,
  updateResellerMargin,
  setResellerStatus,
} from "./db/resellers.js";
import { getSetting } from "./db/settings.js";
import { ttlCache } from "./cache.js";
import { newBatchId, insertOrder, countUserOrders, getUserOrdersPaged } from "./db/orders.js";
import {
  insertDeposit,
  setDepositMessage,
  markDeposit,
  DbDeposit,
  countUserDeposits,
  getUserDepositsPaged,
} from "./db/deposits.js";
import { getPgAdapter, DEPOSIT_EXPIRE_MIN } from "./pg/index.js";
import { qrPhotoSource } from "./pg/qr.js";
import { startPoller, cancelOrderHandler, finishOrderHandler } from "./poller.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN belum diisi di .env");

const bot = new Bot(token);

const RESELLER_MODE = process.env.RESELLER_MODE === "1";
const OWNER_ID: number | null = process.env.RESELLER_OWNER_ID
  ? Number(process.env.RESELLER_OWNER_ID)
  : null;
if (RESELLER_MODE && !OWNER_ID)
  console.warn("[mode] RESELLER_MODE aktif tapi RESELLER_OWNER_ID kosong");
console.log(`[mode] ${OWNER_ID ? `bot reseller (owner_id=${OWNER_ID})` : "bot utama"}`);

let resellerCsCache: { at: number; cs: string | null } | null = null;

async function activeCsContact(): Promise<string | null> {
  if (OWNER_ID == null) return null;
  if (resellerCsCache && Date.now() - resellerCsCache.at < 60_000) return resellerCsCache.cs;
  try {
    const rs = await getResellerByUserId(OWNER_ID);
    resellerCsCache = { at: Date.now(), cs: rs?.cs_contact ?? null };
  } catch {
    resellerCsCache = { at: Date.now(), cs: null };
  }
  return resellerCsCache.cs;
}

async function menuKb(): Promise<InlineKeyboard> {
  return OWNER_ID == null ? menu : buildMenuKb(await activeCsContact());
}

let svcCache: { at: number; services: SmsService[] } | null = null;
let countryCache: { at: number; countries: SmsCountry[] } | null = null;
const PROD_TTL = 15 * 60_000;
const prodCache = new Map<number, { at: number; products: Awaited<ReturnType<typeof getProducts>> }>();

const userView = new Map<
  number,
  { list: ServiceItem[]; page: number; query?: string; chatId: number; msgId: number }
>();

interface CountryViewState {
  service: ServiceItem;
  list: CountryItem[];
  page: number;
}
const countryView = new Map<number, CountryViewState>();

interface OperatorViewState {
  service: ServiceItem;
  country: CountryItem;
  list: OperatorItem[];
}
const operatorView = new Map<number, OperatorViewState>();

const awaitingSearch = new Set<number>();
const awaitingCountrySearch = new Set<number>();
const awaitingResellerToken = new Set<number>();
const replacingResellerToken = new Set<number>();
const awaitingMargin = new Map<number, "PCT" | "AMOUNT">();
const awaitingCs = new Set<number>();

function clearResellerInput(id: number): void {
  awaitingResellerToken.delete(id);
  replacingResellerToken.delete(id);
  awaitingMargin.delete(id);
  awaitingCs.delete(id);
}

async function loadServices(): Promise<SmsService[]> {
  if (svcCache && Date.now() - svcCache.at < 300_000) return svcCache.services;
  const data = (await getServices()).filter((s) => s.active);
  svcCache = { at: Date.now(), services: data };
  return data;
}

async function loadCountries(): Promise<SmsCountry[]> {
  if (countryCache && Date.now() - countryCache.at < 600_000) return countryCache.countries;
  const data = await getCountries();
  countryCache = { at: Date.now(), countries: data };
  return data;
}

async function loadProducts(platformId: number) {
  const cached = prodCache.get(platformId);
  if (cached && Date.now() - cached.at < PROD_TTL) return cached.products;
  const data = await getProducts(platformId);
  prodCache.set(platformId, { at: Date.now(), products: data });
  return data;
}

async function refreshAllProducts(services: SmsService[]): Promise<void> {
  for (const s of services) {
    try {
      const data = await getProducts(s.id);
      prodCache.set(s.id, { at: Date.now(), products: data });
    } catch (e) {
      console.warn(`[refresh] produk ${s.name} gagal:`, (e as Error).message);
    }
  }
}

async function warmup() {
  try {
    const services = await loadServices();
    await loadCountries();
    console.log(`[warmup] ${services.length} layanan, negara siap — mulai prefetch produk...`);
    await refreshAllProducts(services);
    console.log(`[warmup] semua produk siap`);
    // Proactive refresh: perbarui cache 2 menit sebelum expired, tanpa tunggu user klik
    setInterval(async () => {
      try {
        const svcs = await loadServices();
        await loadCountries();
        await refreshAllProducts(svcs);
        console.log(`[refresh] cache produk diperbarui (${new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })})`);
      } catch (e) {
        console.warn("[refresh] gagal:", (e as Error).message);
      }
    }, PROD_TTL - 2 * 60_000);
  } catch (e) {
    console.warn("[warmup] gagal:", (e as Error).message);
  }
}

async function loadCountryStock(platformId: number): Promise<CountryItem[]> {
  const [products, countries] = await Promise.all([
    loadProducts(platformId),
    loadCountries(),
  ]);
  const byCountry = new Map<number, number>();
  for (const p of products) {
    if (!p.active || p.available <= 0) continue;
    byCountry.set(p.country_id, (byCountry.get(p.country_id) ?? 0) + p.available);
  }
  const emojiById = new Map(countries.map((c) => [c.id, c.emoji]));
  return countries
    .filter((c) => c.active && byCountry.has(Number(c.id)))
    .map((c) => ({ id: Number(c.id), emoji: emojiById.get(Number(c.id)) ?? c.emoji, name: c.name }))
    .sort((a, b) => {
      if (a.name === "Indonesia") return -1;
      if (b.name === "Indonesia") return 1;
      return a.name.localeCompare(b.name);
    });
}

async function showServicePage(ctx: Context, userId: number) {
  const view = userView.get(userId);
  if (!view) return;
  const pages = Math.max(1, Math.ceil(view.list.length / PAGE_SIZE));
  await ctx
    .editMessageText(serviceListText(view.list.length, view.page, pages, view.query), {
      parse_mode: "Markdown",
      reply_markup: serviceListKb(view.list, view.page, pages),
    })
    .catch(() => {});
}

// Cache total user — COUNT(*) tidak perlu di-query di setiap render menu (cukup segar tiap 60 dtk)
const totalUserCache = ttlCache<number>(60_000);

async function renderMenu(from: {
  id: number;
  first_name?: string | undefined;
  username?: string | undefined;
}): Promise<string> {
  let balance = 0;
  let totalUser = 0;
  if (process.env.DATABASE_URL) {
    try {
      const u = await getOrCreateUser(from);
      balance = u.balance;
      totalUser = await totalUserCache("all", async () => {
        const c = await q1<{ n: number }>("SELECT COUNT(*) AS n FROM tb_users");
        return c?.n ?? 0;
      });
    } catch (e) {
      console.error("[db] renderMenu gagal:", (e as Error).message);
    }
  }
  return menuText(
    from.first_name || from.username || "Pengguna",
    from.id,
    from.username ?? "-",
    balance,
    totalUser
  );
}

bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  clearResellerInput(from.id);
  return ctx.reply(await renderMenu(from), {
    parse_mode: "Markdown",
    reply_markup: await menuKb(),
  });
});

bot.command("menu", async (ctx) => {
  if (!ctx.from) return;
  clearResellerInput(ctx.from.id);
  return ctx.reply(await renderMenu(ctx.from), {
    parse_mode: "Markdown",
    reply_markup: await menuKb(),
  });
});

bot.command("order", async (ctx) => {
  if (!ctx.from) return;
  userView.delete(ctx.from.id);
  countryView.delete(ctx.from.id);
  operatorView.delete(ctx.from.id);
  priceView.delete(ctx.from.id);
  awaitingSearch.delete(ctx.from.id);
  awaitingCountrySearch.delete(ctx.from.id);
  return ctx.reply(orderServerText, {
    parse_mode: "Markdown",
    reply_markup: orderServerKb,
  });
});

bot.command("deposit", (ctx) =>
  ctx.reply(depositNominalText, {
    parse_mode: "Markdown",
    reply_markup: depositNominalKb(),
  })
);

bot.command("history", async (ctx) => {
  if (!ctx.from) return;
  if (!process.env.DATABASE_URL)
    return ctx.reply("Database belum aktif");
  const user = await getOrCreateUser(ctx.from);
  const v = await orderHistoryView(user.id, 1);
  return ctx.reply(v.text, {
    parse_mode: "Markdown",
    reply_markup: v.kb,
  });
});

bot.command("hisdeposit", async (ctx) => {
  if (!ctx.from) return;
  if (!process.env.DATABASE_URL)
    return ctx.reply("Database belum aktif");
  const user = await getOrCreateUser(ctx.from);
  const v = await depositHistoryView(user.id, 1);
  return ctx.reply(v.text, {
    parse_mode: "Markdown",
    reply_markup: v.kb,
  });
});

bot.command("help", async (ctx) =>
  ctx.reply(helpTextFor(await activeCsContact()), {
    parse_mode: "Markdown",
    reply_markup: backMenu,
  })
);

bot.callbackQuery("help", async (ctx) =>
  ctx.editMessageText(helpTextFor(await activeCsContact()), { parse_mode: "Markdown", reply_markup: backMenu })
);

async function getResellerView(
  telegramId: number
): Promise<{ hasToken: boolean; botName: string; botUsername: string; panelText: string } | null> {
  const r = await getResellerByTelegram(telegramId);
  if (!r) return null;
  const st = await q1<{ pembeli: number; sukses: number }>(
    `SELECT COUNT(DISTINCT user_id) AS pembeli,
            COALESCE(SUM(status = 'COMPLETED'), 0) AS sukses
     FROM tb_orders WHERE owner_id = ?`,
    [r.user_id]
  );
  let engineOnline = false;
  let engineBots = 0;
  try {
    const hb = await getSetting("reseller_orchestrator");
    if (hb) {
      const j = JSON.parse(hb) as { at?: string; bots?: number };
      engineBots = j.bots ?? 0;
      engineOnline = !!j.at && Date.now() - new Date(j.at).getTime() < 45_000;
    }
  } catch {
    // heartbeat tidak valid → anggap offline
  }
  return {
    hasToken: !!r.bot_token,
    botName: r.bot_name || "Bot Reseller",
    botUsername: r.bot_username || "-",
    panelText: resellerPanelText({
      name: r.bot_name || "Bot Reseller",
      username: r.bot_username || "-",
      marginPct: r.margin_pct,
      marginType: r.margin_type,
      marginAmount: r.margin_amount,
      csContact: r.cs_contact,
      status: r.status,
      saldoMargin: r.saldo_margin,
      pembeli: st?.pembeli ?? 0,
      sukses: Number(st?.sukses ?? 0),
      engineOnline,
      engineBots,
    }),
  };
}

bot.callbackQuery("reseller", async (ctx) => {
  clearResellerInput(ctx.from.id);
  try {
    const v = await getResellerView(ctx.from.id);
    if (v?.hasToken) {
      return ctx.editMessageText(v.panelText, {
        parse_mode: "Markdown",
        reply_markup: resellerPanelKb,
      });
    }
  } catch {
    // DB error → tampilkan intro whitelabel
  }
  return ctx.editMessageText(resellerText, {
    parse_mode: "Markdown",
    reply_markup: resellerKb,
  });
});

bot.callbackQuery("rb_new", async (ctx) => {
  clearResellerInput(ctx.from.id);
  try {
    const v = await getResellerView(ctx.from.id);
    if (v?.hasToken) {
      awaitingResellerToken.delete(ctx.from.id);
      replacingResellerToken.delete(ctx.from.id);
      return ctx.editMessageText(v.panelText, {
        parse_mode: "Markdown",
        reply_markup: resellerPanelKb,
      });
    }
  } catch {
    // DB error → tetap tampilkan instruksi token
  }
  awaitingResellerToken.add(ctx.from.id);
  return ctx.editMessageText(resellerTokenText, {
    parse_mode: "Markdown",
    reply_markup: resellerTokenKb,
  });
});

async function handleResellerToken(ctx: Context, raw: string): Promise<void> {
  if (!ctx.from) return;
  const from = ctx.from;
  const token = raw.trim();

  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    await ctx.reply(
      "Format token tidak valid. Harus seperti `1234567890:AAHFXHzemLQ4...` — salin utuh dari @BotFather lalu kirim ulang.",
      { parse_mode: "Markdown", reply_markup: resellerTokenKb }
    );
    return;
  }

  let user;
  try {
    user = await getOrCreateUser(from);
  } catch (e) {
    await ctx.reply(`Gagal: ${(e as Error).message}`);
    return;
  }

  try {
    const replacing = replacingResellerToken.has(from.id);
    const existing = await getResellerByTelegram(from.id);
    if (!replacing && existing?.bot_token) {
      awaitingResellerToken.delete(from.id);
      await ctx.reply("⚠️ Kamu sudah memiliki satu bot reseller.", {
        reply_markup: resellerPanelKb,
      });
      const v = await getResellerView(from.id);
      if (v) {
        await ctx.reply(v.panelText, {
          parse_mode: "Markdown",
          reply_markup: resellerPanelKb,
        });
      }
      return;
    }

    let me: { username: string; first_name: string };
    try {
      const r = await new Api(token).getMe();
      me = { username: r.username, first_name: r.first_name };
    } catch {
      await ctx.reply(
        "❌ Token tidak valid atau ditolak Telegram. Cek ulang token dari @BotFather lalu kirim lagi.",
        { reply_markup: resellerTokenKb }
      );
      return;
    }

    await upsertResellerToken(user.id, token, me.username, me.first_name || me.username);
    awaitingResellerToken.delete(from.id);
    replacingResellerToken.delete(from.id);

    await ctx.reply(
      replacing ? "✅ Token bot reseller berhasil diganti." : resellerCreatedText,
      { parse_mode: "Markdown" }
    );
    const v = await getResellerView(from.id);
    if (v) {
      await ctx.reply(v.panelText, {
        parse_mode: "Markdown",
        reply_markup: resellerPanelKb,
      });
    }
  } catch (e) {
    await ctx.reply(`Gagal menyimpan token: ${(e as Error).message}`);
  }
}

bot.callbackQuery("rm_margin", async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await getResellerByTelegram(ctx.from.id);
  if (!r?.bot_token)
    return ctx.reply("⚠️ Buat bot reseller dulu lewat 👤 Reseller Bot.", {
      reply_markup: resellerPanelKb,
    });
  clearResellerInput(ctx.from.id);
  return ctx.editMessageText(resellerMarginMenuText(r.margin_pct, r.margin_type, r.margin_amount), {
    parse_mode: "Markdown",
    reply_markup: resellerMarginMenuKb,
  });
});

bot.callbackQuery("rm_margin:p", async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await getResellerByTelegram(ctx.from.id);
  if (!r?.bot_token)
    return ctx.reply("⚠️ Buat bot reseller dulu lewat 👤 Reseller Bot.", {
      reply_markup: resellerPanelKb,
    });
  clearResellerInput(ctx.from.id);
  awaitingMargin.set(ctx.from.id, "PCT");
  return ctx.editMessageText(resellerMarginPctPromptText, {
    parse_mode: "Markdown",
    reply_markup: resellerBackKb,
  });
});

bot.callbackQuery("rm_margin:r", async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await getResellerByTelegram(ctx.from.id);
  if (!r?.bot_token)
    return ctx.reply("⚠️ Buat bot reseller dulu lewat 👤 Reseller Bot.", {
      reply_markup: resellerPanelKb,
    });
  clearResellerInput(ctx.from.id);
  awaitingMargin.set(ctx.from.id, "AMOUNT");
  return ctx.editMessageText(resellerMarginAmountPromptText, {
    parse_mode: "Markdown",
    reply_markup: resellerBackKb,
  });
});

bot.callbackQuery("rm_cs", async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await getResellerByTelegram(ctx.from.id);
  if (!r?.bot_token)
    return ctx.reply("⚠️ Buat bot reseller dulu lewat 👤 Reseller Bot.", {
      reply_markup: resellerPanelKb,
    });
  clearResellerInput(ctx.from.id);
  awaitingCs.add(ctx.from.id);
  return ctx.reply(
    `💬 Kontak CS saat ini: ${r.cs_contact ? `*${r.cs_contact}*` : "_belum diatur_"}\n` +
      "Kirim kontak baru, contoh: `@CSToko` atau `https://t.me/CSToko` (maks 64 karakter).",
    { parse_mode: "Markdown", reply_markup: backToMenuKb }
  );
});

bot.callbackQuery("rm_token", async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await getResellerByTelegram(ctx.from.id);
  if (!r?.bot_token)
    return ctx.reply("⚠️ Buat bot reseller dulu lewat 👤 Reseller Bot.", {
      reply_markup: resellerPanelKb,
    });
  clearResellerInput(ctx.from.id);
  awaitingResellerToken.add(ctx.from.id);
  replacingResellerToken.add(ctx.from.id);
  return ctx.reply(
    "✏️ *GANTI TOKEN BOT*\nKirim token baru dari @BotFather. Token lama langsung diganti.",
    { parse_mode: "Markdown", reply_markup: resellerTokenKb }
  );
});

bot.callbackQuery("rm_stop", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "🛑 Bot dihentikan" });
  try {
    await setResellerStatus(ctx.from.id, "STOPPED");
    const v = await getResellerView(ctx.from.id);
    if (v)
      return ctx.editMessageText(v.panelText, {
        parse_mode: "Markdown",
        reply_markup: resellerPanelKb,
      });
  } catch (e) {
    return ctx.reply(`Gagal menghentikan bot: ${(e as Error).message}`);
  }
});

bot.callbackQuery("rm_restart", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "🔄 Bot direstart" });
  try {
    await setResellerStatus(ctx.from.id, "ACTIVE");
    const v = await getResellerView(ctx.from.id);
    if (v)
      return ctx.editMessageText(v.panelText, {
        parse_mode: "Markdown",
        reply_markup: resellerPanelKb,
      });
  } catch (e) {
    return ctx.reply(`Gagal restart bot: ${(e as Error).message}`);
  }
});

bot.callbackQuery("rm_withdraw", (ctx) =>
  ctx.answerCallbackQuery({
    text: "⬇️ Fitur Withdraw segera hadir — saldo margin bisa ditarik setelah backend pencairan aktif.",
    show_alert: true,
  })
);

bot.callbackQuery("rm_rwd", (ctx) =>
  ctx.answerCallbackQuery({
    text: "📋 Riwayat WD segera hadir — backend pencairan menyusul.",
    show_alert: true,
  })
);

bot.callbackQuery("tos", async (ctx) => {
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(
    "*SYARAT & KETENTUAN*\n" +
      "Terakhir diperbarui: 22 Oktober 2026\n\n" +
      "Dengan menggunakan bot ini, Anda dianggap telah membaca dan menyetujui ketentuan berikut.\n\n" +
      "*1. Akun & Saldo*\n" +
      "• Akun, saldo, dan riwayat terikat pada akun Telegram Anda dan tidak dapat dipindahkan ke akun lain.\n" +
      "• Kerahasiaan akun Telegram serta perangkat Anda menjadi tanggung jawab masing-masing pengguna.\n\n" +
      "*2. Deposit*\n" +
      "• Nominal minimal Rp 2.000 dan maksimal Rp 1.000.000 per transaksi.\n" +
      "• Saldo dikreditkan hanya setelah pembayaran terkonfirmasi; deposit yang tidak dibayar dalam 10 menit otomatis kedaluwarsa.\n" +
      "• Kode unik pada nominal deposit merupakan bagian dari biaya layanan dan tidak ditambahkan ke saldo.\n\n" +
      "*3. Order Nomor OTP*\n" +
      "• Nomor disediakan oleh provider pihak ketiga; ketersediaan dan waktu tiba OTP berada di luar kendali kami.\n" +
      "• Order yang gagal, dibatalkan, atau kedaluwarsa dikembalikan otomatis ke saldo, penuh atau sebagian sesuai keputusan provider.\n\n" +
      "*4. Penggunaan Layanan*\n" +
      "• Layanan hanya untuk keperluan verifikasi yang sah atas akun milik Anda sendiri.\n" +
      "• Penyalahgunaan untuk aktivitas melanggar hukum dapat mengakibatkan penghentian layanan tanpa pemberitahuan.\n\n" +
      "*5. Pembaruan*\n" +
      "• Ketentuan dapat diperbarui sewaktu-waktu. Penggunaan lanjut setelah pembaruan dianggap sebagai persetujuan baru.",
    { parse_mode: "Markdown", reply_markup: backMenu }
  );
});

bot.callbackQuery("order", async (ctx) => {
  userView.delete(ctx.from.id);
  countryView.delete(ctx.from.id);
  operatorView.delete(ctx.from.id);
  priceView.delete(ctx.from.id);
  awaitingSearch.delete(ctx.from.id);
  awaitingCountrySearch.delete(ctx.from.id);
  return ctx.editMessageText(orderServerText, {
    parse_mode: "Markdown",
    reply_markup: orderServerKb,
  });
});

bot.callbackQuery("srv:1", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "⏳ Memuat layanan..." });
  try {
    const services = await loadServices();
    const msg = ctx.callbackQuery.message;
    userView.set(ctx.from.id, {
      list: services.map((s) => ({ id: s.id, name: s.name })),
      page: 1,
      chatId: msg?.chat.id ?? ctx.from.id,
      msgId: msg?.message_id ?? 0,
    });
    await showServicePage(ctx, ctx.from.id);
  } catch (e) {
    await ctx.reply(`Gagal memuat layanan: ${(e as Error).message}`);
  }
});

bot.callbackQuery(/^svc:page:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const view = userView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP" });
  view.page = page;
  await showServicePage(ctx, ctx.from.id);
});

bot.callbackQuery("svc:search", async (ctx) => {
  awaitingSearch.add(ctx.from.id);
  await ctx.answerCallbackQuery();
  await ctx.reply(searchPromptText, {
    parse_mode: "Markdown",
    reply_markup: searchCancelKb,
  });
});

bot.callbackQuery("svc:search_cancel", async (ctx) => {
  awaitingSearch.delete(ctx.from.id);
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

bot.callbackQuery(/^svc:(\d+)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery({ text: "⏳ Memuat negara..." });
  try {
    const services = await loadServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return ctx.reply("Layanan tidak ditemukan.");
    const list = await loadCountryStock(svc.id);
    countryView.set(ctx.from.id, {
      service: { id: svc.id, name: svc.name },
      list,
      page: 1,
    });
    awaitingSearch.delete(ctx.from.id);
    awaitingCountrySearch.delete(ctx.from.id);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    await safeEdit(
      ctx.editMessageText(countryListText(svc.name, list.length, 1, pages), {
        parse_mode: "Markdown",
        reply_markup: countryListKb(list, 1, pages, svc.id),
      })
    );
  } catch (e) {
    await ctx.reply(`Gagal memuat negara: ${(e as Error).message}`);
  }
});

bot.callbackQuery(/^ctr:page:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const view = countryView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP" });
  view.page = page;
  const pages = Math.max(1, Math.ceil(view.list.length / PAGE_SIZE));
  await ctx.editMessageText(countryListText(view.service.name, view.list.length, page, pages), {
    parse_mode: "Markdown",
    reply_markup: countryListKb(view.list, page, pages, view.service.id),
  });
});

bot.callbackQuery("ctr:search", async (ctx) => {
  awaitingCountrySearch.add(ctx.from.id);
  await ctx.answerCallbackQuery();
  await ctx.reply(countrySearchPromptText, {
    parse_mode: "Markdown",
    reply_markup: countrySearchCancelKb,
  });
});

bot.callbackQuery("ctr:search_cancel", async (ctx) => {
  awaitingCountrySearch.delete(ctx.from.id);
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery("ctr:back_svc", async (ctx) => {
  countryView.delete(ctx.from.id);
  awaitingCountrySearch.delete(ctx.from.id);
  const view = userView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP" });
  const pages = Math.max(1, Math.ceil(view.list.length / PAGE_SIZE));
  view.page = 1;
  await ctx.editMessageText(serviceListText(view.list.length, 1, pages), {
    parse_mode: "Markdown",
    reply_markup: serviceListKb(view.list, 1, pages),
  });
});

bot.callbackQuery("ctr:back_all", async (ctx) => {
  const view = countryView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP", show_alert: true });
  const list = await loadCountryStock(view.service.id);
  countryView.set(ctx.from.id, { ...view, list, page: 1 });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  await ctx.editMessageText(countryListText(view.service.name, list.length, 1, pages), {
    parse_mode: "Markdown",
    reply_markup: countryListKb(list, 1, pages, view.service.id),
  });
});

bot.callbackQuery(/^ctr:(\d+):(\d+)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  const ctrId = Number(ctx.match[2]);
  await ctx.answerCallbackQuery({ text: "⏳ Memuat operator..." });
  try {
    const services = await loadServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return ctx.reply("Layanan tidak ditemukan.");
    const countries = await loadCountries();
    const c = countries.find((x) => Number(x.id) === ctrId);
    if (!c) return ctx.reply("Negara tidak ditemukan.");
    const country: CountryItem = { id: Number(c.id), emoji: c.emoji, name: c.name };
    const ops = await getOperators(country.id, svc.id);
    const list: OperatorItem[] = ops
      .filter((o) => o.operator_id !== null)
      .map((o) => ({ id: Number(o.operator_id), name: o.local_name ?? o.name }));
    operatorView.set(ctx.from.id, { service: { id: svc.id, name: svc.name }, country, list });
    countryView.set(ctx.from.id, {
      service: { id: svc.id, name: svc.name },
      list: [country],
      page: 1,
    });
    await safeEdit(
      ctx.editMessageText(operatorListText(svc.name, country.emoji, country.name), {
        parse_mode: "Markdown",
        reply_markup: operatorListKb(list, svc.id, country.id),
      })
    );
  } catch (e) {
    await ctx.reply(`Gagal memuat operator: ${(e as Error).message}`);
  }
});

bot.callbackQuery("opr:back", async (ctx) => {
  const uid = ctx.from.id;
  const pv = priceView.get(uid);
  if (pv) {
    priceView.delete(uid);
    try {
      const ops = await getOperators(pv.country.id, pv.service.id);
      const list: OperatorItem[] = ops
        .filter((o) => o.operator_id !== null)
        .map((o) => ({ id: Number(o.operator_id), name: o.local_name ?? o.name }));
      operatorView.set(uid, { service: pv.service, country: pv.country, list });
      return safeEdit(
        ctx.editMessageText(
          operatorListText(pv.service.name, pv.country.emoji, pv.country.name),
          { parse_mode: "Markdown", reply_markup: operatorListKb(list, pv.service.id, pv.country.id) }
        )
      );
    } catch {}
  }
  operatorView.delete(uid);
  const view = countryView.get(uid);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP", show_alert: true });
  const list = await loadCountryStock(view.service.id).catch(() => view.list);
  countryView.set(uid, { ...view, list, page: 1 });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  await ctx.editMessageText(countryListText(view.service.name, list.length, 1, pages), {
    parse_mode: "Markdown",
    reply_markup: countryListKb(list, 1, pages, view.service.id),
  });
});

interface PriceViewState {
  service: ServiceItem;
  country: CountryItem;
  operatorName: string;
  oprId: number | null;
  list: PriceItem[];
  page: number;
}
const priceView = new Map<number, PriceViewState>();

async function loadPrices(
  svcId: number,
  ctrId: number,
  oprId: number | null
): Promise<PriceItem[]> {
  const all = await loadProducts(svcId);
  const products = filterProducts(all, ctrId, oprId);
  let rs: Awaited<ReturnType<typeof getResellerByUserId>> = null;
  if (OWNER_ID != null) {
    try {
      rs = await getResellerByUserId(OWNER_ID);
    } catch {
      rs = null;
    }
  }
  return products
    .filter((p) => p.active && p.available > 0)
    .map((p) => {
      const calc = calcPrice(p.price, "server1");
      const margin = !rs
        ? 0
        : rs.margin_type === "AMOUNT"
          ? rs.margin_amount
          : rs.margin_pct > 0
            ? Math.round((calc.sell * rs.margin_pct) / 100)
            : 0;
      return {
        id: p.id,
        modal: p.price,
        sell: calc.sell,
        buyerPrice: calc.sell + margin,
        available: p.available,
      };
    })
    .sort((a, b) => a.sell - b.sell);
}

async function safeEdit(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (!(e as Error).message.includes("message is not modified")) throw e;
  }
}

async function showPricePage(ctx: Context, userId: number) {
  const view = priceView.get(userId);
  if (!view) return;
  const pages = Math.max(1, Math.ceil(view.list.length / PAGE_SIZE));
  await safeEdit(
    ctx.editMessageText(
      priceListText(
        view.service.name,
        view.country.emoji,
        view.country.name,
        view.operatorName,
        view.page,
        pages,
        view.list.length
      ),
      {
        parse_mode: "Markdown",
        reply_markup: priceListKb(view.list, view.page, pages, view.service.id, view.country.id, view.oprId),
      }
    )
  );
}

bot.callbackQuery(/^opr:(\d+):(\d+):(any|\d+)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  const ctrId = Number(ctx.match[2]);
  const oprRaw = ctx.match[3];
  const oprId = oprRaw === "any" ? null : Number(oprRaw);
  await ctx.answerCallbackQuery({ text: "⏳ Memuat harga..." });
  try {
    const services = await loadServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return ctx.answerCallbackQuery({ text: "Layanan tidak ditemukan", show_alert: true });
    const countries = await loadCountries();
    const c = countries.find((x) => Number(x.id) === ctrId);
    if (!c) return ctx.answerCallbackQuery({ text: "Negara tidak ditemukan", show_alert: true });
    const country: CountryItem = { id: Number(c.id), emoji: c.emoji, name: c.name };
    let operatorName = "Semua Operator (Acak)";
    if (oprId != null) {
      const ops = await getOperators(country.id, svc.id);
      const op = ops.find((o) => Number(o.operator_id) === oprId);
      operatorName = op ? (op.local_name ?? op.name) : `Operator ${oprId}`;
    }
    const list = await loadPrices(svc.id, country.id, oprId);
    priceView.set(ctx.from.id, {
      service: { id: svc.id, name: svc.name },
      country,
      operatorName,
      oprId,
      list,
      page: 1,
    });
    await showPricePage(ctx, ctx.from.id);
  } catch (e) {
    await ctx.reply(`Gagal memuat harga: ${(e as Error).message}`);
  }
});

bot.callbackQuery(/^plc:page:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const view = priceView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP", show_alert: true });
  view.page = page;
  await showPricePage(ctx, ctx.from.id);
});

bot.callbackQuery(/^beli:(\d+):(\d+):(any|\d+):(\d+)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  const ctrId = Number(ctx.match[2]);
  const oprRaw = ctx.match[3];
  const oprId = oprRaw === "any" ? null : Number(oprRaw);
  const productId = Number(ctx.match[4]);
  const view = priceView.get(ctx.from.id);
  const item = view?.list.find((p) => p.id === productId);
  if (!view || !item)
    return ctx.answerCallbackQuery({
      text: "Sesi berakhir, buka ulang menu Order OTP",
      show_alert: true,
    });
  await safeEdit(
    ctx.editMessageText(
      buyConfirmText(view.country.emoji, view.country.name, view.service.name, item.available, item.buyerPrice ?? item.sell),
      { reply_markup: buyConfirmKb(svcId, ctrId, oprId, productId) }
    )
  );
});

bot.callbackQuery(/^buy1:(\d+):(\d+):(any|\d+):(\d+)$/, (ctx) =>
  executePurchase(ctx, ctx.match as RegExpMatchArray, 1)
);

bot.callbackQuery(/^buyqty:(\d+):(\d+):(any|\d+):(\d+):(\d+)$/, (ctx) =>
  executePurchase(ctx, ctx.match as RegExpMatchArray, Number(ctx.match[5]))
);

async function executePurchase(
  ctx: Context,
  match: RegExpMatchArray,
  qty: number
): Promise<void> {
  const svcId = Number(match[1]);
  const ctrId = Number(match[2]);
  const oprId = match[3] === "any" ? null : Number(match[3]);
  const productId = Number(match[4]);
  const from = ctx.from!;

  const view = priceView.get(from.id);
  const item = view?.list.find((p) => p.id === productId);
  if (!view || !item) {
    await ctx.answerCallbackQuery({
      text: "Sesi berakhir, buka ulang menu Order OTP",
      show_alert: true,
    });
    return;
  }
  qty = Math.min(item.available, Math.max(1, qty));

  if (!process.env.DATABASE_URL) {
    await ctx.answerCallbackQuery({
      text: "Database belum aktif — hubungi admin",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "⏳ Memproses order..." });

  const unitPrice = item.buyerPrice ?? item.sell;
  const total = unitPrice * qty;
  const modalTotal = item.modal * qty;

  let user;
  try {
    user = await getOrCreateUser(from);
  } catch (e) {
    await ctx.reply(`Gagal memuat data user: ${(e as Error).message}`);
    return;
  }

  const have = user.balance;
  if (have < total) {
    await ctx.reply(insufficientBalanceText(total, have), {
      parse_mode: "Markdown",
      reply_markup: backToMenuKb,
    });
    return;
  }

  try {
    const pb = await getProviderBalance();
    if (pb.balance < modalTotal) {
      await ctx.reply(systemEmptyText(), {
        parse_mode: "Markdown",
        reply_markup: backToMenuKb,
      });
      return;
    }
  } catch {
    // cek saldo provider gagal → lanjut, biar create order yang menentukan
  }

  const batchId = newBatchId();
  const deduct = await changeBalance(
    user.id,
    -total,
    "PURCHASE",
    batchId,
    `Order ${qty}x ${view.service.name} (${view.country.name})`
  );
  if (!deduct.ok) {
    await ctx.reply(insufficientBalanceText(total, have), {
      parse_mode: "Markdown",
      reply_markup: backToMenuKb,
    });
    return;
  }

  let created: Awaited<ReturnType<typeof createOrder>>;
  try {
    created = await createOrder(item.id, qty, batchId);
  } catch (e) {
    const err = e as Error & { code?: string };
    await changeBalance(
      user.id,
      total,
      "REFUND",
      batchId,
      `Refund order gagal: ${err.message}`
    );
    const text =
      err.code === "INSUFFICIENT_BALANCE" ? systemEmptyText() : orderFailedText(err.message);
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: backToMenuKb });
    return;
  }

  if (created.orders.length === 0) {
    await changeBalance(user.id, total, "REFUND", batchId, "Refund: provider tidak memberi nomor");
    await ctx.reply(orderFailedText("Tidak ada nomor tersedia saat ini."), {
      parse_mode: "Markdown",
      reply_markup: backToMenuKb,
    });
    return;
  }

  const gotTotal = created.orders.length * unitPrice;
  const refundFailed = total - gotTotal;
  if (refundFailed > 0) {
    await changeBalance(user.id, refundFailed, "REFUND", batchId, `Refund ${created.failedCount} nomor gagal`);
  }

  let balanceAfter = have;
  let idx = 0;
  for (const o of created.orders) {
    idx += 1;
    balanceAfter -= unitPrice;
    // Kirim kartu sementara dulu (tanpa tombol) untuk dapat chat_id & message_id
    const msg = await ctx.reply(
      orderCardText({
        idx,
        serviceName: view.service.name,
        countryEmoji: view.country.emoji,
        countryName: view.country.name,
        phone: o.phone_number,
        priceSell: unitPrice,
        balanceAfter,
        expiresAt: o.expires_at,
        status: "ACTIVE",
      }),
      { parse_mode: "Markdown" }
    );
    const dbId = await insertOrder(
      batchId,
      {
        userId: user.id,
        server: "server1",
        providerOrderId: o.id,
        productId: o.product_id,
        serviceId: svcId,
        serviceName: view.service.name,
        countryId: ctrId,
        countryName: view.country.name,
        countryEmoji: view.country.emoji,
        operatorId: oprId,
        operatorName: view.operatorName,
        phoneNumber: o.phone_number,
        priceModal: o.amount,
        priceSell: item.sell,
        priceReseller: OWNER_ID != null ? unitPrice : null,
        status: o.status === "ACTIVE" ? "ACTIVE" : "PENDING",
        expiresAt: o.expires_at,
      },
      { chatId: msg.chat.id, messageId: msg.message_id },
      OWNER_ID
    );
    // Pasang tombol Cancel setelah dbId tersedia — retry sekali jika gagal
    try {
      await bot.api.editMessageReplyMarkup(msg.chat.id, msg.message_id, {
        reply_markup: orderCardKb(dbId, "ACTIVE"),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
      await bot.api.editMessageReplyMarkup(msg.chat.id, msg.message_id, {
        reply_markup: orderCardKb(dbId, "ACTIVE"),
      }).catch((e) => console.error(`[order] gagal pasang tombol order ${dbId}:`, (e as Error).message));
    }
  }

  console.log(
    `[order] batch=${batchId} user=${user.id} qty=${created.orders.length} total=${gotTotal} provider_ids=${created.orders.map((o) => o.id).join(",")}`
  );
}

bot.callbackQuery(/^buyn:(\d+):(\d+):(any|\d+):(\d+)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  const ctrId = Number(ctx.match[2]);
  const oprId = ctx.match[3] === "any" ? null : Number(ctx.match[3]);
  const productId = Number(ctx.match[4]);
  const view = priceView.get(ctx.from.id);
  const item = view?.list.find((p) => p.id === productId);
  if (!view || !item)
    return ctx.answerCallbackQuery({
      text: "Sesi berakhir, buka ulang menu Order OTP",
      show_alert: true,
    });
  await safeEdit(
    ctx.editMessageText(
      buyManyText(view.country.emoji, view.country.name, view.service.name, item.available, item.buyerPrice ?? item.sell, 1),
      { reply_markup: buyManyKb(svcId, ctrId, oprId, productId, 1, item.available) }
    )
  );
});

bot.callbackQuery(/^qty:(\d+):(\d+):(any|\d+):(\d+):(\d+):(dec|inc)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  const ctrId = Number(ctx.match[2]);
  const oprId = ctx.match[3] === "any" ? null : Number(ctx.match[3]);
  const productId = Number(ctx.match[4]);
  const cur = Number(ctx.match[5]);
  const action = ctx.match[6];
  const view = priceView.get(ctx.from.id);
  const item = view?.list.find((p) => p.id === productId);
  if (!view || !item)
    return ctx.answerCallbackQuery({
      text: "Sesi berakhir, buka ulang menu Order OTP",
      show_alert: true,
    });
  const qty = Math.min(item.available, Math.max(1, action === "inc" ? cur + 1 : cur - 1));
  await safeEdit(
    ctx.editMessageText(
      buyManyText(view.country.emoji, view.country.name, view.service.name, item.available, item.buyerPrice ?? item.sell, qty),
      { reply_markup: buyManyKb(svcId, ctrId, oprId, productId, qty, item.available) }
    )
  );
});

bot.callbackQuery(/^buyconf:(\d+):(\d+):(any|\d+):(\d+)$/, async (ctx) => {
  const svcId = Number(ctx.match[1]);
  const ctrId = Number(ctx.match[2]);
  const oprId = ctx.match[3] === "any" ? null : Number(ctx.match[3]);
  const productId = Number(ctx.match[4]);
  const view = priceView.get(ctx.from.id);
  const item = view?.list.find((p) => p.id === productId);
  if (!view || !item)
    return ctx.answerCallbackQuery({
      text: "Sesi berakhir, buka ulang menu Order OTP",
      show_alert: true,
    });
  await safeEdit(
    ctx.editMessageText(
      buyConfirmText(view.country.emoji, view.country.name, view.service.name, item.available, item.buyerPrice ?? item.sell),
      { reply_markup: buyConfirmKb(svcId, ctrId, oprId, productId) }
    )
  );
});

bot.callbackQuery("buy:back", async (ctx) => {
  const view = priceView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP", show_alert: true });
  await showPricePage(ctx, ctx.from.id);
});

const awaitingDepCustom = new Set<number>();
const depState = new Map<number, { nominal: number }>();

bot.callbackQuery("deposit", async (ctx) => {
  if (!process.env.DATABASE_URL)
    return ctx.answerCallbackQuery({ text: "Database belum aktif — hubungi admin", show_alert: true });
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(depositNominalText, {
    parse_mode: "Markdown",
    reply_markup: depositNominalKb(),
  });
});

bot.callbackQuery(/^dep:(\d+)$/, async (ctx) => {
  const nominal = Number(ctx.match[1]);
  if (nominal < DEPOSIT_MIN || nominal > DEPOSIT_MAX)
    return ctx.answerCallbackQuery({ text: "Nominal di luar batas", show_alert: true });
  depState.set(ctx.from.id, { nominal });
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(depositMethodText(nominal), {
    parse_mode: "Markdown",
    reply_markup: depositMethodKb,
  });
});

bot.callbackQuery("dep:custom", async (ctx) => {
  awaitingDepCustom.add(ctx.from.id);
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(depositCustomText, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Kembali", "dep:list"),
  });
});

bot.callbackQuery("dep:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(depositNominalText, {
    parse_mode: "Markdown",
    reply_markup: depositNominalKb(),
  });
});

bot.callbackQuery("dep:back", async (ctx) => {
  const st = depState.get(ctx.from.id);
  await ctx.answerCallbackQuery();
  if (st) return ctx.editMessageText(depositNominalText, {
    parse_mode: "Markdown",
    reply_markup: depositNominalKb(),
  });
  return ctx.editMessageText(await renderMenu(ctx.from), {
    parse_mode: "Markdown",
    reply_markup: await menuKb(),
  });
});

bot.callbackQuery("dep:pay", async (ctx) => {
  const st = depState.get(ctx.from.id);
  if (!st) return ctx.answerCallbackQuery({ text: "Sesi berakhir, pilih nominal ulang", show_alert: true });
  const pg = getPgAdapter();
  const cfgErr = pg.configError();
  if (cfgErr) return ctx.answerCallbackQuery({ text: cfgErr, show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Membuat QRIS..." });

  const from = ctx.from;
  let user;
  try {
    user = await getOrCreateUser(from);
  } catch (e) {
    return ctx.reply(`Gagal: ${(e as Error).message}`);
  }

  // Fee deposit: on/off via DEPOSIT_FEE di .env (default aktif; "off"/"0" = tanpa fee)
  const feeEnv = (process.env.DEPOSIT_FEE ?? "").trim().toLowerCase();
  const feeOn = feeEnv !== "off" && feeEnv !== "0" && feeEnv !== "false";
  const uniqueCode = feeOn ? Math.floor(Math.random() * 200) + 1 : 0;
  const totalBayar = st.nominal + uniqueCode;
  const merchantRef = `DEP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;

  let inv;
  try {
    inv = await pg.createInvoice({
      displayRef: merchantRef,
      amount: totalBayar,
      telegramId: from.id,
      customerName: from.first_name || from.username || "Pengguna",
      description: `Deposit Nokos ${merchantRef} (nominal Rp ${st.nominal.toLocaleString("id-ID")})`,
      expiresInMin: DEPOSIT_EXPIRE_MIN,
    });
  } catch (e) {
    return ctx.reply(`Gagal membuat invoice: ${(e as Error).message}`);
  }

  const dbId = await insertDeposit({
    userId: user.id,
    amount: st.nominal,
    uniqueCode,
    externalId: inv.ref,
    ownerId: OWNER_ID,
  });

  const expiredWib = inv.expiresAt.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour12: false,
  });

  const caption = depositCreatedText({
    orderId: merchantRef,
    method: "QRIS",
    totalBayar: inv.amount || totalBayar,
    nominal: st.nominal,
    uniqueCode,
    status: "Menunggu Pembayaran",
    expiredWib,
  });

  const photo = await qrPhotoSource(inv);
  const waitKb = !photo && inv.link
    ? new InlineKeyboard().url("🔗 Buka Halaman Bayar", inv.link).row().text("🔴 Batalkan Deposit", "dep:cancel")
    : depositWaitKb;
  let msg;
  if (photo) {
    msg = await ctx
      .replyWithPhoto(photo, {
        caption,
        parse_mode: "Markdown",
        reply_markup: waitKb,
      })
      .catch(async () => {
        const m = await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: waitKb });
        return m;
      });
  } else {
    msg = await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: waitKb });
  }
  await setDepositMessage(dbId, msg.chat.id, msg.message_id);
  console.log(`[deposit] id=${dbId} ref=${inv.ref} pg=${pg.name} nominal=${st.nominal} total=${totalBayar}`);
});

bot.callbackQuery("dep:cancel", async (ctx) => {
  const d = await q1<DbDeposit>("SELECT * FROM tb_deposits WHERE chat_id = ? AND message_id = ? AND status = 'PENDING'", [
    ctx.chat?.id ?? -1,
    ctx.callbackQuery.message?.message_id ?? -1,
  ]);
  if (d) await markDeposit(d.id, "EXPIRED");

  const text = depositStatusText("CANCELED");
  // Kartu deposit berupa foto (caption), bukan teks — editMessageText selalu gagal di foto.
  // Coba caption dulu, fallback ke teks (kartu darurat tanpa foto).
  let ok = true;
  try {
    await ctx.editMessageCaption({ caption: text, parse_mode: "Markdown", reply_markup: backToMenuKb });
  } catch {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: backToMenuKb });
    } catch {
      ok = false;
    }
  }

  if (d) {
    await ctx.answerCallbackQuery({ text: "🔴 Deposit dibatalkan" });
    console.log(`[deposit] id=${d.id} dibatalkan user`);
  } else {
    await ctx.answerCallbackQuery({
      text: ok ? "Deposit ini sudah tidak aktif" : "Gagal memperbarui pesan",
      show_alert: !ok,
    });
  }
});

bot.on("message:text", async (ctx) => {
  const id = ctx.from.id;

  if (awaitingResellerToken.has(id)) {
    await handleResellerToken(ctx, ctx.message.text);
    return;
  }

  if (awaitingMargin.has(id)) {
    const type = awaitingMargin.get(id)!;
    if (type === "PCT") {
      const pct = Number(ctx.message.text.trim().replace("%", ""));
      if (!Number.isInteger(pct) || pct < 5) {
        await ctx.reply("⚠️ Persen harus angka bulat minimal 5 (contoh: 10). Kirim ulang.", {
          reply_markup: resellerBackKb,
        });
        return;
      }
      awaitingMargin.delete(id);
      try {
        await updateResellerMargin(id, "PCT", pct);
        await ctx.reply(`✅ Margin diatur ke ${pct}%.`);
        const v = await getResellerView(id);
        if (v)
          await ctx.reply(v.panelText, { parse_mode: "Markdown", reply_markup: resellerPanelKb });
      } catch (e) {
        await ctx.reply(`Gagal menyimpan margin: ${(e as Error).message}`);
      }
      return;
    }
    const amt = Number(ctx.message.text.replace(/[^\d]/g, ""));
    if (!Number.isInteger(amt) || amt < 0 || amt > 10_000_000) {
      await ctx.reply("⚠️ Nominal harus angka 0–10.000.000 (contoh: 1500). Kirim ulang.", {
        reply_markup: resellerBackKb,
      });
      return;
    }
    awaitingMargin.delete(id);
    try {
      await updateResellerMargin(id, "AMOUNT", amt);
      await ctx.reply(
        `✅ Margin diatur ke Rp ${amt.toLocaleString("id-ID")} / nomor.`
      );
      const v = await getResellerView(id);
      if (v)
        await ctx.reply(v.panelText, { parse_mode: "Markdown", reply_markup: resellerPanelKb });
    } catch (e) {
      await ctx.reply(`Gagal menyimpan margin: ${(e as Error).message}`);
    }
    return;
  }

  if (awaitingCs.has(id)) {
    const contact = ctx.message.text.trim();
    if (contact.length < 3 || contact.length > 64) {
      await ctx.reply("⚠️ Kontak CS minimal 3 dan maksimal 64 karakter. Kirim ulang.", {
        reply_markup: backToMenuKb,
      });
      return;
    }
    awaitingCs.delete(id);
    try {
      await updateResellerCs(id, contact);
      await ctx.reply("✅ Contact CS disimpan. Bot akan menyala otomatis bila sebelumnya belum aktif.");
      const v = await getResellerView(id);
      if (v)
        await ctx.reply(v.panelText, { parse_mode: "Markdown", reply_markup: resellerPanelKb });
    } catch (e) {
      await ctx.reply(`Gagal menyimpan Contact CS: ${(e as Error).message}`);
    }
    return;
  }

  if (awaitingDepCustom.has(id)) {
    awaitingDepCustom.delete(id);
    const n = Number(ctx.message.text.replace(/[^\d]/g, ""));
    if (!n || n < DEPOSIT_MIN || n > DEPOSIT_MAX) {
      await ctx.reply(
        `⚠️ Nominal minimal Rp ${DEPOSIT_MIN.toLocaleString("id-ID")} dan maksimal Rp ${DEPOSIT_MAX.toLocaleString("id-ID")}.`,
        { reply_markup: depositNominalKb() }
      );
      return;
    }
    depState.set(id, { nominal: n });
    await ctx.reply(depositMethodText(n), {
      parse_mode: "Markdown",
      reply_markup: depositMethodKb,
    });
    return;
  }

  if (awaitingCountrySearch.has(id)) {
    awaitingCountrySearch.delete(id);
    const q = ctx.message.text.trim();
    if (!q) return;
    const view = countryView.get(id);
    if (!view) return ctx.reply("Buka ulang menu Order OTP.");
    const list = view.list.filter((c) =>
      c.name.toLowerCase().includes(q.toLowerCase())
    );
    await ctx.reply(searchResultText(q, list.length), {
      parse_mode: "Markdown",
      reply_markup: countrySearchResultKb(list, view.service.id),
    });
    return;
  }

  if (!awaitingSearch.has(id)) return;
  awaitingSearch.delete(id);
  const q = ctx.message.text.trim();
  if (!q) return;
  const all = await loadServices();
  const list = all
    .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    .map((s) => ({ id: s.id, name: s.name }));
  await ctx.reply(searchResultText(q, list.length), {
    parse_mode: "Markdown",
    reply_markup: searchResultKb(list),
  });
});

bot.callbackQuery("svc:back_all", async (ctx) => {
  const view = userView.get(ctx.from.id);
  if (!view) return ctx.answerCallbackQuery({ text: "Buka ulang menu Order OTP" });
  view.list = (await loadServices()).map((s) => ({ id: s.id, name: s.name }));
  view.page = 1;
  view.query = undefined;
  await ctx
    .editMessageText(serviceListText(view.list.length, 1, Math.max(1, Math.ceil(view.list.length / PAGE_SIZE))), {
      parse_mode: "Markdown",
      reply_markup: serviceListKb(view.list, 1, Math.max(1, Math.ceil(view.list.length / PAGE_SIZE))),
    })
    .catch(() => {});
});

bot.callbackQuery(/^ocancel:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  const r = await cancelOrderHandler(id);
  if (!r.ok)
    await ctx.reply(r.reason ?? "Gagal cancel order").catch(() => {});
});

bot.callbackQuery(/^ofinish:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  const r = await finishOrderHandler(id);
  if (!r.ok)
    await ctx.reply(r.reason ?? "Gagal menyelesaikan order").catch(() => {});
});

async function orderHistoryView(userId: number, page: number) {
  const total = await countUserOrders(userId, OWNER_ID);
  if (!total)
    return {
      text: "📭 *HISTORY ORDER*\n\nBelum ada order.",
      kb: backMenu,
    };
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  page = Math.min(Math.max(1, page), totalPages);
  const offset = (page - 1) * HISTORY_PAGE_SIZE;
  const rows = await getUserOrdersPaged(userId, HISTORY_PAGE_SIZE, offset, OWNER_ID);
  const items = rows.map((o, i) =>
    historyOrderText({
      idx: offset + i + 1,
      serviceName: o.service_name,
      phone: o.phone_number,
      priceSell: o.price_sell,
      status: o.status,
      otpCode: o.otp_code,
      createdAt: o.created_at,
    })
  );
  return {
    text: `📋 *HISTORY ORDER*\n\n${items.join("\n\n")}`,
    kb: historyOrderKb(page, totalPages),
  };
}

async function showOrderHistory(ctx: Context, page: number): Promise<void> {
  if (!ctx.from) return;
  const user = await getOrCreateUser(ctx.from);
  const v = await orderHistoryView(user.id, page);
  await ctx.editMessageText(v.text, {
    parse_mode: "Markdown",
    reply_markup: v.kb,
  });
}

bot.callbackQuery("hist_order", async (ctx) => {
  if (!process.env.DATABASE_URL)
    return ctx.answerCallbackQuery({ text: "Database belum aktif", show_alert: true });
  await ctx.answerCallbackQuery();
  try {
    await showOrderHistory(ctx, 1);
  } catch (e) {
    console.error("[hist] gagal:", (e as Error).message);
  }
});

bot.callbackQuery(/^hist:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await showOrderHistory(ctx, Number(ctx.match[1]));
  } catch (e) {
    console.error("[hist] gagal:", (e as Error).message);
  }
});

bot.callbackQuery("hist:p", (ctx) => ctx.answerCallbackQuery());

async function depositHistoryView(userId: number, page: number) {
  const total = await countUserDeposits(userId, OWNER_ID);
  if (!total)
    return {
      text: "💳 *HISTORY DEPOSIT*\n\nBelum ada deposit.",
      kb: backMenu,
    };
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  page = Math.min(Math.max(1, page), totalPages);
  const offset = (page - 1) * HISTORY_PAGE_SIZE;
  const rows = await getUserDepositsPaged(userId, HISTORY_PAGE_SIZE, offset, OWNER_ID);
  const items = rows.map((d, i) =>
    historyDepositText({
      idx: offset + i + 1,
      amount: d.amount,
      externalId: d.external_id,
      status: d.status,
      createdAt: d.created_at,
    })
  );
  return {
    text: `💳 *HISTORY DEPOSIT*\n\n${items.join("\n\n")}`,
    kb: historyDepositKb(page, totalPages),
  };
}

async function showDepositHistory(ctx: Context, page: number): Promise<void> {
  if (!ctx.from) return;
  const user = await getOrCreateUser(ctx.from);
  const v = await depositHistoryView(user.id, page);
  await ctx.editMessageText(v.text, {
    parse_mode: "Markdown",
    reply_markup: v.kb,
  });
}

bot.callbackQuery("hist_deposit", async (ctx) => {
  if (!process.env.DATABASE_URL)
    return ctx.answerCallbackQuery({ text: "Database belum aktif", show_alert: true });
  await ctx.answerCallbackQuery();
  try {
    await showDepositHistory(ctx, 1);
  } catch (e) {
    console.error("[hdep] gagal:", (e as Error).message);
  }
});

bot.callbackQuery(/^hdep:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await showDepositHistory(ctx, Number(ctx.match[1]));
  } catch (e) {
    console.error("[hdep] gagal:", (e as Error).message);
  }
});

bot.callbackQuery("hdep:p", (ctx) => ctx.answerCallbackQuery());

bot.callbackQuery("back_menu", async (ctx) => {
  clearResellerInput(ctx.from.id);
  return ctx.editMessageText(await renderMenu(ctx.from), {
    parse_mode: "Markdown",
    reply_markup: await menuKb(),
  });
});

bot.on("callback_query:data", async (ctx) => {
  if (["help", "back_menu"].includes(ctx.callbackQuery.data)) return;
  await ctx.answerCallbackQuery({ text: "Menu belum aktif" });
});

bot.catch((err) => console.error(err.error));

if (process.env.DATABASE_URL) {
  const { migrate } = await import("./db/migrate.js");
  migrate().catch((e) => console.error("[db] migrate gagal:", e.message));
} else {
  console.warn("[db] DATABASE_URL kosong — skip migrate, mode tanpa DB");
}

void bot.api
  .setMyCommands([
    { command: "start", description: "Mulai bot & menu utama" },
    { command: "menu", description: "Menu utama" },
    { command: "order", description: "Order nomor OTP" },
    { command: "deposit", description: "Isi saldo deposit" },
    { command: "history", description: "Histori order" },
    { command: "hisdeposit", description: "Histori deposit" },
    { command: "help", description: "Cara penggunaan" },
  ])
  .then(() => console.log("[cmd] shortcut menu terpasang"))
  .catch((e) => console.error("[cmd] setMyCommands gagal:", e.message));

bot.start({ drop_pending_updates: true });
console.log("Bot berjalan (long polling)...");
startPoller(bot, OWNER_ID);
void warmup();
