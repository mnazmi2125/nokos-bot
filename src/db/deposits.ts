import { q, q1, qExec } from "./index.js";

export type DepositStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED";

export interface DbDeposit {
  id: number;
  user_id: number;
  owner_id: number | null;
  amount: number;
  unique_code: number;
  method: string;
  external_id: string;
  status: DepositStatus;
  chat_id: number | null;
  message_id: number | null;
  paid_at: string | null;
  created_at: string;
}

export async function insertDeposit(d: {
  userId: number;
  amount: number;
  uniqueCode: number;
  externalId: string;
  chatId?: number | null;
  messageId?: number | null;
  ownerId?: number | null;
}): Promise<number> {
  const r = await qExec(
    `INSERT INTO tb_deposits (user_id, owner_id, amount, unique_code, method, external_id, status, chat_id, message_id)
     VALUES (?, ?, ?, ?, ?, 'QRIS', 'PENDING', ?, ?)`,
    [d.userId, d.ownerId ?? null, d.amount, d.uniqueCode, d.externalId, d.chatId ?? null, d.messageId ?? null]
  );
  return r.insertId;
}

export async function setDepositMessage(id: number, chatId: number, messageId: number): Promise<void> {
  await q("UPDATE tb_deposits SET chat_id = ?, message_id = ? WHERE id = ?", [chatId, messageId, id]);
}

export async function markDeposit(id: number, status: DepositStatus): Promise<void> {
  await q("UPDATE tb_deposits SET status = ?, paid_at = IF(? = 'PAID', NOW(), paid_at) WHERE id = ?", [
    status,
    status,
    id,
  ]);
}

export async function getPendingDeposits(owner: number | null): Promise<DbDeposit[]> {
  const cond = owner == null ? "owner_id IS NULL" : "owner_id = ?";
  return q<DbDeposit>(
    `SELECT * FROM tb_deposits WHERE ${cond} AND status = 'PENDING' ORDER BY id ASC LIMIT 50`,
    owner == null ? [] : [owner]
  );
}

export async function getDepositByRef(externalId: string): Promise<DbDeposit | null> {
  return q1<DbDeposit>("SELECT * FROM tb_deposits WHERE external_id = ?", [externalId]);
}

export async function getUserDeposits(userId: number, limit = 10): Promise<DbDeposit[]> {
  return q<DbDeposit>("SELECT * FROM tb_deposits WHERE user_id = ? ORDER BY id DESC LIMIT ?", [
    userId,
    limit,
  ]);
}

export async function countUserDeposits(userId: number, owner: number | null): Promise<number> {
  const cond = owner == null ? " AND owner_id IS NULL" : " AND owner_id = ?";
  const r = await q1<{ c: number }>(
    `SELECT COUNT(*) AS c FROM tb_deposits WHERE user_id = ?${cond}`,
    owner == null ? [userId] : [userId, owner]
  );
  return r?.c ?? 0;
}

export async function getUserDepositsPaged(
  userId: number,
  limit: number,
  offset: number,
  owner: number | null
): Promise<DbDeposit[]> {
  const cond = owner == null ? " AND owner_id IS NULL" : " AND owner_id = ?";
  return q<DbDeposit>(
    `SELECT * FROM tb_deposits WHERE user_id = ?${cond} ORDER BY id DESC LIMIT ? OFFSET ?`,
    owner == null ? [userId, limit, offset] : [userId, owner, limit, offset]
  );
}
