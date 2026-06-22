#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Lumière Studio — Script cài đặt tự động cho Ubuntu + Docker
#  Yêu cầu: Docker đang chạy, container postgres_db đang hoạt động
#
#  Cách dùng:
#    bash setup-ubuntu.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[LỖI]${NC}  $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Lumière Studio — Cài đặt trên Ubuntu     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Kiểm tra Docker ──────────────────────────────────────────────────────
info "Kiểm tra Docker..."
command -v docker &>/dev/null || error "Docker chưa được cài."
success "Docker sẵn sàng."

# ─── 2. Kiểm tra container postgres_db ───────────────────────────────────────
info "Kiểm tra container postgres_db..."
docker ps --format '{{.Names}}' | grep -q "^postgres_db$" || \
  error "Container 'postgres_db' chưa chạy. Kiểm tra lại với: docker ps"
success "postgres_db đang chạy."

# ─── 3. Tự động lấy network của postgres_db ──────────────────────────────────
PG_NETWORK=$(docker inspect postgres_db \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
  2>/dev/null | awk '{print $1}')

[[ -z "$PG_NETWORK" ]] && error "Không lấy được network của postgres_db."
info "Network của postgres_db: ${BOLD}$PG_NETWORK${NC}"

# ─── 4. Gỡ container Lumière cũ (nếu có) ────────────────────────────────────
echo ""
if docker ps -a --format '{{.Names}}' | grep -q "^lumiere-studio$"; then
  warn "Tìm thấy container lumiere-studio cũ — đang gỡ..."
  docker stop lumiere-studio 2>/dev/null || true
  docker rm   lumiere-studio 2>/dev/null || true
  success "Đã gỡ container cũ."
fi

# ─── 5. Thông tin PostgreSQL ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ THÔNG TIN POSTGRESQL ━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -rsp "Mật khẩu user 'postgres' (admin): " PG_ADMIN_PASS; echo ""
[[ -z "$PG_ADMIN_PASS" ]] && error "Mật khẩu không được để trống."

PG_DBNAME="lumiere_db"
PG_USER="lumiere_user"
echo ""
read -rsp "Đặt mật khẩu cho database Lumière (bất kỳ): " PG_PASS; echo ""
[[ -z "$PG_PASS" ]] && error "Mật khẩu không được để trống."

# ─── 6. Tạo user + database ──────────────────────────────────────────────────
echo ""
info "Tạo user và database trong postgres_db..."

docker exec \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db psql -U postgres \
  -c "DO \$\$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${PG_USER}') THEN
          CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
        ELSE
          ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
        END IF;
      END\$\$;" 2>&1 | grep -v "^$" || true

docker exec \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db psql -U postgres \
  -c "SELECT 'CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER}'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${PG_DBNAME}')\gexec" \
  2>&1 | grep -v "^$" || true

docker exec \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db psql -U postgres \
  -c "GRANT ALL PRIVILEGES ON DATABASE ${PG_DBNAME} TO ${PG_USER};" \
  2>&1 | grep -v "^$" || true

# Grant schema usage (PostgreSQL 15+)
docker exec \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db psql -U postgres -d "$PG_DBNAME" \
  -c "GRANT ALL ON SCHEMA public TO ${PG_USER};" \
  2>&1 | grep -v "^$" || true

success "User '${PG_USER}' và database '${PG_DBNAME}' đã sẵn sàng."

# ─── 7. Khởi tạo schema ──────────────────────────────────────────────────────
info "Khởi tạo schema database..."

docker exec -i \
  -e PGPASSWORD="$PG_PASS" \
  postgres_db psql -U "$PG_USER" -d "$PG_DBNAME" << 'EOSQL'
