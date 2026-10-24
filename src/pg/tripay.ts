import type { PgAdapter, PgCreateOpts, PgInvoice, PgStatus } from "./types.js";
import { DEPOSIT_EXPIRE_MIN } from "./types.js";
import { createQrisInvoice, getTransaction } from "../providers/tripay.js";

function missing(): string | null {
  if (!process.env.TRIPAY_API_KEY || !process.env.TRIPAY_PRIVATE_KEY || !process.env.TRIPAY_MERCHANT_CODE)
    return "Deposit (Tripay) belum dikonfigurasi — hubungi admin";
  return null;
}

export class TripayAdapter implements PgAdapter {
  readonly name = "tripay";

  configError(): string | null {
    return missing();
  }

  async createInvoice(opts: PgCreateOpts): Promise<PgInvoice> {
    const inv = await createQrisInvoice({
      merchantRef: opts.displayRef,
      amount: opts.amount,
      customerName: opts.customerName,
      telegramId: opts.telegramId,
      expiresInMin: opts.expiresInMin ?? DEPOSIT_EXPIRE_MIN,
    });
    return {
      ref: inv.merchant_ref,
      displayRef: inv.merchant_ref,
      link: inv.checkout_url,
      qrImageUrl: inv.qr_code,
      qrString: inv.qr_string,
      amount: inv.total_including_fee || opts.amount,
      expiresAt: new Date(inv.expired_time * 1000),
    };
  }

  async getStatus(ref: string): Promise<PgStatus> {
    const t = await getTransaction(ref);
    switch (t.status) {
      case "PAID":
        return "PAID";
      case "EXPIRED":
        return "EXPIRED";
      case "FAILED":
      case "REFUND":
        return "FAILED";
      default:
        return "PENDING";
    }
  }
}
