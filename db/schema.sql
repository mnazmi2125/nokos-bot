-- Nokos Bot — MySQL Schema
-- Semua nilai uang dalam IDR (integer, bukan desimal).

CREATE TABLE IF NOT EXISTS tb_users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  telegram_id   BIGINT NOT NULL,
  username      VARCHAR(64) NULL,
  first_name    VARCHAR(128) NULL,
  balance       BIGINT NOT NULL DEFAULT 0,
  referral_code VARCHAR(16) NOT NULL,
  referred_by   BIGINT UNSIGNED NULL,
  is_banned     TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_telegram (telegram_id),
  UNIQUE KEY uq_users_refcode (referral_code),
  KEY idx_users_referred (referred_by),
  CONSTRAINT fk_users_referred FOREIGN KEY (referred_by) REFERENCES tb_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Satu baris per reseller (1:1 dengan tb_users). Semua data & pengaturan bot whitelabel.
CREATE TABLE IF NOT EXISTS tb_resellers (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  bot_token     VARCHAR(191) NULL,
  bot_username  VARCHAR(64) NULL,
  bot_name      VARCHAR(128) NULL,
  margin_pct    INT NOT NULL DEFAULT 5,
  margin_type   ENUM('PCT','AMOUNT') NOT NULL DEFAULT 'PCT',
  margin_amount BIGINT NOT NULL DEFAULT 0,
  cs_contact    VARCHAR(64) NULL,
  status        ENUM('PENDING','ACTIVE','STOPPED') NOT NULL DEFAULT 'PENDING',
  restart_at    DATETIME NULL,
  saldo_margin  BIGINT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reseller_user (user_id),
  CONSTRAINT fk_reseller_user FOREIGN KEY (user_id) REFERENCES tb_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_price_tiers (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  server      VARCHAR(32) NOT NULL,
  name        VARCHAR(32) NOT NULL,
  min_price   BIGINT NOT NULL,
  max_price   BIGINT NULL,
  multiplier  DECIMAL(5,2) NOT NULL,
  min_profit  BIGINT NOT NULL DEFAULT 0,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tiers_server (server, min_price)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_deposits (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  amount      BIGINT NOT NULL,
  owner_id    BIGINT NULL,
  unique_code INT NOT NULL DEFAULT 0,
  method      VARCHAR(32) NOT NULL DEFAULT 'QRIS',
  external_id VARCHAR(64) NOT NULL,
  status      ENUM('PENDING','PAID','EXPIRED','FAILED') NOT NULL DEFAULT 'PENDING',
  chat_id     BIGINT NULL,
  message_id  BIGINT NULL,
  paid_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deposits_external (external_id),
  KEY idx_deposits_user (user_id, status),
  CONSTRAINT fk_deposits_user FOREIGN KEY (user_id) REFERENCES tb_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_orders (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  batch_id         CHAR(36) NOT NULL,
  server           VARCHAR(32) NOT NULL DEFAULT 'server1',
  owner_id         BIGINT NULL,
  provider_order_id BIGINT NULL,
  product_id       INT UNSIGNED NOT NULL,
  service_id       INT UNSIGNED NOT NULL,
  service_name     VARCHAR(64) NOT NULL,
  country_id       INT UNSIGNED NOT NULL,
  country_name     VARCHAR(64) NOT NULL,
  country_emoji    VARCHAR(8) NOT NULL DEFAULT '',
  operator_id      INT UNSIGNED NULL,
  operator_name    VARCHAR(64) NULL,
  phone_number     VARCHAR(32) NULL,
  chat_id          BIGINT NULL,
  message_id       BIGINT NULL,
  price_modal      BIGINT NOT NULL,
  price_sell       BIGINT NOT NULL,
  price_reseller   BIGINT NULL,
  margin_credited  TINYINT(1) NOT NULL DEFAULT 0,
  status           ENUM('PENDING','ACTIVE','OTP_RECEIVED','COMPLETED','CANCELED','EXPIRED','FAILED') NOT NULL DEFAULT 'PENDING',
  otp_code         VARCHAR(16) NULL,
  otp_message      TEXT NULL,
  expires_at       DATETIME NULL,
  otp_received_at  DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_provider (server, provider_order_id),
  KEY idx_orders_user (user_id, status),
  KEY idx_orders_batch (batch_id),
  KEY idx_orders_poll (status, expires_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES tb_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_transactions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  type          ENUM('DEPOSIT','PURCHASE','REFUND','BONUS','ADJUSTMENT') NOT NULL,
  amount        BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference     VARCHAR(64) NULL,
  description   VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tx_user (user_id, created_at),
  KEY idx_tx_ref (reference),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES tb_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_settings (
  `key`      VARCHAR(64) NOT NULL,
  `value`    TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_withdrawals (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reseller_id  BIGINT UNSIGNED NOT NULL,
  amount       BIGINT NOT NULL,
  status       ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  note         VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wd_reseller (reseller_id, status),
  CONSTRAINT fk_wd_reseller FOREIGN KEY (reseller_id) REFERENCES tb_resellers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tb_settings (`key`, `value`) VALUES
  ('promo_channel', '@InfoNokosMochi'),
  ('cs_contact', '@CSNokos'),
  ('total_user_display', '0'),
  ('deposit_qris_enabled', '0'),
  ('poll_interval_sec', '4'),
  ('order_timeout_min', '20');
