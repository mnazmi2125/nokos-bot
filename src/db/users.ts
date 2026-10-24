import { randomUUID } from "crypto";
import { q, q1, getPool } from "./index.js";

export interface DbUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  balance: number;
  referral_code: string;
  is_banned: number;
}

export async function getOrCreateUser(tg: {
  id: number;
  username?: string | undefined;
  first_name?: string | undefined;
}): Promise<DbUser> {
  const existing = await q1<DbUser>("SELECT * FROM tb_users WHERE telegram_id = ?", [tg.id]);
  if (existing) return existing;
  const code = `R${String(tg.id).slice(-6)}${randomUUID().slice(0, 4).toUpperCase()}`;
  await q(
    "INSERT INTO tb_users (telegram_id, username, first_name, referral_code) VALUES (?, ?, ?, ?)",
    [tg.id, tg.username ?? null, tg.first_name ?? null, code]
  );
  return (await q1<DbUser>("SELECT * FROM tb_users WHERE telegram_id = ?", [tg.id]))!;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  return q1<DbUser>("SELECT * FROM tb_users WHERE id = ?", [id]);
}

type TxType = "DEPOSIT" | "PURCHASE" | "REFUND" | "BONUS" | "ADJUSTMENT";

export async function changeBalance(
  userId: number,
  delta: number,
  type: TxType,
  reference?: string,
  description?: string
): Promise<{ ok: boolean; balance?: number; reason?: string }> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT balance FROM tb_users WHERE id = ? FOR UPDATE",
      [userId]
    );
    const row = (rows as { balance: number }[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "user tidak ditemukan" };
    }
    const newBal = row.balance + delta;
    if (newBal < 0) {
      await conn.rollback();
      return { ok: false, reason: "Saldo tidak mencukupi" };
    }
    await conn.execute("UPDATE tb_users SET balance = ? WHERE id = ?", [newBal, userId]);
    await conn.execute(
      "INSERT INTO tb_transactions (user_id, type, amount, balance_after, reference, description) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, type, delta, newBal, reference ?? null, description ?? null]
    );
    await conn.commit();
    return { ok: true, balance: newBal };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getBalance(userId: number): Promise<number> {
  const u = await q1<{ balance: number }>("SELECT balance FROM tb_users WHERE id = ?", [userId]);
  return u?.balance ?? 0;
}

export interface TxRow {
  id: number;
  type: TxType;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export async function getTransactions(userId: number, limit = 10): Promise<TxRow[]> {
  return q<TxRow>(
    "SELECT id, type, amount, balance_after, description, created_at FROM tb_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    [userId, limit]
  );
}
