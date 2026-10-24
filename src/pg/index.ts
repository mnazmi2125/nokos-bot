import type { PgAdapter } from "./types.js";
import { MayarAdapter } from "./mayar.js";
import { TripayAdapter } from "./tripay.js";

const registry: Record<string, () => PgAdapter> = {
  mayar: () => new MayarAdapter(),
  tripay: () => new TripayAdapter(),
};

export function getPgAdapter(): PgAdapter {
  const name = (process.env.PG_PROVIDER ?? "mayar").toLowerCase();
  const make = registry[name];
  if (!make) throw new Error(`PG_PROVIDER "${name}" tidak dikenal (tersedia: ${Object.keys(registry).join(", ")})`);
  return make();
}

export * from "./types.js";
