import type { PgAdapter, PgCreateOpts, PgInvoice, PgStatus } from "./types.js";
import { DEPOSIT_EXPIRE_MIN } from "./types.js";

interface MayarEnvelope<T> {
  statusCode: number;
  messages?: string;
  message?: string;
  data?: T;
}

function cfg(): { apiKey: string; base: string } | null {
  const apiKey = process.env.MAYAR_API_KEY;
  if (!apiKey) return null;
  const base =
    process.env.MAYAR_SANDBOX === "1"
      ? "https://api.mayar.io/hl/v2"
      : "https://api.mayar.id/hl/v2";
  return { apiKey, base };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const c = cfg();
  if (!c) throw new Error("MAYAR_API_KEY belum diisi di .env");
  const res = await fetch(`${c.base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as MayarEnvelope<T> | null;
  if (!json) throw new Error(`Mayar HTTP ${res.status}`);
  if (json.statusCode >= 400 || res.status >= 400)
    throw new Error(json.messages ?? json.message ?? `Mayar HTTP ${res.status}`);
  if (json.data === undefined) throw new Error("Mayar response tanpa data");
  return json.data;
}

function pickQr(node: unknown, depth = 0): string | undefined {
  if (!node || depth > 4) return undefined;
  if (typeof node === "string") return node.startsWith("000201") ? node : undefined;
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = pickQr(v, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const v of Object.values(obj)) {
      const found = pickQr(v, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

interface CreatePaymentResp {
  id: string;
  transactionId?: string;
  link?: string;
  [k: string]: unknown;
}

interface PaymentDetail {
  id: string;
  status?: string;
  linkUrl?: string;
  linkPayment?: string;
  transactions?: unknown[];
  [k: string]: unknown;
}

export class MayarAdapter implements PgAdapter {
  readonly name = "mayar";

  configError(): string | null {
    return cfg() ? null : "Deposit belum dikonfigurasi — hubungi admin";
  }

  async createInvoice(opts: PgCreateOpts): Promise<PgInvoice> {
    const expiresAt = new Date(Date.now() + (opts.expiresInMin ?? DEPOSIT_EXPIRE_MIN) * 60_000);
    const created = await call<CreatePaymentResp>("/payments/create", {
      method: "POST",
      body: JSON.stringify({
        name: opts.displayRef,
        description: opts.description,
        amount: opts.amount,
        email: `${opts.telegramId}@nokos.bot`,
        paymentMethod: "qris",
        expiredAt: expiresAt.toISOString(),
      }),
    });

    if (!created.id) throw new Error("Mayar tidak mengembalikan ID pembayaran");

    const detail = await call<PaymentDetail>(`/payments/${created.id}`).catch(() => null);
    const qrString = pickQr(detail) ?? pickQr(created);
    const link = detail?.linkUrl ?? detail?.linkPayment ?? created.link ?? "";

    return {
      ref: created.id,
      displayRef: opts.displayRef,
      link,
      qrString,
      amount: opts.amount,
      expiresAt,
    };
  }

  async getStatus(ref: string): Promise<PgStatus> {
    const d = await call<PaymentDetail>(`/payments/${ref}`);
    if (d.status === "paid") return "PAID";
    if (d.status === "closed") return "EXPIRED";
    return "PENDING";
  }
}
