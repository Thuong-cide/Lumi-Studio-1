#!/bin/bash
# Tạo hoặc đặt lại mật khẩu Admin — chạy bất kỳ lúc nào
# Cách dùng: bash scripts/make-admin.sh

cd "$(dirname "${BASH_SOURCE[0]}")/.."

source .env 2>/dev/null || { echo "Không tìm thấy file .env"; exit 1; }

echo "Tạo / cập nhật tài khoản Admin Lumière"
echo ""
read -rp "Email Admin: " ADMIN_EMAIL
read -rsp "Mật khẩu (ít nhất 8 ký tự): " ADMIN_PASSWORD; echo ""

docker compose exec \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e DATABASE_URL="$DATABASE_URL" \
  lumiere node /app/scripts/create-admin.mjs

echo ""
echo "Xong! Đăng nhập tại http://localhost:9001/login"
