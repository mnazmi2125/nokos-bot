import "dotenv/config";
import { spawn, type ChildProcess } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { listResellersWithToken } from "./db/resellers.js";
import { setSetting } from "./db/settings.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface ResellerRow {
  reseller_owner_id: number;
  reseller_bot_username: string | null;
  reseller_bot_token: string;
  status: string;
  restart_at: string | null;
}

const SYNC_MS = 15_000;
const children = new Map<string, { child: ChildProcess; owner: number }>();
const seenRestart = new Map<string, string>();
let stopping = false;

function startChild(row: ResellerRow): void {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOT_TOKEN: row.reseller_bot_token,
      RESELLER_MODE: "1",
      RESELLER_OWNER_ID: String(row.reseller_owner_id),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `[rs:@${row.reseller_bot_username ?? row.reseller_owner_id}]`;
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(`${tag} ${d}`));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(`${tag} ${d}`));
  child.on("exit", (code, signal) => {
    children.delete(row.reseller_bot_token);
    if (!stopping) {
      console.log(`${tag} berhenti (code=${code} signal=${signal}) → cek ulang DB dalam 10s`);
      setTimeout(() => void sync(), 10_000);
    }
  });
  children.set(row.reseller_bot_token, { child, owner: row.reseller_owner_id });
  console.log(`${tag} start (owner_id=${row.reseller_owner_id})`);
}

async function sync(): Promise<void> {
  if (stopping) return;
  let rows: ResellerRow[] = [];
  try {
    rows = await listResellersWithToken();
  } catch (e) {
    console.error("[rs] sync DB gagal:", (e as Error).message);
    return;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const token = row.reseller_bot_token;
    const entry = children.get(token);
    if (row.status === "STOPPED") {
      if (entry) {
        console.log(`[rs] owner_id=${row.reseller_owner_id} STOPPED → hentikan bot`);
        children.delete(token);
        entry.child.kill();
      }
      continue;
    }
    seen.add(token);
    if (row.restart_at) {
      const prev = seenRestart.get(token);
      if (prev === undefined) {
        seenRestart.set(token, row.restart_at);
      } else if (prev !== row.restart_at) {
        seenRestart.set(token, row.restart_at);
        if (entry) {
          console.log(`[rs] owner_id=${row.reseller_owner_id} restart diminta → restart bot`);
          children.delete(token);
          entry.child.kill();
          setTimeout(() => void sync(), 1_000);
          continue;
        }
      }
    }
    if (!children.has(token)) startChild(row);
  }
  for (const [token, entry] of children) {
    if (!seen.has(token)) {
      console.log(`[rs] token dihapus/hilang owner_id=${entry.owner} → hentikan bot`);
      children.delete(token);
      entry.child.kill();
    }
  }
  try {
    await setSetting(
      "reseller_orchestrator",
      JSON.stringify({ at: new Date().toISOString(), bots: children.size })
    );
  } catch (e) {
    console.error("[rs] tulis heartbeat gagal:", (e as Error).message);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("[rs] DATABASE_URL kosong — orchestrator berhenti");
    process.exit(1);
  }
  await sync();
  setInterval(() => void sync(), SYNC_MS);
}

function shutdown(): void {
  if (stopping) return;
  stopping = true;
  console.log("[rs] berhenti, mematikan semua bot reseller...");
  for (const { child } of children.values()) child.kill();
  setTimeout(() => process.exit(0), 1_500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void main();
