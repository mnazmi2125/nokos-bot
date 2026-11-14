import "dotenv/config";

import express from "express";
import session from "express-session";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PANEL_PORT || 3001;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diisi di .env");
if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) throw new Error("ADMIN_USER/ADMIN_PASS belum diisi di .env");
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET belum diisi di .env");

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 10, waitForConnections: true, dateStrings: true });
app.use(express.json());
app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); }); // cegah browser memuat file versi lama
app.use(express.static(join(__dirname, "public")));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 } }));

async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; }
function requireAuth(req, res, next) { if (!req.session.user) return res.status(401).json({ error: "unauthorized" }); next(); }
function rupiah(n) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(n) || 0); }

app.post("/api/login", (req, res) => {
  const { user, pass } = req.body || {};
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) { req.session.user = { username: user, role: "admin" }; return res.json({ ok: true }); }
  res.status(401).json({ error: "kredensial salah" });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));

app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const [tu] = await query("SELECT COUNT(*) AS c FROM tb_users");
    const [to] = await query("SELECT COUNT(*) AS c FROM tb_orders");
    const [po] = await query("SELECT COUNT(*) AS c FROM tb_orders WHERE status='PENDING'");
    const [td] = await query("SELECT COALESCE(SUM(amount),0) AS total FROM tb_deposits WHERE status='PAID'");
    const [pd] = await query("SELECT COUNT(*) AS c FROM tb_deposits WHERE status='PENDING'");
    const [wdc] = await query("SELECT COUNT(*) AS c FROM tb_withdrawals WHERE status='PENDING'");
    const [wd] = await query("SELECT COALESCE(SUM(amount),0) AS total FROM tb_withdrawals WHERE status='APPROVED'");
    const recent = await query(`SELECT o.id,o.service_name,o.country_name,o.price_sell,o.status,o.created_at,u.username,u.telegram_id FROM tb_orders o JOIN tb_users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 8`);
    res.json({ totalUsers: tu.c, totalOrders: to.c, pendingOrders: po.c, totalDeposit: td.total, pendingDeposit: pd.c, pendingWD: wdc.c, totalWD: wd.total, recent: recent.map(r => ({ ...r, price_sell: rupiah(r.price_sell) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const { q: s = "", limit = 20, offset = 0 } = req.query;
    const p = [];
    let cond = "";
    if (s) {
      cond = " WHERE u.username LIKE ? OR u.first_name LIKE ? OR u.telegram_id LIKE ? OR u.id = ?";
      p.push(`%${s}%`, `%${s}%`, `%${s}%`, Number(s) || 0);
    }
    const [cnt] = await query(`SELECT COUNT(*) AS c FROM tb_users u${cond}`, p);
    const rows = await query(
      `SELECT u.id,u.telegram_id,u.username,u.first_name,u.balance,u.is_banned,u.referral_code,u.created_at FROM tb_users u${cond} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...p, parseInt(limit), parseInt(offset)]
    );
    res.json({ total: cnt.c, items: rows.map(u => ({ ...u, balance: rupiah(u.balance), raw_balance: u.balance })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/users/:id/ban", requireAuth, async (req, res) => {
  try { await query("UPDATE tb_users SET is_banned=? WHERE id=?", [req.body.is_banned ? 1 : 0, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/users/:id/balance", requireAuth, async (req, res) => {
  try {
    const { balance } = req.body;
    if (balance === undefined || balance === "" || isNaN(balance)) {
      return res.status(400).json({ error: "balance harus berupa angka" });
    }
    await query("UPDATE tb_users SET balance=? WHERE id=?", [parseInt(balance), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/resellers", requireAuth, async (req, res) => {
  try {
    const { q: s = "", limit = 20, offset = 0 } = req.query;
    const p = [];
    let cond = "";
    if (s) { cond = " WHERE r.bot_username LIKE ?"; p.push(`%${s}%`); }
    const [cnt] = await query(`SELECT COUNT(*) AS c FROM tb_resellers r${cond}`, p);
    const rows = await query(
      `SELECT r.id,r.user_id,r.bot_token,r.bot_username,r.bot_name,r.margin_pct,r.margin_type,r.margin_amount,r.cs_contact,r.status,r.saldo_margin,r.created_at,u.username
       FROM tb_resellers r JOIN tb_users u ON u.id=r.user_id${cond} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...p, parseInt(limit), parseInt(offset)]
    );
    res.json({
      total: cnt.c,
      items: rows.map(r => ({
        ...r,
        saldo_margin: rupiah(r.saldo_margin),
        margin_amount: rupiah(r.margin_amount),
        raw_saldo_margin: r.saldo_margin,
        raw_margin_amount: r.margin_amount,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/resellers/:id/status", requireAuth, async (req, res) => {
  try { await query("UPDATE tb_resellers SET status=? WHERE id=?", [req.body.status, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Edit reseller: bot token, margin, saldo margin, contact CS
app.patch("/api/resellers/:id", requireAuth, async (req, res) => {
  try {
    const b = req.body;
    const sets = [], p = [];
    if (b.bot_token !== undefined) { sets.push("bot_token=?"); p.push(String(b.bot_token).trim() || null); }
    if (b.margin_pct !== undefined) { const v = parseInt(b.margin_pct); if (isNaN(v) || v < 0) return res.status(400).json({ error: "margin_pct tidak valid" }); sets.push("margin_pct=?"); p.push(v); }
    if (b.margin_type !== undefined) {
      if (!["PCT", "AMOUNT"].includes(b.margin_type)) return res.status(400).json({ error: "margin_type harus PCT/AMOUNT" });
      sets.push("margin_type=?"); p.push(b.margin_type);
    }
    if (b.margin_amount !== undefined) { const v = parseInt(b.margin_amount); if (isNaN(v) || v < 0) return res.status(400).json({ error: "margin_amount tidak valid" }); sets.push("margin_amount=?"); p.push(v); }
    if (b.saldo_margin !== undefined) { const v = parseInt(b.saldo_margin); if (isNaN(v) || v < 0) return res.status(400).json({ error: "saldo_margin tidak valid" }); sets.push("saldo_margin=?"); p.push(v); }
    if (b.cs_contact !== undefined) { sets.push("cs_contact=?"); p.push(String(b.cs_contact).trim() || null); }
    if (!sets.length) return res.status(400).json({ error: "Tidak ada perubahan" });
    p.push(req.params.id);
    await query(`UPDATE tb_resellers SET ${sets.join(", ")} WHERE id=?`, p);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const { status, user_id, q, reseller, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT o.id,o.batch_id,o.server,o.service_name,o.country_name,o.country_emoji,o.operator_name,o.phone_number,o.price_modal,o.price_sell,o.price_reseller,o.status,o.otp_code,o.created_at,o.updated_at,u.username,u.first_name,u.telegram_id,r.id AS reseller_id,ru.username AS reseller_username FROM tb_orders o JOIN tb_users u ON u.id=o.user_id LEFT JOIN tb_resellers r ON r.id=o.owner_id LEFT JOIN tb_users ru ON ru.id=r.user_id WHERE 1=1`;
    const p = [];
    if (status) { sql += " AND o.status=?"; p.push(status); }
    if (user_id) { sql += " AND o.user_id=?"; p.push(user_id); }
    if (reseller === "1") sql += " AND o.owner_id IS NOT NULL"; // hanya order milik bot reseller
    if (q) { sql += " AND (o.phone_number LIKE ? OR o.service_name LIKE ? OR o.id LIKE ?)"; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?"; p.push(parseInt(limit), parseInt(offset));
    const rows = await query(sql, p);
    res.json(rows.map(r => ({
      ...r,
      price_modal: rupiah(r.price_modal),
      price_sell: rupiah(r.price_sell),
      price_reseller: r.price_reseller ? rupiah(r.price_reseller) : "-",
      // Margin per invoice reseller = harga jual reseller − harga jual bot utama
      margin: r.price_reseller != null ? rupiah(r.price_reseller - r.price_sell) : "-",
      raw_margin: r.price_reseller != null ? r.price_reseller - r.price_sell : null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
  try { await query("UPDATE tb_orders SET status=? WHERE id=?", [req.body.status, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/deposits", requireAuth, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT d.id,d.amount,d.method,d.external_id,d.unique_code,d.status,d.paid_at,d.created_at,u.username,u.telegram_id FROM tb_deposits d JOIN tb_users u ON u.id=d.user_id WHERE 1=1`;
    const p = [];
    if (status) { sql += " AND d.status=?"; p.push(status); }
    sql += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?"; p.push(parseInt(limit), parseInt(offset));
    const rows = await query(sql, p);
    res.json(rows.map(r => ({ ...r, amount: rupiah(r.amount) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/deposits/:id/status", requireAuth, async (req, res) => {
  try {
    const paidAt = req.body.status === "PAID" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;
    await query("UPDATE tb_deposits SET status=?, paid_at=? WHERE id=?", [req.body.status, paidAt, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/withdrawals", requireAuth, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT w.id,w.amount,w.status,w.note,w.created_at,w.updated_at,r.bot_username,r.user_id FROM tb_withdrawals w JOIN tb_resellers r ON r.id=w.reseller_id WHERE 1=1`;
    const p = [];
    if (status) { sql += " AND w.status=?"; p.push(status); }
    sql += " ORDER BY w.created_at DESC LIMIT ? OFFSET ?"; p.push(parseInt(limit), parseInt(offset));
    const rows = await query(sql, p);
    res.json(rows.map(r => ({ ...r, amount: rupiah(r.amount) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/withdrawals/:id/status", requireAuth, async (req, res) => {
  try { await query("UPDATE tb_withdrawals SET status=?, note=? WHERE id=?", [req.body.status, req.body.note ?? null, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/settings", requireAuth, async (req, res) => {
  try { const rows = await query("SELECT `key`,`value` FROM tb_settings ORDER BY `key`"); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/settings/:key", requireAuth, async (req, res) => {
  try { await query("INSERT INTO tb_settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)", [req.params.key, req.body.value ?? null]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/finance/summary", requireAuth, async (req, res) => {
  try {
    const [dep] = await query("SELECT COALESCE(SUM(amount),0) AS total FROM tb_deposits WHERE status='PAID'");
    const [rev] = await query("SELECT COALESCE(SUM(price_sell),0) AS total FROM tb_orders WHERE status='COMPLETED'");
    const [prof] = await query("SELECT COALESCE(SUM(price_sell - price_modal),0) AS total FROM tb_orders WHERE status='COMPLETED'");
    const [wd] = await query("SELECT COALESCE(SUM(amount),0) AS total FROM tb_withdrawals WHERE status='APPROVED'");
    const [wdp] = await query("SELECT COALESCE(SUM(amount),0) AS total FROM tb_withdrawals WHERE status='PENDING'");
    const [ord] = await query("SELECT COUNT(*) AS c FROM tb_orders WHERE status='COMPLETED'");
    res.json({ totalDeposit: dep.total, totalRevenue: rev.total, totalProfit: prof.total, totalWithdrawn: wd.total, pendingWithdrawal: wdp.total, totalOrders: ord.c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Status sistem: heartbeat bot utama, engine reseller, status GoPay ──
app.get("/api/system", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT `key`,`value` FROM tb_settings WHERE `key` IN ('bot_heartbeat','reseller_orchestrator','gopay_status')");
    const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
    let engine = null;
    if (m.reseller_orchestrator) { try { engine = JSON.parse(m.reseller_orchestrator); } catch {} }
    let gopay = null;
    if (m.gopay_status) { try { gopay = JSON.parse(m.gopay_status); } catch {} }
    res.json({ botHeartbeat: m.bot_heartbeat || null, engine, gopay });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Saldo provider OTP (live, dari API provider) ──
app.get("/api/provider/balance", requireAuth, async (req, res) => {
  try {
    if (!process.env.SMSCODE_API_KEY) return res.json({ balance: null, currency: null });
    const r = await fetch("https://api.smscode.gg/v1/balance", {
      headers: { Authorization: `Bearer ${process.env.SMSCODE_API_KEY}` },
    });
    const j = await r.json();
    if (!j.success) return res.status(502).json({ error: j.error?.message || "Gagal ambil saldo provider" });
    res.json({ balance: j.data?.balance ?? null, currency: j.data?.currency ?? "USD" });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ── Alert: deposit hampir habis, order aktif lewat waktu (poller bermasalah) ──
app.get("/api/alerts", requireAuth, async (req, res) => {
  try {
    const items = [];
    const dep = await query(
      "SELECT id, amount, created_at FROM tb_deposits WHERE status='PENDING' AND created_at < (NOW() - INTERVAL 3 MINUTE) ORDER BY created_at ASC LIMIT 10"
    );
    for (const d of dep) items.push({ level: "warn", text: `Deposit #${d.id} Rp ${d.amount} belum dibayar & mendekati kedaluwarsa`, at: d.created_at });
    const ord = await query(
      "SELECT id, phone_number, expires_at FROM tb_orders WHERE status IN ('ACTIVE','PENDING') AND expires_at < NOW() ORDER BY expires_at ASC LIMIT 10"
    );
    for (const o of ord) items.push({ level: "error", text: `Order #${o.id} (${o.phone_number ?? "-"}) lewat waktu tapi belum direfund — cek poller`, at: o.expires_at });
    const wd = await query("SELECT COUNT(*) AS c FROM tb_withdrawals WHERE status='PENDING'");
    if (wd[0]?.c > 0) items.push({ level: "info", text: `${wd[0].c} withdraw menunggu konfirmasi Anda`, at: null });
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`[nokos-panel] http://localhost:${PORT}`));

