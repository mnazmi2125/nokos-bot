# Panduan Deploy — nokos-bot ke VPS (PM2)

Target: VPS 1GB RAM (Ubuntu/Debian), sudah ada bot WhatsApp di PM2, MySQL/MariaDB lokal.

---

## 0. Aturan penting

- **Satu bot aktif saja** — matikan `npm run dev` di Windows SEBELUM bot jalan di VPS.
  Dua instance getUpdates bersamaan = error `409 Conflict`.
- Skema DB dibuat **otomatis** saat boot (`migrate`), tidak perlu import SQL manual.
- Jalankan via `tsx` (tanpa build) — path `db/schema.sql` tetap cocok.

---

## 1. Siapkan server

```bash
apt update && apt upgrade -y

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v && npm -v

# PM2 + MariaDB
npm i -g pm2
apt install -y mariadb-server
systemctl enable --now mariadb
```

## 2. Buat database & user

```bash
mysql -u root <<'SQL'
CREATE DATABASE nokos_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nokos'@'localhost' IDENTIFIED BY 'GANTI_PASSWORD_KUAT';
GRANT ALL PRIVILEGES ON nokos_bot.* TO 'nokos'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 3. Clone project dari GitHub (sekali saat awal)

Buat **Deploy key (baca-saja)** agar VPS bisa `git pull` repo privat:

```bash
# di VPS
ssh-keygen -t ed25519 -f ~/.ssh/nokos_deploy -N "" -C "nokos-vps-deploy"
cat ~/.ssh/nokos_deploy.pub     # salin isinya

# sekali: terima host key GitHub supaya fetch non-interaktif
ssh -T git@github.com </dev/null || true
```

Salin `nokos_deploy.pub` → GitHub → repo → **Settings → Deploy keys → Add deploy key**
(tanpa centang *"Allow write access"*), lalu:

```bash
git clone git@github.com:GANTI_USER_GITHUB/nokos-bot.git /root/nokos-bot
cd /root/nokos-bot
```

Upload **hanya `.env`** via SFTP (MobaXterm) ke `/root/nokos-bot/.env` —
file `.env` **tidak pernah masuk git** (token/rahasia), jadi tetap dikelola manual di VPS.

## 4. Install & konfigurasi .env

```bash
cd /root/nokos-bot
npm ci                 # tsx (devDependency) ikut terpasang → npm start bisa jalan
nano .env
```

Sesuaikan `.env` VPS:

```ini
DATABASE_URL=mysql://nokos:GANTI_PASSWORD_KUAT@localhost:3306/nokos_bot
PG_PROVIDER=mayar
MAYAR_API_KEY=isi_key_produksi_web.mayar.id
# MAYAR_SANDBOX=1        ← biarkan terkomentari (sudah produksi)
```

`BOT_TOKEN`, `SMSCODE_API_KEY` ikut dari `.env` lokal.

## 5. Uji foreground dulu

```bash
npm start
```

Cek log: `[db] migrate OK` → `[warmup] … siap` → `[cmd] shortcut menu terpasang` → `Bot berjalan (long polling)`.
Tes `/start` dari Telegram. Stop dengan `Ctrl+C`.

## 6. Jalankan di PM2

```bash
pm2 start npm --name nokos-bot --max-memory-restart 250M -- start
pm2 start npm --name nokos-reseller --max-memory-restart 300M -- reseller
pm2 save
pm2 startup        # jalankan perintah sudo yang dicetak di layar
```

`nokos-reseller` = orchestrator: menjalankan 1 proses bot per token reseller yang ada di
`tb_users.reseller_bot_token` (auto spawn/stop, poll DB tiap 15 detik).

Perintas harian:

```bash
pm2 logs nokos-bot        # pantau log
pm2 restart nokos-bot     # restart setelah ganti kode
pm2 monit                 # monitor RAM/CPU
```

## 7. Optimasi RAM 1GB

**MariaDB** — `nano /etc/mysql/mariadb.conf.d/50-server.cnf`, tambah di `[mysqld]`:

```ini
innodb_buffer_pool_size = 64M
performance_schema = OFF
```

```bash
systemctl restart mariadb
```

**Swap 512M** (kalau belum ada):

```bash
fallocate -l 512M /swapfile
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**(Opsional)** hemat ±100M: `apt purge -y snapd`.

## 8. Auto-deploy: push dari VS Code → VPS instan (GitHub Actions)

Setiap kali Anda **Commit + Push** dari VS Code, GitHub Actions otomatis SSH ke VPS,
menarik kode terbaru, typecheck, lalu me-reload PM2 — tanpa menyentuh VPS.

### 8a. Lokal (sekali — repo sudah `git init` oleh asisten)

```powershell
git remote add origin https://github.com/GANTI_USER_GITHUB/nokos-bot.git
git branch -M main
git push -u origin main
```

### 8b. VPS (sekali) — keypair untuk GitHub Actions → VPS

```bash
ssh-keygen -t ed25519 -f ~/gh_actions_key -N "" -C "github-actions"
cat ~/gh_actions_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/gh_actions_key            # salin SELURUH isi file (termasuk -----BEGIN/END-----)
```

### 8c. GitHub (sekali) — Settings → Secrets and variables → Actions → New repository secret

| Secret | Nilai |
|---|---|
| `VPS_HOST` | IP VPS |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | isi file `~/gh_actions_key` dari VPS |
| `VPS_PORT` | `22` |
| `VPS_PATH` | `/root/nokos-bot` |

### 8d. Alur kerja harian

1. Edit kode di VS Code → panel **Source Control** → **Commit** → **Push**.
2. Tab **Actions** GitHub → run `Deploy ke VPS` (otomatis, hitungan detik).
3. `deploy/deploy.sh` di VPS: `git fetch/merge` → `npm ci` (hanya jika `package-lock.json` berubah)
   → **typecheck** (kalau gagal, run merah dan bot **tidak** direstart) → `pm2 reload` kedua app
   (`nokos-bot` + `nokos-reseller` → anak bot reseller ikut respawn dengan kode baru).

Catatan:
- `.env` di VPS tidak ikut git — perubahan environment tetap manual.
- Repo disarankan **privat** (berisi kode bisnis; rahasia tetap di Secrets/.env).

---

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `409 Conflict: getUpdates` | Bot jalan 2 tempat → matikan `npm run dev` lokal |
| `ECONNREFUSED ::1:3306` | MariaDB mati → `systemctl start mariadb` |
| `[db] migrate gagal` | Salah `DATABASE_URL` / password di `.env` |
| QR tidak muncul / invoice gagal | `MAYAR_API_KEY` produksi belum terisi / KYC belum Verified |
| Log hilang / cek error | `pm2 logs nokos-bot --lines 100` |
| Mau stop total | `pm2 stop nokos-bot` (start lagi: `pm2 start nokos-bot`) |
