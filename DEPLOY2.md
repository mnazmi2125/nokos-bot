# Panduan Deploy — nokos-bot ke VPS (PM2) · Tanpa SSH Key

Sama persis dengan DEPLOY.md, **kecuali** bagian yang menyangkut SSH key dihilangkan.
Workflow `deploy.yml` sudah mendukung autentikasi password secara native.

---

## 0. Aturan penting

- **Satu bot aktif saja** — matikan `npm run dev` di Windows SEBELUM bot jalan di VPS.
  Dua instance getUpdates bersamaan = error `409 Conflict`.
- Skema DB dibuat **otomatis** saat boot (`migrate`), tidak perlu import SQL manual.

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

Karena tidak pakai SSH key, clone via HTTPS dengan Personal Access Token (PAT):

```bash
# Buat PAT di GitHub: Settings → Developer settings → Personal access tokens → Fine-grained
# Beri akses: Contents (read-only) pada repo nokos-bot

git clone https://GANTI_USERNAME:GANTI_PAT@github.com/GANTI_USER_GITHUB/nokos-bot.git /root/nokos-bot
cd /root/nokos-bot
```

> Simpan URL remote dengan token agar `git fetch` di `deploy.sh` bisa jalan tanpa interaksi:
> ```bash
> git remote set-url origin https://GANTI_USERNAME:GANTI_PAT@github.com/GANTI_USER_GITHUB/nokos-bot.git
> ```

Upload **hanya `.env`** via SFTP (MobaXterm) ke `/root/nokos-bot/.env`.

## 4. Install & konfigurasi .env

```bash
cd /root/nokos-bot
npm ci
nano .env
```

```ini
DATABASE_URL=mysql://nokos:GANTI_PASSWORD_KUAT@localhost:3306/nokos_bot
PG_PROVIDER=mayar
MAYAR_API_KEY=isi_key_produksi_web.mayar.id
# MAYAR_SANDBOX=1
```

## 5. Uji foreground dulu

```bash
npm start
```

Cek log: `[db] migrate OK` → `[warmup] … siap` → `Bot berjalan (long polling)`.
Tes `/start` dari Telegram. Stop dengan `Ctrl+C`.

## 6. Jalankan di PM2

```bash
pm2 start npm --name nokos-bot --max-memory-restart 250M -- start
pm2 start npm --name nokos-reseller --max-memory-restart 300M -- reseller
pm2 save
pm2 startup        # jalankan perintah sudo yang dicetak di layar
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

**Swap 512M**:

```bash
fallocate -l 512M /swapfile
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 8. Auto-deploy via GitHub Actions (password, tanpa SSH key)

### 8a. Lokal (sekali)

```powershell
git remote add origin https://github.com/GANTI_USER_GITHUB/nokos-bot.git
git branch -M main
git push -u origin main
```

### 8b. GitHub Secrets (sekali) — Settings → Secrets and variables → Actions

| Secret | Nilai |
|---|---|
| `VPS_HOST` | IP VPS |
| `VPS_USER` | `root` |
| `VPS_PASSWORD` | password root VPS |
| `VPS_PORT` | `22` |
| `VPS_PATH` | `/root/nokos-bot` |

> **Tidak perlu** `VPS_SSH_KEY` — `deploy.yml` otomatis pakai `VPS_PASSWORD` jika `VPS_SSH_KEY` kosong.

### 8c. Alur kerja harian

1. Edit kode di VS Code → **Commit** → **Push**.
2. Tab **Actions** GitHub → run `Deploy ke VPS` otomatis.
3. `deploy/deploy.sh`: `git fetch/merge` → `npm ci` (jika `package-lock.json` berubah) → typecheck → `pm2 reload`.

---

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `409 Conflict: getUpdates` | Bot jalan 2 tempat → matikan `npm run dev` lokal |
| `ECONNREFUSED ::1:3306` | MariaDB mati → `systemctl start mariadb` |
| `[db] migrate gagal` | Salah `DATABASE_URL` / password di `.env` |
| `git fetch` gagal di deploy.sh | PAT expired / salah → update URL remote di VPS |
| Actions gagal autentikasi | `VPS_PASSWORD` salah / root login dinonaktifkan di sshd |
| Log hilang / cek error | `pm2 logs nokos-bot --lines 100` |
