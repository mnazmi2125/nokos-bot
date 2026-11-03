import { smscodeGet, smscodeRequest } from "./client.js";
import { ttlCache } from "../../cache.js";

const MIN = 60_000;
const opsCache = ttlCache<SmsOperator[]>(10 * MIN);
const balanceCache = ttlCache<{ currency: string; balance: number }>(1 * MIN);

export interface SmsService {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export interface SmsCountry {
  id: number;
  code: string;
  name: string;
  dial_code: string;
  emoji: string;
  active: boolean;
}

export interface SmsProduct {
  id: number;
  name: string;
  country_id: number;
  platform_id: number;
  catalog_product_id: number;
  operator_id: number | null;
  operator_name: string | null;
  available: number;
  price: number;
  active: boolean;
}

export async function getServices(countryId?: number): Promise<SmsService[]> {
  const q = countryId ? `?country_id=${countryId}` : "";
  return smscodeGet<SmsService[]>(`/catalog/services${q}`);
}

export async function getCountries(): Promise<SmsCountry[]> {
  return smscodeGet<SmsCountry[]>(`/catalog/countries`);
}

export async function getProducts(platformId: number): Promise<SmsProduct[]> {
  const all: SmsProduct[] = [];
  let page = 1;
  for (;;) {
    const { data, meta } = await smscodeRequest<SmsProduct[]>(
      `/catalog/products?platform_id=${platformId}&limit=10000&page=${page}`
    );
    all.push(...data);
    if (!meta || data.length === 0 || all.length >= meta.count) break;
    page += 1;
  }
  return all;
}

export function filterProducts(
  products: SmsProduct[],
  countryId: number,
  operatorId?: number | null
): SmsProduct[] {
  return products.filter(
    (p) =>
      p.country_id === countryId &&
      (operatorId == null || p.operator_id === operatorId)
  );
}

export interface SmsOperator {
  operator_id: number | null;
  code: string;
  name: string;
  local_name: string | null;
}

export function getOperators(
  countryId: number,
  platformId: number
): Promise<SmsOperator[]> {
  return opsCache(`${countryId}:${platformId}`, () =>
    smscodeGet<SmsOperator[]>(
      `/catalog/operators?country_id=${countryId}&platform_id=${platformId}`
    )
  );
}

export function getProviderBalance(): Promise<{ currency: string; balance: number }> {
  return balanceCache("bal", () => smscodeGet<{ currency: string; balance: number }>(`/balance`));
}
