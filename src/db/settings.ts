import { q1, qExec } from "./index.js";

export async function getSetting(key: string): Promise<string | null> {
  const r = await q1<{ value: string | null }>("SELECT `value` FROM tb_settings WHERE `key` = ?", [
    key,
  ]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await qExec(
    "INSERT INTO tb_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [key, value]
  );
}
