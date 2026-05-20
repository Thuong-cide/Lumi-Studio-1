#!/bin/bash
# Lumière Studio — Script cập nhật
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }

cd "$(dirname "${BASH_SOURCE[0]}")"

echo -e "${BOLD}Lumière Studio — Cập nhật${NC}"
echo ""

info "Build image mới..."
docker compose build --progress=plain 2>&1 | grep -E "(Step|---|\[|Successfully|=>|ERROR)" || true

info "Khởi động lại container..."
docker compose up -d

success "Cập nhật hoàn tất! App đang chạy tại cổng 9200."
echo ""
echo "Xem log: docker compose logs -f"
