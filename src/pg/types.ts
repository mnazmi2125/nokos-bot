export type PgStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED";

export interface PgInvoice {
  /** ID untuk polling status (disimpan ke tb_deposits.external_id) */
  ref: string;
  /** Order ID yang ditampilkan ke user (mis. DEP-XXXX) */
  displayRef: string;
  /** Halaman pembayaran */
  link: string;
  /** URL gambar QR dari provider (opsional) */
  qrImageUrl?: string;
  /** Payload QRIS mentah — dirender lokal jadi gambar QR (opsional) */
  qrString?: string;
  amount: number;
  expiresAt: Date;
}

export interface PgCreateOpts {
  displayRef: string;
  amount: number;
  telegramId: number;
  customerName: string;
  description: string;
  expiresInMin?: number;
}

export interface PgAdapter {
  readonly name: string;
  /** null = terkonfigurasi, selain itu pesan untuk user */
  configError(): string | null;
  createInvoice(opts: PgCreateOpts): Promise<PgInvoice>;
  getStatus(ref: string): Promise<PgStatus>;
}

export const DEPOSIT_EXPIRE_MIN = 15;
