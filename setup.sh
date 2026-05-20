#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Lumière Studio — Script cài đặt tự động cho Synology NAS
#  Copy toàn bộ file vào /volume1/docker/lumiere rồi chạy: bash setup.sh
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

# ─── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Lumière Studio — Cài đặt tự động      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Kiểm tra Docker ──────────────────────────────────────────────────────
info "Kiểm tra Docker..."
command -v docker &>/dev/null  || error "Docker chưa được cài. Hãy cài Container Manager trên DSM."
docker compose version &>/dev/null || error "'docker compose' không khả dụng. Hãy nâng cấp Docker."
success "Docker sẵn sàng."

# ─── 2. Chọn chế độ PostgreSQL ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ CHỌN CHẾ ĐỘ POSTGRESQL ━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  1) Dùng PostgreSQL riêng trong Docker"
echo "     (Khuyên dùng — không cần biết mật khẩu PostgreSQL cũ)"
echo ""
echo "  2) Dùng PostgreSQL đang chạy trên NAS"
echo "     (Cần biết thông tin kết nối)"
echo ""
read -rp "Chọn (1 hoặc 2, mặc định = 1): " PG_MODE
PG_MODE="${PG_MODE:-1}"

USE_DOCKER_PG=false
PG_COMPOSE_PROFILE=""

if [[ "$PG_MODE" == "1" ]]; then
  USE_DOCKER_PG=true
  PG_COMPOSE_PROFILE="--profile with-postgres"
  success "Sẽ dùng PostgreSQL trong Docker."

  PG_DBNAME="lumiere_db"
  PG_USER="lumiere_user"
  echo ""
  read -rp "Đặt mật khẩu cho database Lumière (bất kỳ): " PG_PASS
  [[ -z "$PG_PASS" ]] && error "Mật khẩu không được để trống."
  # Container kết nối nội bộ qua tên service
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DBNAME}"

else
  # ── Chế độ 2: PostgreSQL trên NAS ──
  echo ""
  echo -e "${BOLD}━━━ THÔNG TIN POSTGRESQL TRÊN NAS ━━━━━━━━━━━━${NC}"

  read -rp "Host PostgreSQL (để trống = 127.0.0.1): " PG_HOST
  PG_HOST="${PG_HOST:-127.0.0.1}"

  read -rp "Port PostgreSQL (để trống = 5432): " PG_PORT
  PG_PORT="${PG_PORT:-5432}"

  read -rp "Tên database cho Lumière (để trống = lumiere_db): " PG_DBNAME
  PG_DBNAME="${PG_DBNAME:-lumiere_db}"

  read -rp "Tên user PostgreSQL cho Lumière (để trống = lumiere_user): " PG_USER
  PG_USER="${PG_USER:-lumiere_user}"

  read -rsp "Mật khẩu cho user '$PG_USER': " PG_PASS; echo ""
  [[ -z "$PG_PASS" ]] && error "Mật khẩu không được để trống."

  # Docker container kết nối ra ngoài qua host.docker.internal
  DOCKER_PG_HOST="host.docker.internal"
  [[ "$PG_HOST" != "localhost" && "$PG_HOST" != "127.0.0.1" ]] && DOCKER_PG_HOST="$PG_HOST"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${DOCKER_PG_HOST}:${PG_PORT}/${PG_DBNAME}"

  # Khởi tạo DB trên PostgreSQL NAS
  _setup_nas_postgres
fi

