#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Lumière Studio — Script cài đặt cho Ubuntu + PostgreSQL Docker sẵn có
#  Dùng khi đã có container postgres_db đang chạy
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
docker compose version &>/dev/null || \
  docker-compose version &>/dev/null || \
  error "'docker compose' không khả dụng. Hãy nâng cấp Docker."
success "Docker sẵn sàng."

# ─── 2. Gỡ container Lumière cũ (nếu có) ────────────────────────────────────
echo ""
info "Kiểm tra container Lumière cũ..."
if docker ps -a --format '{{.Names}}' | grep -q "^lumiere-studio$"; then
  warn "Tìm thấy container 'lumiere-studio' cũ — đang gỡ..."
  docker stop lumiere-studio 2>/dev/null || true
  docker rm lumiere-studio   2>/dev/null || true
  success "Đã gỡ container cũ."
else
  info "Không có container cũ — tiếp tục."
fi

# ─── 3. Kiểm tra container postgres_db ───────────────────────────────────────
echo ""
info "Kiểm tra container postgres_db..."
docker ps --format '{{.Names}}' | grep -q "^postgres_db$" || \
  error "Container 'postgres_db' không tìm thấy hoặc chưa chạy. Hãy kiểm tra lại với: docker ps"
success "Container postgres_db đang chạy."

# ─── 4. Thông tin kết nối PostgreSQL ─────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ CẤU HÌNH POSTGRESQL ━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Mật khẩu admin postgres để tạo user/db mới
read -rsp "Mật khẩu của user 'postgres' (admin): " PG_ADMIN_PASS; echo ""
[[ -z "$PG_ADMIN_PASS" ]] && error "Mật khẩu không được để trống."

# Thông tin DB cho Lumière
PG_DBNAME="lumiere_db"
PG_USER="lumiere_user"
echo ""
read -rsp "Đặt mật khẩu cho database Lumière (bất kỳ — ví dụ: LumiPass2024): " PG_PASS; echo ""
[[ -z "$PG_PASS" ]] && error "Mật khẩu không được để trống."

# Tạo user + database bên trong postgres_db
info "Tạo user và database Lumière trong postgres_db..."
docker exec -i \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db \
  psql -U postgres -c \
  "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${PG_USER}') THEN
      CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
    ELSE
      ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
    END IF;
  END\$\$;" \
  2>&1 | grep -v "^$" || true

docker exec -i \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db \
  psql -U postgres -c \
  "SELECT 'CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER}'
   WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${PG_DBNAME}')\gexec" \
  2>&1 | grep -v "^$" || true

docker exec -i \
  -e PGPASSWORD="$PG_ADMIN_PASS" \
  postgres_db \
  psql -U postgres -c \
  "GRANT ALL PRIVILEGES ON DATABASE ${PG_DBNAME} TO ${PG_USER};" \
  2>&1 | grep -v "^$" || true

success "User và database đã được tạo."

# Chạy schema SQL
info "Khởi tạo schema database..."
docker exec -i \
  -e PGPASSWORD="$PG_PASS" \
  postgres_db \
  psql -U "$PG_USER" -d "$PG_DBNAME" \
  < "$SCRIPT_DIR/scripts/init-db.sql" && \
  success "Schema đã được tạo." || \
  warn "Có lỗi khi tạo schema — có thể đã tồn tại từ trước (bình thường)."

# ─── 5. Thông tin Admin ───────────────────────────────────────────────────────
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

# ─── 6. Google Drive (tùy chọn) ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ GOOGLE DRIVE (tùy chọn) ━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Bỏ qua nếu chưa có — có thể cập nhật file .env sau${NC}"
echo ""

read -rp "Google Client ID     (Enter để bỏ qua): " GOOGLE_CLIENT_ID
read -rp "Google Client Secret (Enter để bỏ qua): " GOOGLE_CLIENT_SECRET

# ─── 7. Host của server ──────────────────────────────────────────────────────
echo ""
read -rp "IP hoặc domain của server này (vd: 192.168.1.100 hoặc studio.example.com): " SERVER_HOST
SERVER_HOST="${SERVER_HOST:-localhost}"