-- Lumière Studio — Schema đầy đủ (tất cả bảng dùng IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS admin_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studios (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  email                     TEXT NOT NULL UNIQUE,
  phone                     TEXT,
  password_hash             TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at             TIMESTAMP,
  subscription_expires_at   TIMESTAMP,
  google_drive_refresh_token TEXT,
  root_folder_id            TEXT,
  default_max_selection     INTEGER NOT NULL DEFAULT 0,
  n8n_webhook_url           TEXT,
  webhook_secret            TEXT,
  deliverable_notify_enabled BOOLEAN NOT NULL DEFAULT false,
  expires_at                TIMESTAMP,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS studios_status_idx ON studios(status);

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
CREATE INDEX IF NOT EXISTS payments_studio_id_idx          ON payments(studio_id);
CREATE INDEX IF NOT EXISTS payments_payos_order_code_idx   ON payments(payos_order_code);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS albums (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id                 UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  slug                      TEXT NOT NULL UNIQUE,
  description               TEXT,
  drive_folder_id           TEXT,
  allow_download            BOOLEAN NOT NULL DEFAULT false,
  allow_notes               BOOLEAN NOT NULL DEFAULT true,
  max_selection             INTEGER NOT NULL DEFAULT 0,
  is_public                 BOOLEAN NOT NULL DEFAULT true,
  customer_phone            TEXT,
  auto_send_enabled         BOOLEAN NOT NULL DEFAULT true,
  webhook_sent_at           TIMESTAMP,
  webhook_last_status       TEXT,
  show_before_after         BOOLEAN NOT NULL DEFAULT true,
  deliverable_root_folder_url TEXT,
  deliverable_root_folder_id  TEXT,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS albums_studio_id_created_at_idx ON albums(studio_id, created_at);
CREATE INDEX IF NOT EXISTS albums_is_public_created_at_idx  ON albums(is_public, created_at);
CREATE INDEX IF NOT EXISTS albums_slug_idx                  ON albums(slug);

CREATE TABLE IF NOT EXISTS photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL DEFAULT 'image/jpeg',
  thumbnail_url TEXT,
  width         INTEGER,
  height        INTEGER,
  "order"       INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS photos_album_id_order_idx  ON photos(album_id, "order");
CREATE INDEX IF NOT EXISTS photos_drive_file_id_idx   ON photos(drive_file_id);

CREATE TABLE IF NOT EXISTS selections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id      UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  note          TEXT,
  selected      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS selections_album_id_selected_customer_idx ON selections(album_id, selected, customer_name);
CREATE INDEX IF NOT EXISTS selections_photo_id_idx ON selections(photo_id);

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS deliverables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  drive_folder_url TEXT NOT NULL,
  note          TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deliverables_album_id_version_idx ON deliverables(album_id, version);

CREATE TABLE IF NOT EXISTS deliverable_photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id    UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  original_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  edited_image_url  TEXT NOT NULL,
  caption           TEXT
);
CREATE INDEX IF NOT EXISTS deliverable_photos_deliverable_id_idx      ON deliverable_photos(deliverable_id);
CREATE INDEX IF NOT EXISTS deliverable_photos_original_photo_id_idx   ON deliverable_photos(original_photo_id);
EOSQL

success "Schema đã được tạo."

# ─── 8. Thông tin Admin ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ TÀI KHOẢN ADMIN ━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -rp "Email Admin: " ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && error "Email không được để trống."

while true; do
  read -rsp "Mật khẩu Admin (ít nhất 8 ký tự): " ADMIN_PASSWORD; echo ""
  [[ ${#ADMIN_PASSWORD} -ge 8 ]] && break
  warn "Mật khẩu quá ngắn. Nhập lại."
done

# ─── 9. PayOS (thanh toán subscription) ──────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PAYOS — THANH TOÁN SUBSCRIPTION ━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Bỏ qua nếu chưa có — có thể cập nhật file .env sau${NC}"
echo ""
read -rp "PayOS Client ID     : " PAYOS_CLIENT_ID
read -rp "PayOS API Key       : " PAYOS_API_KEY
read -rp "PayOS Checksum Key  : " PAYOS_CHECKSUM_KEY

# ─── 10. Google Drive (tùy chọn) ─────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ GOOGLE DRIVE (tùy chọn — Enter để bỏ qua) ━━${NC}"
echo ""
read -rp "Google Client ID     : " GOOGLE_CLIENT_ID
read -rp "Google Client Secret : " GOOGLE_CLIENT_SECRET

# ─── 11. Host/IP server ───────────────────────────────────────────────────────
echo ""
read -rp "IP hoặc domain server (vd: 192.168.1.100): " SERVER_HOST
SERVER_HOST="${SERVER_HOST:-localhost}"

# ─── 12. Tạo JWT Secret & Session Secret ─────────────────────────────────────
JWT_SECRET=$(cat /dev/urandom | tr -dc 'A-Za-z0-9!@#%^&*' 2>/dev/null | head -c 48 || \
             echo "lumiere-$(date +%s)-$(hostname | sha256sum | head -c 24)")
SESSION_SECRET=$(cat /dev/urandom | tr -dc 'A-Za-z0-9!@#%^&*' 2>/dev/null | head -c 48 || \
             echo "lumiere-sess-$(date +%s)-$(hostname | sha256sum | head -c 20)")

# DATABASE_URL dùng tên container postgres_db làm host (cùng network)
DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@postgres_db:5432/${PG_DBNAME}"

# ─── 13. Ghi file .env ───────────────────────────────────────────────────────
info "Tạo file .env..."
cat > .env <<EOF
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
PAYOS_CLIENT_ID=${PAYOS_CLIENT_ID:-}
PAYOS_API_KEY=${PAYOS_API_KEY:-}
PAYOS_CHECKSUM_KEY=${PAYOS_CHECKSUM_KEY:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=http://${SERVER_HOST}:9200/api/auth/google/callback
NODE_ENV=production
PORT=9200
STATIC_DIR=/app/public
EOF
success "File .env đã được tạo."

# ─── 14. Build Docker image ───────────────────────────────────────────────────
echo ""
info "Build Docker image (lần đầu mất 5–15 phút)..."
docker build -t lumiere-studio:latest . \
  2>&1 | grep -E "(Step| => |Successfully|error:|ERROR|---)" || true
success "Build hoàn tất."

# ─── 15. Khởi động container (cùng network với postgres_db) ──────────────────
echo ""
info "Khởi động Lumière Studio..."
docker run -d \
  --name lumiere-studio \
  --restart unless-stopped \
  -p 9200:9200 \
  --network "$PG_NETWORK" \
  --add-host=host.docker.internal:host-gateway \
  --env-file .env \
  lumiere-studio:latest

# Chờ container sẵn sàng
info "Chờ service khởi động..."
for i in {1..15}; do
  sleep 3
  if docker ps --format '{{.Names}} {{.Status}}' | grep "lumiere-studio" | grep -q "Up"; then
    break
  fi
  echo -n "."
done
echo ""

docker ps --format '{{.Names}} {{.Status}}' | grep "lumiere-studio" | grep -q "Up" || \
  error "Container không khởi động. Xem log: docker logs lumiere-studio"
success "Container đang chạy."

# ─── 16. Tạo tài khoản Admin ─────────────────────────────────────────────────
echo ""
info "Tạo tài khoản Admin..."
sleep 3

docker exec \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e DATABASE_URL="$DATABASE_URL" \
  lumiere-studio \
  node /app/dist/create-admin.mjs \
  && success "Tài khoản Admin: $ADMIN_EMAIL" \
  || warn "Chưa tạo được admin tự động. Chạy thủ công: bash scripts/make-admin.sh"

# ─── 17. Kiểm tra API ────────────────────────────────────────────────────────
echo ""
info "Kiểm tra API..."
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9200/api/health" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  success "API hoạt động bình thường (HTTP 200)."
else
  warn "API chưa phản hồi (HTTP $STATUS) — có thể đang khởi động. Thử lại: curl http://localhost:9200/api/health"
fi

# ─── Kết quả ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║          CÀI ĐẶT HOÀN TẤT!                  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐  App:    ${BOLD}http://${SERVER_HOST}:9200${NC}"
echo -e "  🔐  Login:  ${BOLD}http://${SERVER_HOST}:9200/login${NC}"
echo -e "  📧  Admin:  ${BOLD}${ADMIN_EMAIL}${NC}"
echo ""
echo "  Xem log:        docker logs -f lumiere-studio"
echo "  Dừng app:       docker stop lumiere-studio"
echo "  Khởi động lại:  docker start lumiere-studio"
echo "  Cập nhật app:   bash update.sh"
echo "  Tạo lại Admin:  bash scripts/make-admin.sh"
echo "  Migrate DB:     bash scripts/run-migrate.sh"
echo ""
echo -e "${YELLOW}  Lưu ý: File .env chứa mật khẩu — không chia sẻ công khai.${NC}"
echo ""
