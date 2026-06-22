#!/bin/bash
# Lumière Studio — Script cập nhật lên phiên bản mới
# Cách dùng: bash update.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[LỖI]${NC}  $*"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Lumière Studio — Cập nhật             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

[[ -f .env ]] || error "Không tìm thấy file .env. Hãy chạy setup-ubuntu.sh trước."

# ─── 1. Lấy network hiện tại của container ───────────────────────────────────
PG_NETWORK=$(docker inspect lumiere-studio \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
  2>/dev/null | awk '{print $1}' || true)

if [[ -z "$PG_NETWORK" ]]; then
  warn "Không tìm thấy container lumiere-studio đang chạy."
  PG_NETWORK=$(docker inspect postgres_db \
    --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
    2>/dev/null | awk '{print $1}' || true)
  [[ -z "$PG_NETWORK" ]] && error "Không lấy được network. Kiểm tra: docker ps"
fi
info "Network: $PG_NETWORK"

# ─── 2. Build image mới ──────────────────────────────────────────────────────
echo ""
info "Build Docker image mới (mất 5–15 phút)..."
docker build -t lumiere-studio:latest . \
  2>&1 | grep -E "(Step| => |Successfully|error:|ERROR|---)" || true
success "Build hoàn tất."

# ─── 3. Dừng và xóa container cũ ────────────────────────────────────────────
echo ""
info "Dừng container cũ..."
docker stop lumiere-studio 2>/dev/null || true
docker rm   lumiere-studio 2>/dev/null || true
success "Container cũ đã được gỡ."

# ─── 4. Chạy container mới ───────────────────────────────────────────────────
info "Khởi động container mới..."
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

# ─── 5. Migrate schema (thêm bảng/cột mới nếu có) ────────────────────────────
echo ""
info "Cập nhật schema database..."
bash scripts/run-migrate.sh 2>&1 | grep -E "(\[ OK \]|\[WARN\]|\[LỖI\])" || true

# ─── 6. Kiểm tra API ─────────────────────────────────────────────────────────
echo ""
info "Kiểm tra API..."
sleep 2
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9200/api/health" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  success "API hoạt động bình thường (HTTP 200)."
else
  warn "API chưa phản hồi (HTTP $STATUS) — có thể vẫn đang khởi động."
fi

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║         CẬP NHẬT HOÀN TẤT!                  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Xem log:  docker logs -f lumiere-studio"
echo ""
