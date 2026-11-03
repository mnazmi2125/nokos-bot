import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { dbQuery, q1 } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVER1_TIERS = [
  { name: "Mikro", min: 1, max: 500, mult: 3.7, minProfit: 750 },
  { name: "Recehan", min: 501, max: 2000, mult: 1.6, minProfit: 750 },
  { name: "Rendah", min: 2001, max: 5000, mult: 1.4, minProfit: 0 },
  { name: "Menengah", min: 5001, max: 15000, mult: 1.25, minProfit: 0 },
  { name: "Mahal", min: 15001, max: 50000, mult: 1.2, minProfit: 0 },
  { name: "Premium", min: 50001, max: 150000, mult: 1.1, minProfit: 0 },
  { name: "Ultra", min: 150001, max: null, mult: 1.06, minProfit: 0 },
];

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(__dirname, "../../db/schema.sql"), "utf-8");
  const stmts = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    await dbQuery(stmt);
  }
  for (const t of SERVER1_TIERS) {
    await dbQuery(
      `INSERT INTO tb_price_tiers (server, name, min_price, max_price, multiplier, min_profit)
       SELECT * FROM (SELECT 'server1', ?, ?, ?, ?, ?) AS tmp
       WHERE NOT EXISTS (
         SELECT 1 FROM tb_price_tiers WHERE server='server1' AND min_price=?
       )`,
      [t.name, t.min, t.max, t.mult, t.minProfit, t.min]
    );
  }
  const alters = [
    "ALTER TABLE tb_orders ADD COLUMN chat_id BIGINT NULL AFTER phone_number",
    "ALTER TABLE tb_orders ADD COLUMN message_id BIGINT NULL AFTER chat_id",
    "ALTER TABLE tb_deposits ADD COLUMN unique_code INT NOT NULL DEFAULT 0 AFTER amount",
    "ALTER TABLE tb_deposits ADD COLUMN chat_id BIGINT NULL AFTER status",
    "ALTER TABLE tb_deposits ADD COLUMN message_id BIGINT NULL AFTER chat_id",
    "ALTER TABLE tb_orders ADD COLUMN owner_id BIGINT NULL AFTER server",
    "ALTER TABLE tb_deposits ADD COLUMN owner_id BIGINT NULL AFTER user_id",
    "ALTER TABLE tb_orders ADD COLUMN price_reseller BIGINT NULL AFTER price_sell",
    "ALTER TABLE tb_orders ADD COLUMN margin_credited TINYINT(1) NOT NULL DEFAULT 0 AFTER price_reseller",
    "ALTER TABLE tb_resellers ADD COLUMN restart_at DATETIME NULL AFTER status",
    "ALTER TABLE tb_resellers ADD COLUMN margin_type ENUM('PCT','AMOUNT') NOT NULL DEFAULT 'PCT' AFTER margin_pct",
    "ALTER TABLE tb_resellers ADD COLUMN margin_amount BIGINT NOT NULL DEFAULT 0 AFTER margin_type",
    "ALTER TABLE tb_deposits ADD COLUMN matched_tx_id VARCHAR(64) NULL AFTER message_id",
    "ALTER TABLE tb_deposits ADD UNIQUE KEY uq_deposits_matched_tx (matched_tx_id)",
  ];
  for (const a of alters) {
    try {
      await dbQuery(a);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // Toleransi "sudah ada": kolom ganda (1060), nama key ganda (1061), indeks ganda
      const dup = ["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_DUP_KEY", "ER_DUP_INDEX"];
      if (!dup.includes(code ?? "")) throw e;
    }
  }

  // Legacy: kolom reseller lama di tb_users → pindah ke tb_resellers lalu buang
  const legacyCol = await q1<{ c: number }>(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'reseller_bot_token'"
  );
  if (legacyCol && legacyCol.c > 0) {
    try {
      await dbQuery(
        `INSERT IGNORE INTO tb_resellers (user_id, bot_token, bot_username, bot_name)
         SELECT id, reseller_bot_token, reseller_bot_username, reseller_bot_name
         FROM tb_users WHERE reseller_bot_token IS NOT NULL`
      );
    } catch (e) {
      console.warn("[db] salin data reseller legacy dilewati:", (e as Error).message);
    }
    for (const col of ["reseller_bot_token", "reseller_bot_username", "reseller_bot_name"]) {
      try {
        await dbQuery(`ALTER TABLE tb_users DROP COLUMN ${col}`);
      } catch (e) {
        if ((e as { code?: string }).code !== "ER_CANT_DROP_FIELD_OR_KEY") throw e;
      }
    }
    console.log("[db] data reseller dipindah ke tb_resellers");
  }

  console.log("[db] migrate OK");
}
