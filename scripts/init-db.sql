-- Lumière — Khởi tạo database (an toàn khi chạy nhiều lần)
-- Đồng bộ hoàn toàn với lib/db/src/schema/index.ts

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── admin_users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT      NOT NULL UNIQUE,
  password_hash TEXT      NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── studios ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studios (
  id                         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT      NOT NULL,
  email                      TEXT      NOT NULL UNIQUE,
  phone                      TEXT,
  password_hash              TEXT      NOT NULL,
  status                     TEXT      NOT NULL DEFAULT 'PENDING'
                               CHECK (status IN ('PENDING','APPROVED','DISABLED')),
  google_drive_refresh_token TEXT,
  root_folder_id             TEXT,
  default_max_selection      INTEGER   NOT NULL DEFAULT 0,
  n8n_webhook_url            TEXT,
  webhook_secret             TEXT,
  deliverable_notify_enabled BOOLEAN   NOT NULL DEFAULT FALSE,
  expires_at                 TIMESTAMP,
  created_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── albums ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS albums (
  id                        UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id                 UUID      NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title                     TEXT      NOT NULL,
  slug                      TEXT      NOT NULL UNIQUE,
  description               TEXT,
  drive_folder_id           TEXT,
  allow_download            BOOLEAN   NOT NULL DEFAULT FALSE,
  allow_notes               BOOLEAN   NOT NULL DEFAULT TRUE,
  max_selection             INTEGER   NOT NULL DEFAULT 0,
  is_public                 BOOLEAN   NOT NULL DEFAULT TRUE,
  customer_phone            TEXT,
  auto_send_enabled         BOOLEAN   NOT NULL DEFAULT TRUE,
  webhook_sent_at           TIMESTAMP,
  webhook_last_status       TEXT,
  show_before_after         BOOLEAN   NOT NULL DEFAULT TRUE,
  deliverable_root_folder_url TEXT,
  deliverable_root_folder_id  TEXT,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── photos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID      NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  drive_file_id TEXT      NOT NULL,
  filename      TEXT      NOT NULL,
  mime_type     TEXT      NOT NULL DEFAULT 'image/jpeg',
  thumbnail_url TEXT,
  width         INTEGER,
  height        INTEGER,
  "order"       INTEGER   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── selections ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS selections (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID      NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id      UUID      NOT NULL REFERENCES photos(id)  ON DELETE CASCADE,
  customer_name TEXT      NOT NULL,
  note          TEXT,
  selected      BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── app_config ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT      PRIMARY KEY,
  value      TEXT      NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── selection_confirmations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS selection_confirmations (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID      NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  customer_name TEXT      NOT NULL,
  photo_count   INTEGER   NOT NULL,
  snapshot      TEXT      NOT NULL,
  confirmed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── deliverables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverables (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id        UUID      NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  version         INTEGER   NOT NULL,
  version_label   TEXT      NOT NULL,
  drive_folder_url TEXT     NOT NULL,
  note            TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── deliverable_photos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_photos (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id    UUID      NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  original_photo_id UUID      REFERENCES photos(id) ON DELETE SET NULL,
  edited_image_url  TEXT      NOT NULL,
  caption           TEXT
);

-- ─── Indexes (bỏ qua nếu đã tồn tại) ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS studios_status_idx
  ON studios(status);

CREATE INDEX IF NOT EXISTS albums_studio_id_created_at_idx
  ON albums(studio_id, created_at);

CREATE INDEX IF NOT EXISTS albums_is_public_created_at_idx
  ON albums(is_public, created_at);

CREATE INDEX IF NOT EXISTS albums_slug_idx
  ON albums(slug);

CREATE INDEX IF NOT EXISTS photos_album_id_order_idx
  ON photos(album_id, "order");

CREATE INDEX IF NOT EXISTS photos_drive_file_id_idx
  ON photos(drive_file_id);

CREATE INDEX IF NOT EXISTS selections_album_id_selected_customer_idx
  ON selections(album_id, selected, customer_name);

CREATE INDEX IF NOT EXISTS selections_photo_id_idx
  ON selections(photo_id);

CREATE INDEX IF NOT EXISTS sel_confirmations_album_id_confirmed_at_idx
  ON selection_confirmations(album_id, confirmed_at);

CREATE INDEX IF NOT EXISTS sel_confirmations_customer_idx
  ON selection_confirmations(customer_name);

CREATE INDEX IF NOT EXISTS deliverables_album_id_version_idx
  ON deliverables(album_id, version);

CREATE INDEX IF NOT EXISTS deliverable_photos_deliverable_id_idx
  ON deliverable_photos(deliverable_id);

CREATE INDEX IF NOT EXISTS deliverable_photos_original_photo_id_idx
  ON deliverable_photos(original_photo_id);
