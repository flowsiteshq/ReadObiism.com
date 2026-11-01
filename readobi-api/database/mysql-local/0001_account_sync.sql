-- Apply only to a new, isolated local development database.
-- Account and outbox insertions must be committed in the same transaction.
CREATE TABLE IF NOT EXISTS obi_accounts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(44) NOT NULL,
  password_salt VARCHAR(24) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  synced_at VARCHAR(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS obi_sync_outbox (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL UNIQUE,
  event_type VARCHAR(40) NOT NULL,
  status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(255) DEFAULT NULL,
  created_at VARCHAR(32) NOT NULL,
  synced_at VARCHAR(32) DEFAULT NULL,
  CONSTRAINT fk_obi_sync_account FOREIGN KEY (account_id) REFERENCES obi_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
