import mysql, { Pool, ResultSetHeader } from "mysql2/promise";

let pool: Pool | null = null;

function friendlyDbError(e: unknown): Error {
  const err = e as {
    message?: string;
    code?: string;
    errors?: { message?: string; code?: string }[];
  };
  let msg = err?.message ?? "";
  let code = err?.code;
  if (err?.errors?.length) {
    code = err.errors[0].code ?? code;
    msg = `${code ?? "DB_ERROR"} ${err.errors[0].message ?? ""}`.trim();
  } else if (!msg && code) {
    msg = `${code}: koneksi database gagal`;
  }
  const fe = new Error(msg || "database error");
  if (code) (fe as Error & { code?: string }).code = code;
  return fe;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw friendlyDbError(e);
  }
}

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum diisi di .env");
    pool = mysql.createPool({
      uri: url,
      connectionLimit: 10,
      waitForConnections: true,
      dateStrings: true,
    });
  }
  return pool;
}

export async function q<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  return run(async () => {
    const [rows] = await getPool().execute(sql, params as never);
    return rows as T[];
  });
}

export async function q1<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function qExec(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  return run(async () => {
    const [res] = await getPool().execute(sql, params as never);
    return res as ResultSetHeader;
  });
}

export async function dbQuery(sql: string, params: unknown[] = []): Promise<unknown> {
  return run(() => getPool().query(sql, params as never));
}
