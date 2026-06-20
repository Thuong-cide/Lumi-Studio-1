-- Lumière — Migrate schema (an toàn khi chạy nhiều lần)
-- Dùng để nâng cấp database cũ lên schema mới nhất
-- Chạy lệnh: bash scripts/run-migrate.sh

-- ─── Thêm cột mới vào bảng studios ──────────────────────────────────────────
ALTER TABLE studios ADD COLUMN IF NOT EXISTS n8n_webhook_url            TEXT;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS webhook_secret             TEXT;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS deliverable_notify_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS expires_at                 TIMESTAMP;

-- ─── Thêm cột mới vào bảng albums ───────────────────────────────────────────
ALTER TABLE albums ADD COLUMN IF NOT EXISTS customer_phone              TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS auto_send_enabled           BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS webhook_sent_at             TIMESTAMP;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS webhook_last_status         TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS show_before_after           BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS deliverable_root_folder_url TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS deliverable_root_folder_id  TEXT;

-- ─── Tạo bảng mới nếu chưa có ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT      PRIMARY KEY,
  value      TEXT      NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS selection_confirmations (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID      NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  customer_name TEXT      NOT NULL,
  photo_count   INTEGER   NOT NULL,
  snapshot      TEXT      NOT NULL,
  confirmed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliverables (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id         UUID      NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  version          INTEGER   NOT NULL,
  version_label    TEXT      NOT NULL,
  drive_folder_url TEXT      NOT NULL,
  note             TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliverable_photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id    UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  original_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  edited_image_url  TEXT NOT NULL,
  caption           TEXT
);

-- ─── Indexes mới ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS studios_status_idx
  ON studios(status);

CREATE INDEX IF NOT EXISTS albums_slug_idx
  ON albums(slug);

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