# ─── Hàm khởi tạo PostgreSQL NAS ─────────────────────────────────────────────
_setup_nas_postgres() {
  info "Tìm lệnh psql trên NAS..."
  PSQL=""
  for p in psql /usr/bin/psql /usr/local/bin/psql \
            /var/packages/PostgreSQL/target/bin/psql \
            /volume1/@appstore/PostgreSQL14/target/bin/psql \
            /volume1/@appstore/PostgreSQL15/target/bin/psql \
            /volume1/@appstore/PostgreSQL16/target/bin/psql; do
    if [[ -x "$p" ]] || command -v "$p" &>/dev/null; then
      PSQL="$p"; break
    fi
  done

  if [[ -z "$PSQL" ]]; then
    warn "Không tìm thấy psql. Dùng Docker để chạy schema SQL..."
    PSQL="docker run --rm --add-host=host.docker.internal:host-gateway postgres:16-alpine psql"
    PG_RUN_HOST="host.docker.internal"
  else
    PG_RUN_HOST="$PG_HOST"
    success "Tìm thấy psql: $PSQL"
  fi

  # Thử tạo user/db với các phương thức xác thực khác nhau
  info "Tạo user và database..."

  _psql_admin() {
    PGPASSWORD="${PG_ADMIN_PASS:-}" $PSQL \
      -h "$PG_RUN_HOST" -p "$PG_PORT" -U "${PG_ADMIN_USER:-postgres}" -d postgres \
      -c "$1" 2>&1 | grep -v "^$" || true
  }

  # Thử peer auth (không cần mật khẩu)
  if su - postgres -s /bin/sh -c "$PSQL -c 'SELECT 1'" &>/dev/null 2>&1; then
    info "Dùng peer authentication (postgres user)..."
    su - postgres -s /bin/sh -c "
      $PSQL -c \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}'\" 2>/dev/null || true
      $PSQL -c \"CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER}\" 2>/dev/null || true
      $PSQL -c \"GRANT ALL PRIVILEGES ON DATABASE ${PG_DBNAME} TO ${PG_USER}\"
      $PSQL -d ${PG_DBNAME} -f '$SCRIPT_DIR/scripts/init-db.sql'
    " && success "Database đã được khởi tạo qua peer auth." && return

  else
    # Peer auth thất bại, hỏi thông tin admin
    echo ""
    warn "Cần thông tin PostgreSQL admin để tạo database."
    read -rp "  User admin PostgreSQL (thường là 'postgres'): " PG_ADMIN_USER
    PG_ADMIN_USER="${PG_ADMIN_USER:-postgres}"
    read -rsp "  Mật khẩu của '$PG_ADMIN_USER' (Enter nếu không có): " PG_ADMIN_PASS; echo ""

    _psql_admin "DO \$\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${PG_USER}') THEN
        CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
      ELSE
        ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';
      END IF;
    END\$\$;"

    _psql_admin "SELECT 'CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER}'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${PG_DBNAME}')\gexec" || true

    _psql_admin "GRANT ALL PRIVILEGES ON DATABASE ${PG_DBNAME} TO ${PG_USER};" || true

    # Chạy schema
    if [[ "$PSQL" == docker* ]]; then
      PGPASSWORD="$PG_PASS" $PSQL \
        "postgresql://${PG_USER}:${PG_PASS}@${PG_RUN_HOST}:${PG_PORT}/${PG_DBNAME}" \
        -f /dev/stdin < "$SCRIPT_DIR/scripts/init-db.sql" && \
        success "Schema đã được tạo." || warn "Có lỗi khi tạo schema — kiểm tra kết nối."
    else
      PGPASSWORD="$PG_PASS" $PSQL \
        -h "$PG_RUN_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DBNAME" \
        -f "$SCRIPT_DIR/scripts/init-db.sql" && \
        success "Schema đã được tạo." || warn "Có lỗi khi tạo schema — kiểm tra kết nối."
    fi
  fi
}

# ─── 3. Thông tin Admin ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ TÀI KHOẢN ADMIN ━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

read -rp "Email Admin: " ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && error "Email không được để trống."

