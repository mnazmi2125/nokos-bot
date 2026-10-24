import { smscodePost, smscodeRequest } from "./client.js";

export interface ProviderOrder {
  id: number;
  status: "ACTIVE" | "OTP_RECEIVED" | "COMPLETED" | "CANCELED" | "EXPIRED";
  product_id: number;
  catalog_product_id: number;
  amount: number;
  phone_number: string | null;
  otp_code: string | null;
  otp_message?: string | null;
  otp_received_at: string | null;
  expires_at: string | null;
  failed_reason: string | null;
  operator_id: number | null;
  operator_name: string | null;
}

interface CreateResult {
  orders: ProviderOrder[];
  failed_count: number;
}

export async function createOrder(
  productId: number,
  quantity: number,
  idempotencyKey: string
): Promise<{ orders: ProviderOrder[]; failedCount: number }> {
  const data = await smscodePost<CreateResult>(
    "/orders/create",
    { product_id: productId, quantity },
    idempotencyKey
  );
  return { orders: data.orders ?? [], failedCount: data.failed_count ?? 0 };
}

export async function cancelOrder(id: number): Promise<{ refund: number }> {
  const data = await smscodePost<{ refund_amount: number }>("/orders/cancel", { id });
  return { refund: data.refund_amount ?? 0 };
}

export async function finishOrder(id: number): Promise<void> {
  await smscodePost("/orders/finish", { id });
}

export async function getOrder(id: number): Promise<ProviderOrder> {
  const { data } = await smscodeRequest<ProviderOrder>(`/orders/${id}`);
  return data;
}
