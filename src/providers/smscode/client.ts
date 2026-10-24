const BASE = "https://api.smscode.gg/v1";

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; count: number };
  error?: { code?: string; message?: string };
}

export async function smscodeRequest<T>(
  path: string
): Promise<{ data: T; meta?: { page: number; limit: number; count: number } }> {
  const token = process.env.SMSCODE_API_KEY;
  if (!token) throw new Error("SMSCODE_API_KEY belum diisi di .env");
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as Envelope<T>;
  if (!json.success) {
    const err = new Error(json.error?.message ?? `HTTP ${res.status}`) as Error & {
      code?: string;
    };
    err.code = json.error?.code;
    throw err;
  }
  return { data: json.data, meta: json.meta };
}

export async function smscodeGet<T>(path: string): Promise<T> {
  return (await smscodeRequest<T>(path)).data;
}

export async function smscodePost<T>(
  path: string,
  body: unknown,
  idempotencyKey?: string
): Promise<T> {
  const token = process.env.SMSCODE_API_KEY;
  if (!token) throw new Error("SMSCODE_API_KEY belum diisi di .env");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Envelope<T>;
  if (!json.success) {
    const err = new Error(json.error?.message ?? `HTTP ${res.status}`) as Error & {
      code?: string;
    };
    err.code = json.error?.code;
    throw err;
  }
  return json.data;
}
