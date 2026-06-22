#!/bin/bash
# Lumière Studio — Cập nhật schema database lên phiên bản mới nhất
# Dùng khi nâng cấp từ phiên bản cũ lên phiên bản mới
# Chạy lệnh: bash scripts/run-migrate.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[LỖI]${NC}  $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

[[ -f .env ]] || error "Không tìm thấy file .env. Hãy chạy setup-ubuntu.sh trước."

# Đọc DATABASE_URL an toàn (không dùng source để tránh bash thực thi URL như lệnh)
DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
[[ -z "$DATABASE_URL" ]] && error "Không tìm thấy DATABASE_URL trong file .env"

PG_USER=$(echo "$DATABASE_URL"    | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
PG_PASS=$(echo "$DATABASE_URL"    | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
PG_DBNAME=$(echo "$DATABASE_URL"  | sed -n 's|.*/\([^?]*\).*|\1|p')

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Lumière Studio — Cập nhật schema DB      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "Database: $PG_DBNAME  |  User: $PG_USER"
echo ""

info "Đang chạy migrate (thêm cột/bảng mới nếu chưa có)..."

docker exec -i \
  -e PGPASSWORD="$PG_PASS" \
  postgres_db psql -U "$PG_USER" -d "$PG_DBNAME" << 'EOSQL'
-- ═══════════════════════════════════════════════════════════════════
-- Lumière Studio — Migration: đảm bảo schema đầy đủ (idempotent)
-- Chạy nhiều lần vẫn an toàn (IF NOT EXISTS / DO $$ ... END$$)
-- ═══════════════════════════════════════════════════════════════════

-- ── Bảng mới từ phiên bản subscription ──────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               SERIAL PRIMARY KEY,
  studio_id        UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  amount           INTEGER NOT NULL,
  payos_order_code BIGINT UNIQUE,
  transfer_content TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  months           INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  paid_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payments_studio_id_idx        ON payments(studio_id);
CREATE INDEX IF NOT EXISTS payments_payos_order_code_idx ON payments(payos_order_code);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Bảng deliverables ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverables (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id         UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  version_label    TEXT NOT NULL,
  drive_folder_url TEXT NOT NULL,
  note             TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deliverables_album_id_version_idx ON deliverables(album_id, version);

CREATE TABLE IF NOT EXISTS deliverable_photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id    UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  original_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  edited_image_url  TEXT NOT NULL,
  caption           TEXT
);
CREATE INDEX IF NOT EXISTS deliverable_photos_deliverable_id_idx    ON deliverable_photos(deliverable_id);
CREATE INDEX IF NOT EXISTS deliverable_photos_original_photo_id_idx ON deliverable_photos(original_photo_id);

-- ── Bảng selection_confirmations ─────────────────────────────────
CREATE TABLE IF NOT EXISTS selection_confirmations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  photo_count   INTEGER NOT NULL,
  snapshot      TEXT NOT NULL,
  confirmed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sel_confirmations_album_id_confirmed_at_idx ON selection_confirmations(album_id, confirmed_at);
CREATE INDEX IF NOT EXISTS sel_confirmations_customer_idx               ON selection_confirmations(customer_name);

-- ── Cột mới trong bảng studios ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='studios' AND column_name='trial_ends_at') THEN
    ALTER TABLE studios ADD COLUMN trial_ends_at TIMESTAMP;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='studios' AND column_name='subscription_expires_at') THEN
    ALTER TABLE studios ADD COLUMN subscription_expires_at TIMESTAMP;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='studios' AND column_name='n8n_webhook_url') THEN
    ALTER TABLE studios ADD COLUMN n8n_webhook_url TEXT;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='studios' AND column_name='webhook_secret') THEN
    ALTER TABLE studios ADD COLUMN webhook_secret TEXT;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='studios' AND column_name='deliverable_notify_enabled') THEN
    ALTER TABLE studios ADD COLUMN deliverable_notify_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='studios' AND column_name='expires_at') THEN
    ALTER TABLE studios ADD COLUMN expires_at TIMESTAMP;
  END IF;
END$$;

-- ── Cột mới trong bảng albums ────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='customer_phone') THEN
    ALTER TABLE albums ADD COLUMN customer_phone TEXT;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='auto_send_enabled') THEN
    ALTER TABLE albums ADD COLUMN auto_send_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='webhook_sent_at') THEN
    ALTER TABLE albums ADD COLUMN webhook_sent_at TIMESTAMP;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='webhook_last_status') THEN
    ALTER TABLE albums ADD COLUMN webhook_last_status TEXT;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='show_before_after') THEN
    ALTER TABLE albums ADD COLUMN show_before_after BOOLEAN NOT NULL DEFAULT true;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='deliverable_root_folder_url') THEN
    ALTER TABLE albums ADD COLUMN deliverable_root_folder_url TEXT;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='albums' AND column_name='deliverable_root_folder_id') THEN
    ALTER TABLE albums ADD COLUMN deliverable_root_folder_id TEXT;
  END IF;
END$$;

-- ── Cột mới trong bảng photos ────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='photos' AND column_name='mime_type') THEN
    ALTER TABLE photos ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'image/jpeg';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='photos' AND column_name='width') THEN
    ALTER TABLE photos ADD COLUMN width INTEGER;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='photos' AND column_name='height') THEN
    ALTER TABLE photos ADD COLUMN height INTEGER;
  END IF;
END$$;

-- ── Cập nhật CHECK constraint studios.status (thêm giá trị 'trial') ─────────
ALTER TABLE studios DROP CONSTRAINT IF EXISTS studios_status_check;
ALTER TABLE studios ADD CONSTRAINT studios_status_check
  CHECK (status IN ('trial','active','expired','disabled','PENDING','APPROVED','DISABLED'));
EOSQL

success "Schema đã được cập nhật."

echo ""
info "Khởi động lại container để áp dụng thay đổi..."
docker restart lumiere-studio && success "Container đã khởi động lại."

echo ""
success "Migrate hoàn tất!"
echo ""
echo -e "  App đang chạy tại: ${BOLD}http://localhost:9200${NC}"
echo ""
