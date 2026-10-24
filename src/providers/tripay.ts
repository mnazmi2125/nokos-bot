import crypto from "crypto";

function cfg() {
  const apiKey = process.env.TRIPAY_API_KEY;
  const privateKey = process.env.TRIPAY_PRIVATE_KEY;
  const merchantCode = process.env.TRIPAY_MERCHANT_CODE;
  if (!apiKey || !privateKey || !merchantCode)
    throw new Error("TRIPAY_API_KEY / TRIPAY_PRIVATE_KEY / TRIPAY_MERCHANT_CODE belum diisi di .env");
  const base =
    process.env.TRIPAY_SANDBOX === "1"
      ? "https://tripay.co.id/api-sandbox"
      : "https://tripay.co.id/api";
  return { apiKey, privateKey, merchantCode, base };
}

function hmac(data: string, key: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

interface TripayResp<T> {
  success: boolean;
  data?: T;
  message?: string;
}

async function postForm<T>(path: string, form: Record<string, string>, apiKey: string, base: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json()) as TripayResp<T>;
  if (!json.success) throw new Error(json.message ?? `Tripay HTTP ${res.status}`);
  return json.data as T;
}

export interface QrisInvoice {
  reference: string;
  merchant_ref: string;
  qr_code: string;
  qr_string: string;
  checkout_url: string;
  status: string;
  total_including_fee: number;
  expired_time: number;
}

export async function createQrisInvoice(opts: {
  merchantRef: string;
  amount: number;
  customerName: string;
  telegramId: number;
  expiresInMin?: number;
}): Promise<QrisInvoice> {
  const { apiKey, privateKey, merchantCode, base } = cfg();
  const { merchantRef, amount } = opts;
  const signature = hmac(`${merchantCode}${merchantRef}${amount}`, privateKey);
  const expires = Math.floor(Date.now() / 1000) + (opts.expiresInMin ?? 15) * 60;
  const form: Record<string, string> = {
    method: "QRIS",
    merchant_ref: merchantRef,
    amount: String(amount),
    customer_name: opts.customerName.slice(0, 60),
    customer_email: `${opts.telegramId}@nokos.bot`,
    "order_items[0][name]": "Saldo Deposit Nokos",
    "order_items[0][price]": String(amount),
    "order_items[0][quantity]": "1",
    expired_time: String(expires),
    signature,
  };
  return postForm<QrisInvoice>("/transaction/create", form, apiKey, base);
}

export interface TripayDetail {
  reference: string;
  merchant_ref: string;
  status: "UNPAID" | "PAID" | "EXPIRED" | "FAILED" | "REFUND" | string;
  amount: number;
  total_including_fee: number;
  paid_at?: string | null;
}

export async function getTransaction(merchantRef: string): Promise<TripayDetail> {
  const { apiKey, privateKey, merchantCode, base } = cfg();
  const signature = hmac(`${merchantCode}${merchantRef}`, privateKey);
  const form: Record<string, string> = { merchant_ref: merchantRef, signature };
  return postForm<TripayDetail>("/transaction/detail", form, apiKey, base);
}
