import { q } from "./db/index.js";
import { TIERS, Tier } from "./config/tiers.js";

export interface PriceResult {
  modal: number;
  sell: number;
  tier: string;
  multiplier: number;
  profit: number;
}

function roundPsych(n: number): number {
  if (n < 1_000) return Math.ceil(n / 10) * 10;
  if (n < 10_000) return Math.ceil(n / 50) * 50;
  if (n < 100_000) return Math.ceil(n / 100) * 100;
  if (n < 1_000_000) return Math.ceil(n / 500) * 500;
  return Math.ceil(n / 1_000) * 1_000;
}

// Tier harga diambil dari tb_price_tiers (bisa diedit dari panel) — cache 60 detik.
// Kalau DB kosong/error → fallback ke hardcode src/config/tiers.ts.
let tierCache: { at: number; serverId: string; tiers: Tier[] } | null = null;

export async function loadTiers(serverId = "server1"): Promise<Tier[]> {
  if (tierCache && tierCache.serverId === serverId && Date.now() - tierCache.at < 60_000) {
    return tierCache.tiers;
  }
  try {
    const rows = await q<{
      name: string;
      min_price: string | number;
      max_price: string | number | null;
      multiplier: string | number;
      min_profit: string | number;
    }>(
      `SELECT name, min_price, max_price, multiplier, min_profit
       FROM tb_price_tiers WHERE server = ? AND active = 1
       ORDER BY min_price ASC`,
      [serverId]
    );
    if (rows.length > 0) {
      const tiers: Tier[] = rows.map((r) => ({
        name: r.name,
        min: Number(r.min_price),
        max: r.max_price == null ? null : Number(r.max_price),
        multiplier: Number(r.multiplier),
        minProfit: Number(r.min_profit) || undefined,
      }));
      tierCache = { at: Date.now(), serverId, tiers };
      return tiers;
    }
  } catch {
    // DB tidak tersedia → pakai hardcode
  }
  return TIERS[serverId] ?? TIERS.server1;
}

/** Harga jual. `tiers` diambil dari loadTiers() (sekali per render, bukan per produk). */
export function calcPrice(modal: number, tiers: Tier[]): PriceResult {
  const tier: Tier =
    tiers.find((t) => modal >= t.min && (t.max === null || modal <= t.max)) ??
    tiers[tiers.length - 1];
  let sell = Math.round(modal * tier.multiplier);
  if (tier.minProfit) sell = Math.max(sell, modal + tier.minProfit);
  sell = roundPsych(sell);
  return { modal, sell, tier: tier.name, multiplier: tier.multiplier, profit: sell - modal };
}
