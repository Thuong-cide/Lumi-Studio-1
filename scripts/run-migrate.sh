#!/bin/bash
# Lumière — Cập nhật schema database lên phiên bản mới nhất
# Chạy lệnh: bash scripts/run-migrate.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
error()   { echo -e "${RED}[LỖI]${NC}  $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  error "Không tìm thấy file .env. Hãy chạy setup-ubuntu.sh trước."
fi

source .env

# Lấy thông tin từ DATABASE_URL
# postgresql://user:pass@host:port/dbname
PG_USER=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
PG_PASS=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
PG_DBNAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Lumière Studio — Cập nhật schema DB      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "Database: $PG_DBNAME  |  User: $PG_USER"
echo ""

info "Đang chạy migrate..."
docker exec -i \
  -e PGPASSWORD="$PG_PASS" \
  postgres_db \
  psql -U "$PG_USER" -d "$PG_DBNAME" \
  < "$SCRIPT_DIR/scripts/migrate-db.sql" && \
  success "Schema đã được cập nhật." || \
  error "Có lỗi khi migrate. Kiểm tra lại kết nối database."

echo ""
success "Migrate hoàn tất!"
echo ""
echo "  Khởi động lại app để áp dụng:"
echo "    docker restart lumiere-studio"
echo ""