while true; do
  read -rsp "Mật khẩu Admin (ít nhất 8 ký tự): " ADMIN_PASSWORD; echo ""
  [[ ${#ADMIN_PASSWORD} -ge 8 ]] && break
  warn "Mật khẩu quá ngắn. Nhập lại."
done

# ─── 4. Thông tin Google Drive & NAS ─────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ GOOGLE DRIVE (tùy chọn) ━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Bỏ qua nếu chưa có — có thể cập nhật file .env sau${NC}"

read -rp "Google Client ID (Enter để bỏ qua): " GOOGLE_CLIENT_ID
read -rp "Google Client Secret (Enter để bỏ qua): " GOOGLE_CLIENT_SECRET

echo ""
read -rp "IP hoặc domain của NAS (vd: 192.168.1.100): " NAS_HOST
NAS_HOST="${NAS_HOST:-localhost}"

# ─── 5. Tạo JWT Secret ───────────────────────────────────────────────────────
JWT_SECRET=$(tr -dc 'A-Za-z0-9!@#$%^&*' </dev/urandom 2>/dev/null | head -c 48 || \
             echo "lumiere-secret-$(date +%s%N | sha256sum | head -c 32)")

# ─── 6. Ghi file .env ────────────────────────────────────────────────────────
info "Tạo file .env..."
cat > .env <<EOF
DATABASE_URL=${DATABASE_URL}
PG_DBNAME=${PG_DBNAME:-lumiere_db}
PG_USER=${PG_USER:-lumiere_user}
PG_PASS=${PG_PASS}
JWT_SECRET=${JWT_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=http://${NAS_HOST}:9200/api/auth/google/callback
EOF
success "File .env đã được tạo."

# ─── 7. Build Docker image ───────────────────────────────────────────────────
echo ""
info "Build Docker image (lần đầu mất 5–15 phút)..."
docker compose $PG_COMPOSE_PROFILE build 2>&1 | \
  grep -E "(\[|Step|=>|Successfully|ERROR|error)" || true
success "Build hoàn tất."

# ─── 8. Khởi động ────────────────────────────────────────────────────────────
echo ""
info "Khởi động Lumière Studio..."
docker compose $PG_COMPOSE_PROFILE up -d

# Đợi container sẵn sàng
info "Chờ service khởi động..."
for i in {1..20}; do
  sleep 3
  if docker compose ps | grep "lumiere-studio" | grep -q "Up"; then
    break
  fi
  echo -n "."
done
echo ""

docker compose ps | grep "lumiere-studio" | grep -q "Up" || \
  error "Container không khởi động được. Chạy 'docker compose logs' để xem lỗi."
success "Container đang chạy."

# ─── 9. Schema cho Docker PostgreSQL ─────────────────────────────────────────
# (init-db.sql đã được mount vào docker-entrypoint-initdb.d, tự động chạy)
# Không cần làm gì thêm cho chế độ Docker PostgreSQL

# ─── 10. Tạo tài khoản Admin ─────────────────────────────────────────────────
echo ""
info "Tạo tài khoản Admin..."

docker compose exec \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e DATABASE_URL="$DATABASE_URL" \
  lumiere node /app/dist/create-admin.mjs && \
  success "Tài khoản Admin: $ADMIN_EMAIL" || \
  warn "Chưa tạo được admin — thử lại sau: bash scripts/make-admin.sh"

# ─── 11. Kiểm tra ────────────────────────────────────────────────────────────
echo ""
info "Kiểm tra API..."
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9200/api/health" 2>/dev/null || echo "000")
[[ "$STATUS" == "200" ]] && success "API OK (HTTP 200)." || \
  warn "API chưa phản hồi (HTTP $STATUS) — có thể vẫn đang khởi động."

# ─── Kết quả ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║          CÀI ĐẶT HOÀN TẤT!                  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐  App:    ${BOLD}http://${NAS_HOST}:9200${NC}"
echo -e "  🔐  Login:  ${BOLD}http://${NAS_HOST}:9200/login${NC}"
echo -e "  📧  Admin:  ${BOLD}${ADMIN_EMAIL}${NC}"
if [[ "$USE_DOCKER_PG" == "true" ]]; then
echo ""
echo -e "  🐘  PostgreSQL chạy trong Docker, dữ liệu lưu tại volume: lumiere_pgdata"
fi
echo ""
echo "  Xem log:       docker compose logs -f"
echo "  Dừng app:      docker compose $PG_COMPOSE_PROFILE down"
echo "  Cập nhật app:  bash update.sh"
echo ""
