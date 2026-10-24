export interface Tier {
  name: string;
  min: number;
  max: number | null;
  multiplier: number;
  minProfit?: number;
}

export const TIERS: Record<string, Tier[]> = {
  server1: [
    { name: "Mikro", min: 1, max: 500, multiplier: 3.7, minProfit: 750 },
    { name: "Recehan", min: 501, max: 2000, multiplier: 1.6, minProfit: 750 },
    { name: "Rendah", min: 2001, max: 5000, multiplier: 1.4 },
    { name: "Menengah", min: 5001, max: 15000, multiplier: 1.25 },
    { name: "Mahal", min: 15001, max: 50000, multiplier: 1.2 },
    { name: "Premium", min: 50001, max: 150000, multiplier: 1.1 },
    { name: "Ultra", min: 150001, max: null, multiplier: 1.06 },
  ],
};
