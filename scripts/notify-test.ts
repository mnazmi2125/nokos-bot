// Tes kirim notifikasi ke channel (verifikasi ID + izin admin).
import "dotenv/config";
import { Bot } from "grammy";

const target = process.env.NOTIFY_CHANNEL_ID?.trim();
if (!target) {
  console.error("NOTIFY_CHANNEL_ID kosong di .env");
  process.exit(1);
}
if (!process.env.BOT_TOKEN) {
  console.error("BOT_TOKEN kosong di .env");
  process.exit(1);
}

const bot = new Bot(process.env.BOT_TOKEN);
try {
  const me = await bot.api.getMe();
  const r = await bot.api.sendMessage(
    target,
    "✅ <b>TES NOTIFIKASI</b>\nBot ini berhasil terhubung ke channel — fitur history aktif.",
    { parse_mode: "HTML" }
  );
  console.log(`OK: terkirim sebagai @${me.username} ke chat ${r.chat.id} (${r.chat.title ?? "-"})`);
  process.exit(0);
} catch (e) {
  console.error("GAGAL:", (e as Error).message);
  process.exit(1);
}
