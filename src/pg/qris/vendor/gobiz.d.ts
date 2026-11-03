// Deklarasi tipe untuk gobiz.js (di-vendor dari github.com/kavionn/gobiz-payment, MIT).

export interface GopayHistoryItem {
  type: string;
  amount: { displayed_text: string };
  time: string;
  raw: Record<string, unknown> & {
    id?: string;
    transaction_status?: string;
    payment_type?: string;
    transaction_time?: string;
    gross_amount?: number;
    order_id?: string;
  };
}

declare class GoPayMerchant {
  constructor(options?: {
    token?: string | null;
    merchantId?: string | null;
    loginMethod?: "otp" | "password" | null;
    phone?: string | null;
    otpCallback?: ((phoneNumber: string) => Promise<string>) | null;
  });
  token: string | null;
  merchantId: string | null;
  init(): Promise<void>;
  getHistory(opts?: { days?: number; size?: number }): Promise<{
    status: boolean;
    message?: string;
    data?: { histories: GopayHistoryItem[] };
  }>;
}

export default GoPayMerchant;
