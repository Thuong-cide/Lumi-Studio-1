#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Lumière Studio — Script cài đặt tự động cho Synology NAS
#  Đặt toàn bộ file vào /volume1/docker/lumiere rồi chạy script này
#  Cách chạy:  bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Màu sắc ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[LỖI]${NC}  $*"; exit 1; }
ask()     { echo -e "${BOLD}$*${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Lumière Studio — Cài đặt tự động      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Kiểm tra Docker ───────────────────────────────────────────────────────
info "Kiểm tra Docker..."
command -v docker &>/dev/null || error "Docker chưa được cài đặt. Hãy cài Container Manager trên DSM trước."
docker compose version &>/dev/null || error "Lệnh 'docker compose' không khả dụng. Hãy nâng cấp Docker."
success "Docker đã sẵn sàng."

# ── 2. Thu thập thông tin ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ THÔNG TIN POSTGRESQL ━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}PostgreSQL đang chạy trực tiếp trên NAS của bạn.${NC}"
echo ""

ask "▶ Host PostgreSQL (để trống = 127.0.0.1):"
read -r PG_HOST; PG_HOST="${PG_HOST:-127.0.0.1}"

ask "▶ Port PostgreSQL (để trống = 5432):"
read -r PG_PORT; PG_PORT="${PG_PORT:-5432}"

ask "▶ Tên database sẽ tạo cho Lumière (để trống = lumiere_db):"
read -r PG_DBNAME; PG_DBNAME="${PG_DBNAME:-lumiere_db}"

ask "▶ Tên user PostgreSQL cho Lumière (để trống = lumiere_user):"
read -r PG_USER; PG_USER="${PG_USER:-lumiere_user}"

ask "▶ Mật khẩu cho user '$PG_USER':"
read -rs PG_PASS; echo ""
[[ -z "$PG_PASS" ]] && error "Mật khẩu không được để trống."

ask "▶ User PostgreSQL có quyền tạo DB (thường là 'postgres'):"
read -r PG_ADMIN_USER; PG_ADMIN_USER="${PG_ADMIN_USER:-postgres}"

ask "▶ Mật khẩu của '$PG_ADMIN_USER' (để trống nếu không cần):"
read -rs PG_ADMIN_PASS; echo ""

echo ""
echo -e "${BOLD}━━━ THÔNG TIN ADMIN ━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ask "▶ Email tài khoản Admin:"
read -r ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && error "Email admin không được để trống."

ask "▶ Mật khẩu Admin (ít nhất 8 ký tự):"
read -rs ADMIN_PASSWORD; echo ""
[[ ${#ADMIN_PASSWORD} -lt 8 ]] && error "Mật khẩu phải có ít nhất 8 ký tự."

echo ""
echo -e "${BOLD}━━━ GOOGLE DRIVE OAUTH ━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Bỏ qua nếu chưa có — có thể cấu hình sau trong file .env${NC}"

ask "▶ Google Client ID (Enter để bỏ qua):"
read -r GOOGLE_CLIENT_ID

ask "▶ Google Client Secret (Enter để bỏ qua):"
read -r GOOGLE_CLIENT_SECRET

ask "▶ IP hoặc domain của NAS (vd: 192.168.1.100 hoặc lumiere.domain.com):"
read -r NAS_HOST; NAS_HOST="${NAS_HOST:-localhost}"

# ── 3. Tạo JWT Secret ────────────────────────────────────────────────────────
JWT_SECRET=$(tr -dc 'A-Za-z0-9!@#$%^&*' </dev/urandom 2>/dev/null | head -c 48 || \
             cat /proc/sys/kernel/random/uuid 2>/dev/null | tr -d '-' | head -c 48 || \
             echo "lumiere-$(date +%s)-secret-key-change-me")

# ── 4. Tạo file .env ─────────────────────────────────────────────────────────
info "Tạo file .env..."

# Docker container kết nối ra NAS host qua host.docker.internal
# Nếu PG_HOST là localhost/127.0.0.1, đổi thành host.docker.internal cho Docker
DOCKER_PG_HOST="$PG_HOST"
if [[ "$PG_HOST" == "localhost" || "$PG_HOST" == "127.0.0.1" ]]; then
  DOCKER_PG_HOST="host.docker.internal"
fi

cat > .env <<EOF
# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@${DOCKER_PG_HOST}:${PG_PORT}/${PG_DBNAME}?connection_limit=10&pool_timeout=20

# ─── Auth ─────────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}

# ─── Google Drive OAuth ───────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-YOUR_GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-YOUR_GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=http://${NAS_HOST}:9001/api/auth/google/callback
EOF

success "File .env đã được tạo."

# ── 5. Khởi tạo PostgreSQL ───────────────────────────────────────────────────
echo ""
info "Chuẩn bị database PostgreSQL..."

# Xây dựng lệnh psql
PSQL_CMD=""

# Tìm psql trong các đường dẫn thường gặp trên Synology
for path in psql /usr/bin/psql /usr/local/bin/psql \
            /var/packages/PostgreSQL/target/bin/psql \
            /volume1/@appstore/PostgreSQL14/target/bin/psql \
            /volume1/@appstore/PostgreSQL15/target/bin/psql \
            /volume1/@appstore/PostgreSQL16/target/bin/psql; do
  if command -v "$path" &>/dev/null 2>&1 || [[ -x "$path" ]]; then
    PSQL_CMD="$path"
    break
  fi
done

# Nếu không tìm thấy psql, dùng Docker để chạy psql
if [[ -z "$PSQL_CMD" ]]; then
  warn "Không tìm thấy psql trên hệ thống, dùng Docker để kết nối database..."
  PSQL_CMD="docker run --rm --add-host=host.docker.internal:host-gateway postgres:16-alpine psql"
  PG_HOST_FOR_PSQL="host.docker.internal"
else
  PG_HOST_FOR_PSQL="$PG_HOST"
fi

run_psql_admin() {
  if [[ "$PSQL_CMD" == docker* ]]; then
    PGPASSWORD="$PG_ADMIN_PASS" $PSQL_CMD \
      "postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASS}@${PG_HOST_FOR_PSQL}:${PG_PORT}/postgres" \
      -c "$1" 2>&1
  else
    PGPASSWORD="$PG_ADMIN_PASS" $PSQL_CMD \
      -h "$PG_HOST" -p "$PG_PORT" -U "$PG_ADMIN_USER" -d postgres \
      -c "$1" 2>&1
  fi
}

run_psql_lumiere() {
  local sql_file="$1"
  if [[ "$PSQL_CMD" == docker* ]]; then
    PGPASSWORD="$PG_PASS" $PSQL_CMD \
      "postgresql://${PG_USER}:${PG_PASS}@${PG_HOST_FOR_PSQL}:${PG_PORT}/${PG_DBNAME}" \
      -f /dev/stdin < "$sql_file" 2>&1
  else
    PGPASSWORD="$PG_PASS" $PSQL_CMD \
      -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DBNAME" \
      -f "$sql_file" 2>&1
  fi
}

# Tạo user nếu chưa có
info "Tạo user '${PG_USER}'..."
run_psql_admin "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
  ELSE
    ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
  END IF;
END \$\$;" 2>&1 | grep -v "^$" || warn "Không thể tạo user tự động — hãy tạo thủ công nếu chưa có."

# Tạo database nếu chưa có
info "Tạo database '${PG_DBNAME}'..."
run_psql_admin "SELECT 'CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DBNAME}')\gexec" 2>&1 | \
  grep -v "^$" || true

run_psql_admin "GRANT ALL PRIVILEGES ON DATABASE ${PG_DBNAME} TO ${PG_USER};" 2>&1 | \
  grep -v "^$" || true

# Chạy schema SQL
info "Tạo bảng và index..."
run_psql_lumiere "$SCRIPT_DIR/scripts/init-db.sql" && \
  success "Database đã được khởi tạo." || \
  warn "Có lỗi khi khởi tạo schema — kiểm tra kết nối PostgreSQL và thử lại."

# ── 6. Build Docker image ────────────────────────────────────────────────────
echo ""
info "Build Docker image (quá trình này mất 5–15 phút lần đầu)..."
docker compose build --progress=plain 2>&1 | \
  grep -E "(Step|---|\[|Successfully|=>|ERROR)" || true

docker compose images lumiere | grep -q "lumiere" && \
  success "Docker image đã được build." || \
  error "Build Docker image thất bại. Xem log ở trên để biết nguyên nhân."

# ── 7. Khởi động container ───────────────────────────────────────────────────
echo ""
info "Khởi động Lumière Studio..."
docker compose up -d
sleep 5

# Kiểm tra container đang chạy
if docker compose ps | grep -q "Up"; then
  success "Container đang chạy."
else
  error "Container không khởi động được. Chạy 'docker compose logs' để xem lỗi."
fi

# ── 8. Tạo tài khoản Admin ───────────────────────────────────────────────────
echo ""
info "Tạo tài khoản Admin..."

docker compose exec -e ADMIN_EMAIL="$ADMIN_EMAIL" \
                    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
                    -e DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${DOCKER_PG_HOST}:${PG_PORT}/${PG_DBNAME}" \
  lumiere node /app/scripts/create-admin.mjs && \
  success "Tài khoản Admin đã được tạo." || \
  warn "Không thể tạo admin tự động. Xem hướng dẫn thủ công trong DEPLOY_SYNOLOGY.md"

# ── 9. Kiểm tra API ──────────────────────────────────────────────────────────
echo ""
info "Kiểm tra API..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9001/api/health" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  success "API phản hồi bình thường (HTTP 200)."
else
  warn "API chưa phản hồi (HTTP $HTTP_CODE) — có thể đang khởi động, thử lại sau vài giây."
fi

# ── 10. Thông báo kết quả ────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║          CÀI ĐẶT HOÀN TẤT!                  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐  App:   ${BOLD}http://${NAS_HOST}:9001${NC}"
echo -e "  🔐  Admin: ${BOLD}http://${NAS_HOST}:9001/login${NC}"
echo -e "  📧  Email: ${BOLD}${ADMIN_EMAIL}${NC}"
echo ""
echo -e "${YELLOW}Lưu ý:${NC}"
echo "  • Nếu dùng Google Drive, cập nhật GOOGLE_CLIENT_ID và"
echo "    GOOGLE_CLIENT_SECRET trong file .env rồi chạy:"
echo "    docker compose restart"
echo ""
echo "  • Để xem log:        docker compose logs -f"
echo "  • Để dừng app:       docker compose down"
echo "  • Để cập nhật app:   bash update.sh"
echo ""
