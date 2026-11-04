import { q, q1, qExec } from "./index.js";

export interface DbReseller {
  id: number;
  user_id: number;
  bot_token: string | null;
  bot_username: string | null;
  bot_name: string | null;
  margin_pct: number;
  margin_type: "PCT" | "AMOUNT";
  margin_amount: number;
  cs_contact: string | null;
  status: "PENDING" | "ACTIVE" | "STOPPED";
  saldo_margin: number;
  payment_method: string | null;
  payment_info: string | null;
  created_at: string;
}

export async function getResellerByTelegram(telegramId: number): Promise<DbReseller | null> {
  return q1<DbReseller>(
    `SELECT r.* FROM tb_resellers r
     JOIN tb_users u ON u.id = r.user_id
     WHERE u.telegram_id = ?`,
    [telegramId]
  );
}

export async function upsertResellerToken(
  userId: number,
  token: string,
  username: string,
  name: string
): Promise<void> {
  await qExec(
    `INSERT INTO tb_resellers (user_id, bot_token, bot_username, bot_name)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       bot_token = VALUES(bot_token),
       bot_username = VALUES(bot_username),
       bot_name = VALUES(bot_name)`,
    [userId, token, username, name]
  );
}

export async function getResellerByUserId(userId: number): Promise<DbReseller | null> {
  return q1<DbReseller>("SELECT * FROM tb_resellers WHERE user_id = ?", [userId]);
}

export async function updateResellerCs(telegramId: number, contact: string): Promise<void> {
  await qExec(
    `UPDATE tb_resellers r JOIN tb_users u ON u.id = r.user_id
     SET r.cs_contact = ?,
         r.status = IF(r.status = 'PENDING', 'ACTIVE', r.status)
     WHERE u.telegram_id = ?`,
    [contact, telegramId]
  );
}

export async function updateResellerMargin(
  telegramId: number,
  type: "PCT" | "AMOUNT",
  value: number
): Promise<void> {
  if (type === "PCT") {
    await qExec(
      `UPDATE tb_resellers r JOIN tb_users u ON u.id = r.user_id
       SET r.margin_type = 'PCT', r.margin_pct = ?
       WHERE u.telegram_id = ?`,
      [value, telegramId]
    );
  } else {
    await qExec(
      `UPDATE tb_resellers r JOIN tb_users u ON u.id = r.user_id
       SET r.margin_type = 'AMOUNT', r.margin_amount = ?
       WHERE u.telegram_id = ?`,
      [value, telegramId]
    );
  }
}

export async function setResellerStatus(
  telegramId: number,
  status: "ACTIVE" | "STOPPED"
): Promise<void> {
  await qExec(
    `UPDATE tb_resellers r JOIN tb_users u ON u.id = r.user_id
     SET r.status = ?,
         r.restart_at = IF(? = 'ACTIVE', NOW(), r.restart_at)
     WHERE u.telegram_id = ?`,
    [status, status, telegramId]
  );
}

export async function updateResellerPayment(
  telegramId: number,
  method: string,
  info: string
): Promise<void> {
  await qExec(
    `UPDATE tb_resellers r JOIN tb_users u ON u.id = r.user_id
     SET r.payment_method = ?, r.payment_info = ?
     WHERE u.telegram_id = ?`,
    [method, info, telegramId]
  );
}

export async function deductResellerMargin(
  resellerId: number,
  amount: number
): Promise<{ ok: boolean }> {
  const r = await qExec(
    "UPDATE tb_resellers SET saldo_margin = saldo_margin - ? WHERE id = ? AND saldo_margin >= ?",
    [amount, resellerId, amount]
  );
  return { ok: r.affectedRows > 0 };
}

export async function creditOrderMargin(
  orderId: number,
  ownerUserId: number,
  amount: number
): Promise<void> {
  if (amount <= 0) return;
  const r = await qExec(
    `UPDATE tb_orders SET margin_credited = 1
     WHERE id = ? AND owner_id = ? AND margin_credited = 0 AND price_reseller IS NOT NULL`,
    [orderId, ownerUserId]
  );
  if (r.affectedRows === 0) return;
  try {
    await qExec("UPDATE tb_resellers SET saldo_margin = saldo_margin + ? WHERE user_id = ?", [
      amount,
      ownerUserId,
    ]);
  } catch (e) {
    await qExec("UPDATE tb_orders SET margin_credited = 0 WHERE id = ?", [orderId]).catch(() => {});
    throw e;
  }
}

export async function listResellersWithToken(): Promise<
  Array<{
    reseller_owner_id: number;
    reseller_bot_username: string | null;
    reseller_bot_name: string | null;
    reseller_bot_token: string;
    status: string;
    restart_at: string | null;
  }>
> {
  return q(
    `SELECT user_id AS reseller_owner_id,
            bot_username AS reseller_bot_username,
            bot_name AS reseller_bot_name,
            bot_token AS reseller_bot_token,
            status,
            restart_at
     FROM tb_resellers
     WHERE bot_token IS NOT NULL AND bot_token <> ''`
  );
}
