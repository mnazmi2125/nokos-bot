import type { Bot } from "grammy";
import { q1 } from "./db/index.js";
import { DbOrder, getActiveOrders, updateOrderStatus } from "./db/orders.js";
import { changeBalance } from "./db/users.js";
import { cancelOrder as providerCancel, getOrder } from "./providers/smscode/orders.js";
import { orderCardText, orderCardKb, depositPaidText, depositStatusText, backToMenuKb } from "./ui.js";
import { getPendingDeposits, markDeposit, DbDeposit } from "./db/deposits.js";
import { creditOrderMargin } from "./db/resellers.js";
import { getPgAdapter, DEPOSIT_EXPIRE_MIN } from "./pg/index.js";

const POLL_MS = 4_000;

let botRef: Bot | null = null;
let botOwner: number | null = null;

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

export async function refreshOrderCard(o: DbOrder): Promise<void> {
  if (!botRef || !o.chat_id || !o.message_id) return;
  try {
    await botRef.api.editMessageText(
      o.chat_id,
      o.message_id,
      orderCardText({
        idx: 1,
        serviceName: o.service_name,
        countryEmoji: o.country_emoji,
        countryName: o.country_name,
        phone: o.phone_number,
        priceSell: o.price_sell,
        balanceAfter: null,
        expiresAt: o.expires_at,
        status: o.status === "PENDING" ? "ACTIVE" : o.status,
        otpCode: o.otp_code,
      }),
      {
        parse_mode: "Markdown",
        reply_markup: orderCardKb(o.id, o.status === "PENDING" ? "ACTIVE" : o.status),
      }
    );
  } catch (e) {
    if (!(e as Error).message.includes("message is not modified")) {
      console.error(`[poll] refresh card order ${o.id}:`, (e as Error).message);
    }
  }
}

function refundedAmount(o: DbOrder): number {
  return o.price_reseller ?? o.price_sell;
}

async function creditResellerMargin(o: DbOrder): Promise<void> {
  if (o.owner_id == null || o.price_reseller == null) return;
  const margin = o.price_reseller - o.price_sell;
  if (margin <= 0) return;
  try {
    await creditOrderMargin(o.id, o.owner_id, margin);
    console.log(`[margin] order ${o.id} selesai → Rp ${margin} ke saldo margin reseller ${o.owner_id}`);
  } catch (e) {
    console.error(`[margin] order ${o.id} gagal kredit:`, (e as Error).message);
  }
}

async function refundExpired(o: DbOrder): Promise<void> {
  const amount = refundedAmount(o);
  await updateOrderStatus(o.id, "EXPIRED");
  await changeBalance(
    o.user_id,
    amount,
    "REFUND",
    `order:${o.id}`,
    `Refund expired: ${o.phone_number ?? o.provider_order_id}`
  );
  await refreshOrderCard(o);
  console.log(`[poll] order ${o.id} expired → refund Rp ${amount} ke user ${o.user_id}`);
}

async function editDepositCard(d: DbDeposit, text: string): Promise<void> {
  if (!botRef || !d.chat_id || !d.message_id) return;
  try {
    await botRef.api.editMessageCaption(d.chat_id, d.message_id, {
      caption: text,
      parse_mode: "Markdown",
      reply_markup: backToMenuKb,
    });
    return;
  } catch {}
  try {
    await botRef.api.editMessageText(d.chat_id, d.message_id, text, {
      parse_mode: "Markdown",
      reply_markup: backToMenuKb,
    });
  } catch {}
}

async function pollDeposits(): Promise<void> {
  const pg = getPgAdapter();
  if (pg.configError()) return;
  const pending = await getPendingDeposits(botOwner);
  for (const d of pending) {
    try {
      let status = await pg.getStatus(d.external_id);
      if (
        status === "PENDING" &&
        Date.now() - new Date(d.created_at).getTime() > DEPOSIT_EXPIRE_MIN * 60_000
      )
        status = "EXPIRED";
      if (status === "PENDING") continue;

      if (status === "PAID") {
        await markDeposit(d.id, "PAID");
        const r = await changeBalance(
          d.user_id,
          d.amount,
          "DEPOSIT",
          `dep:${d.id}`,
          `Deposit QRIS ${d.external_id} (${pg.name})`
        );
        const text = depositPaidText(d.amount, r.balance ?? 0);
        await editDepositCard(d, text);
        if (botRef && d.chat_id) {
          await botRef.api
            .sendMessage(d.chat_id, text, { parse_mode: "Markdown" })
            .catch(() => {});
        }
        console.log(`[deposit] id=${d.id} PAID Rp ${d.amount} → user ${d.user_id} via ${pg.name}`);
      } else {
        await markDeposit(d.id, status === "EXPIRED" ? "EXPIRED" : "FAILED");
        await editDepositCard(d, depositStatusText(status === "EXPIRED" ? "EXPIRED" : "FAILED"));
        console.log(`[deposit] id=${d.id} ${status} (${pg.name})`);
      }
    } catch (e) {
      console.error(`[deposit] id=${d.id} gagal:`, (e as Error).message);
    }
  }
}

