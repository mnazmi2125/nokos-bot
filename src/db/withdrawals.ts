import { q, q1, qExec } from "./index.js";

export type WdStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface DbWithdrawal {
  id: number;
  reseller_id: number;
  amount: number;
  status: WdStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export async function hasPendingWithdrawal(resellerId: number): Promise<boolean> {
  const r = await q1<{ c: number }>(
    "SELECT COUNT(*) AS c FROM tb_withdrawals WHERE reseller_id = ? AND status = 'PENDING'",
    [resellerId]
  );
  return (r?.c ?? 0) > 0;
}

export async function insertWithdrawal(resellerId: number, amount: number): Promise<number> {
  const r = await qExec(
    "INSERT INTO tb_withdrawals (reseller_id, amount) VALUES (?, ?)",
    [resellerId, amount]
  );
  return r.insertId;
}

export async function getWithdrawalsPaged(
  resellerId: number,
  limit: number,
  offset: number
): Promise<DbWithdrawal[]> {
  return q<DbWithdrawal>(
    "SELECT * FROM tb_withdrawals WHERE reseller_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
    [resellerId, limit, offset]
  );
}

export async function countWithdrawals(resellerId: number): Promise<number> {
  const r = await q1<{ c: number }>(
    "SELECT COUNT(*) AS c FROM tb_withdrawals WHERE reseller_id = ?",
    [resellerId]
  );
  return r?.c ?? 0;
}

export async function getWithdrawalById(id: number): Promise<DbWithdrawal | null> {
  return q1<DbWithdrawal>("SELECT * FROM tb_withdrawals WHERE id = ?", [id]);
}
