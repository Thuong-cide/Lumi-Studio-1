-- Lumière — Khởi tạo database (an toàn khi chạy nhiều lần)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS admin_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  password_hash TEXT      NOT NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studios (
  id                      UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT      NOT NULL,
  email                   TEXT      NOT NULL UNIQUE,
  phone                   TEXT,
  password_hash           TEXT      NOT NULL,
  status                  TEXT      NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','APPROVED','DISABLED')),
  google_drive_refresh_token TEXT,
  root_folder_id          TEXT,
  default_max_selection   INTEGER   NOT NULL DEFAULT 0,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS albums (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id        UUID      NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title            TEXT      NOT NULL,
  slug             TEXT      NOT NULL UNIQUE,
  description      TEXT,
  drive_folder_id  TEXT,
  allow_download   BOOLEAN   NOT NULL DEFAULT FALSE,
  allow_notes      BOOLEAN   NOT NULL DEFAULT TRUE,
  max_selection    INTEGER   NOT NULL DEFAULT 0,
  is_public        BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

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

-- Indexes (bỏ qua nếu đã tồn tại)
CREATE INDEX IF NOT EXISTS albums_studio_id_created_at_idx
  ON albums(studio_id, created_at);

CREATE INDEX IF NOT EXISTS albums_is_public_created_at_idx
  ON albums(is_public, created_at);

CREATE INDEX IF NOT EXISTS photos_album_id_order_idx
  ON photos(album_id, "order");

CREATE INDEX IF NOT EXISTS photos_drive_file_id_idx
  ON photos(drive_file_id);

CREATE INDEX IF NOT EXISTS selections_album_id_selected_customer_idx
  ON selections(album_id, selected, customer_name);