async function pollOnce(): Promise<void> {
  const active = await getActiveOrders(botOwner);
  for (const o of active) {
    try {
      if (isExpired(o.expires_at)) {
        await refundExpired(o);
        continue;
      }
      const po = await getOrder(o.provider_order_id);
      if (po.status === "OTP_RECEIVED" && po.otp_code) {
        await updateOrderStatus(o.id, "OTP_RECEIVED", {
          otpCode: po.otp_code,
          otpMessage: po.otp_message ?? null,
        });
        await refreshOrderCard({ ...o, status: "OTP_RECEIVED", otp_code: po.otp_code });
        console.log(`[poll] order ${o.id} OTP masuk: ${po.otp_code}`);
      } else if (po.status === "EXPIRED") {
        await refundExpired(o);
      } else if (po.status === "CANCELED") {
        await updateOrderStatus(o.id, "CANCELED");
        await refreshOrderCard({ ...o, status: "CANCELED" });
      } else if (po.status === "COMPLETED") {
        await updateOrderStatus(o.id, "COMPLETED");
        await creditResellerMargin(o);
        await refreshOrderCard({ ...o, status: "COMPLETED", otp_code: po.otp_code ?? o.otp_code });
      }
    } catch (e) {
      console.error(`[poll] order ${o.id} gagal:`, (e as Error).message);
    }
  }
}

export function startPoller(bot: Bot, owner: number | null = null): void {
  botRef = bot;
  botOwner = owner;
  if (!process.env.DATABASE_URL) {
    console.warn("[poll] DATABASE_URL kosong — poller nonaktif");
    return;
  }
  setInterval(() => {
    pollOnce().catch((e) => console.error("[poll] error:", (e as Error).message));
    pollDeposits().catch((e) => console.error("[deposit] error:", (e as Error).message));
  }, POLL_MS);
  console.log(`[poll] poller aktif tiap ${POLL_MS / 1000}s (owner: ${owner == null ? "main" : owner})`);
}

export async function cancelOrderHandler(
  orderId: number
): Promise<{ ok: boolean; reason?: string }> {
  const o = await q1<DbOrder>("SELECT * FROM tb_orders WHERE id = ?", [orderId]);
  if (!o) return { ok: false, reason: "Order tidak ditemukan" };
  if (o.status !== "ACTIVE") return { ok: false, reason: "Order sudah tidak aktif" };

  try {
    await providerCancel(o.provider_order_id);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.toLowerCase().includes("too early")) {
      return {
        ok: false,
        reason: "Terlalu cepat untuk cancel (min. 2 menit). Tunggu expire agar saldo kembali.",
      };
    }
    return { ok: false, reason: msg };
  }

  const amount = refundedAmount(o);
  await updateOrderStatus(o.id, "CANCELED");
  await changeBalance(
    o.user_id,
    amount,
    "REFUND",
    `order:${o.id}`,
    `Cancel: ${o.phone_number ?? o.provider_order_id}`
  );
  await refreshOrderCard({ ...o, status: "CANCELED" });
  console.log(`[cancel] order ${o.id} dibatalkan → refund Rp ${amount} ke user ${o.user_id}`);
  return { ok: true };
}

export async function finishOrderHandler(orderId: number): Promise<{ ok: boolean; reason?: string }> {
  const o = await q1<DbOrder>("SELECT * FROM tb_orders WHERE id = ?", [orderId]);
  if (!o) return { ok: false, reason: "Order tidak ditemukan" };
  if (o.status !== "OTP_RECEIVED") return { ok: false, reason: "OTP belum diterima" };
  const { finishOrder } = await import("./providers/smscode/orders.js");
  try {
    await finishOrder(o.provider_order_id);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  await updateOrderStatus(o.id, "COMPLETED");
  await creditResellerMargin(o);
  await refreshOrderCard({ ...o, status: "COMPLETED" });
  return { ok: true };
}