# ─── 8. Tạo JWT Secret ───────────────────────────────────────────────────────
JWT_SECRET=$(cat /dev/urandom | tr -dc 'A-Za-z0-9!@#%^&*' | head -c 48 2>/dev/null || \
             echo "lumiere-$(date +%s)-$(hostname | sha256sum | head -c 24)")

# ─── 9. Tìm Docker network của postgres_db ───────────────────────────────────
PG_NETWORK=$(docker inspect postgres_db \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' \
  2>/dev/null | head -1)

if [[ -z "$PG_NETWORK" ]]; then
  warn "Không tìm được network của postgres_db — dùng host.docker.internal"
  PG_NETWORK=""
  DB_HOST="host.docker.internal"
else
  info "postgres_db đang dùng network: $PG_NETWORK"
  # Lấy IP của postgres_db trong network đó
  DB_HOST=$(docker inspect postgres_db \
    --format "{{(index .NetworkSettings.Networks \"${PG_NETWORK}\").IPAddress}}" \
    2>/dev/null || echo "host.docker.internal")
  [[ -z "$DB_HOST" ]] && DB_HOST="host.docker.internal"
fi

DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${DB_HOST}:5432/${PG_DBNAME}"

# ─── 10. Ghi file .env ───────────────────────────────────────────────────────
info "Tạo file .env..."
cat > .env <<EOF
# Lumière Studio — tự động tạo bởi setup-ubuntu.sh
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=http://${SERVER_HOST}:9200/api/auth/google/callback
NODE_ENV=production
PORT=9200
STATIC_DIR=/app/public
EOF
success "File .env đã được tạo."

# ─── 11. Build Docker image ───────────────────────────────────────────────────
echo ""
info "Build Docker image Lumière (lần đầu mất 5–15 phút)..."
docker build -t lumiere-studio:latest . 2>&1 | \
  grep -E "(Step|=>|Successfully built|error|ERROR|warning)" || true
success "Build hoàn tất."

# ─── 12. Khởi động container ─────────────────────────────────────────────────
echo ""
info "Khởi động Lumière Studio..."

NETWORK_ARG=""
[[ -n "$PG_NETWORK" ]] && NETWORK_ARG="--network $PG_NETWORK"

docker run -d \
  --name lumiere-studio \
  --restart unless-stopped \
  -p 9200:9200 \
  $NETWORK_ARG \
  --add-host=host.docker.internal:host-gateway \
  --env-file .env \
  lumiere-studio:latest

# Chờ container sẵn sàng
info "Chờ service khởi động..."
for i in {1..20}; do
  sleep 3
  if docker ps --format '{{.Names}} {{.Status}}' | grep "lumiere-studio" | grep -q "Up"; then
    break
  fi
  echo -n "."
done
echo ""

docker ps --format '{{.Names}} {{.Status}}' | grep "lumiere-studio" | grep -q "Up" || \
  error "Container không khởi động được. Xem log: docker logs lumiere-studio"
success "Container đang chạy."

# ─── 13. Tạo tài khoản Admin ─────────────────────────────────────────────────
echo ""
info "Tạo tài khoản Admin..."
sleep 3

docker exec \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e DATABASE_URL="$DATABASE_URL" \
  lumiere-studio \
  node /app/dist/create-admin.mjs && \
  success "Tài khoản Admin: $ADMIN_EMAIL" || \
  warn "Chưa tạo được admin tự động — chạy thủ công: bash scripts/make-admin.sh"

# ─── 14. Kiểm tra API ────────────────────────────────────────────────────────
echo ""
info "Kiểm tra API..."
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9200/api/health" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  success "API OK (HTTP 200)."
else
  warn "API chưa phản hồi (HTTP $STATUS) — có thể vẫn đang khởi động. Thử lại: curl http://localhost:9200/api/health"
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
echo "  Xem log:          docker logs -f lumiere-studio"
echo "  Dừng app:         docker stop lumiere-studio"
echo "  Khởi động lại:    docker start lumiere-studio"
echo "  Tạo lại Admin:    bash scripts/make-admin.sh"
echo "  Cập nhật app:     bash update.sh"
echo ""
echo -e "${YELLOW}  Lưu ý: File .env chứa thông tin kết nối — không chia sẻ công khai.${NC}"
echo ""
