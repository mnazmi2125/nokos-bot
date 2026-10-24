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

export function calcPrice(modal: number, serverId = "server1"): PriceResult {
  const tiers = TIERS[serverId] ?? TIERS.server1;
  const tier: Tier =
    tiers.find((t) => modal >= t.min && (t.max === null || modal <= t.max)) ??
    tiers[tiers.length - 1];
  let sell = Math.round(modal * tier.multiplier);
  if (tier.minProfit) sell = Math.max(sell, modal + tier.minProfit);
  sell = roundPsych(sell);
  return { modal, sell, tier: tier.name, multiplier: tier.multiplier, profit: sell - modal };
}
