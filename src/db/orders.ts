import { randomUUID } from "crypto";
import { q, q1, qExec } from "./index.js";

export type OrderStatus =
  | "PENDING"
  | "ACTIVE"
  | "OTP_RECEIVED"
  | "COMPLETED"
  | "CANCELED"
  | "EXPIRED"
  | "FAILED";

export interface DbOrder {
  id: number;
  user_id: number;
  batch_id: string;
  server: string;
  owner_id: number | null;
  provider_order_id: number;
  product_id: number;
  service_id: number;
  service_name: string;
  country_id: number;
  country_name: string;
  country_emoji: string;
  operator_id: number | null;
  operator_name: string | null;
  phone_number: string | null;
  chat_id: number | null;
  message_id: number | null;
  price_modal: number;
  price_sell: number;
  price_reseller: number | null;
  margin_credited: number;
  status: OrderStatus;
  otp_code: string | null;
  otp_message: string | null;
  expires_at: string | null;
  otp_received_at: string | null;
  created_at: string;
}

export interface NewOrder {
  userId: number;
  server: string;
  providerOrderId: number;
  productId: number;
  serviceId: number;
  serviceName: string;
  countryId: number;
  countryName: string;
  countryEmoji: string;
  operatorId: number | null;
  operatorName: string | null;
  phoneNumber: string | null;
  priceModal: number;
  priceSell: number;
  priceReseller?: number | null;
  status: OrderStatus;
  expiresAt: string | null;
}

export function newBatchId(): string {
  return randomUUID();
}

export async function insertOrder(
  batchId: string,
  o: NewOrder,
  ref?: { chatId: number; messageId: number },
  owner: number | null = null
): Promise<number> {
  const r = await qExec(
    `INSERT INTO tb_orders
     (batch_id, user_id, server, owner_id, provider_order_id, product_id, service_id, service_name,
      country_id, country_name, country_emoji, operator_id, operator_name, phone_number,
      chat_id, message_id, price_modal, price_sell, price_reseller, status, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      batchId, o.userId, o.server, owner, o.providerOrderId, o.productId, o.serviceId, o.serviceName,
      o.countryId, o.countryName, o.countryEmoji, o.operatorId, o.operatorName, o.phoneNumber,
      ref?.chatId ?? null, ref?.messageId ?? null, o.priceModal, o.priceSell, o.priceReseller ?? null,
      o.status, o.expiresAt,
    ]
  );
  return r.insertId;
}

export async function updateOrderStatus(
  id: number,
  status: OrderStatus,
  extra: { otpCode?: string | null; otpMessage?: string | null } = {}
): Promise<void> {
  await q(
    `UPDATE tb_orders SET status = ?,
      otp_code = COALESCE(?, otp_code),
      otp_message = COALESCE(?, otp_message),
      otp_received_at = CASE WHEN ? IS NOT NULL AND otp_received_at IS NULL THEN NOW() ELSE otp_received_at END
     WHERE id = ?`,
    [status, extra.otpCode ?? null, extra.otpMessage ?? null, extra.otpCode ?? null, id]
  );
}

export async function getActiveOrders(owner: number | null): Promise<DbOrder[]> {
  const cond = owner == null ? "owner_id IS NULL" : "owner_id = ?";
  return q<DbOrder>(
    `SELECT * FROM tb_orders WHERE ${cond} AND status IN ('PENDING','ACTIVE')`,
    owner == null ? [] : [owner]
  );
}

export async function getOrderById(id: number): Promise<DbOrder | null> {
  return q1<DbOrder>("SELECT * FROM tb_orders WHERE id = ?", [id]);
}

export async function getUserOrders(userId: number, limit = 10): Promise<DbOrder[]> {
  return q<DbOrder>(
    "SELECT * FROM tb_orders WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    [userId, limit]
  );
}

export async function countUserOrders(userId: number, owner: number | null): Promise<number> {
  const cond = owner == null ? " AND owner_id IS NULL" : " AND owner_id = ?";
  const r = await q1<{ c: number }>(
    `SELECT COUNT(*) AS c FROM tb_orders WHERE user_id = ?${cond}`,
    owner == null ? [userId] : [userId, owner]
  );
  return r?.c ?? 0;
}

export async function getUserOrdersPaged(
  userId: number,
  limit: number,
  offset: number,
  owner: number | null
): Promise<DbOrder[]> {
  const cond = owner == null ? " AND owner_id IS NULL" : " AND owner_id = ?";
  return q<DbOrder>(
    `SELECT * FROM tb_orders WHERE user_id = ?${cond} ORDER BY id DESC LIMIT ? OFFSET ?`,
    owner == null ? [userId, limit, offset] : [userId, owner, limit, offset]
  );
}
