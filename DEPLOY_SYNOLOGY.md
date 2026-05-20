# Hướng dẫn cài đặt Lumière trên Synology NAS

App chạy toàn bộ ở **port 9001**, dùng PostgreSQL đã có sẵn trên NAS.

---

## Yêu cầu

- Synology NAS có **Container Manager** (DSM 7.2+) hoặc Docker đã cài
- PostgreSQL đang chạy trên NAS (bạn đã có)
- Git (tùy chọn — hoặc tải ZIP từ Replit)

---

## Bước 1 — Chuẩn bị PostgreSQL

Kết nối vào PostgreSQL trên NAS qua SSH và tạo database + user riêng cho Lumière:

```sql
CREATE DATABASE lumiere_db;
CREATE USER lumiere_user WITH PASSWORD 'mat_khau_cua_ban';
GRANT ALL PRIVILEGES ON DATABASE lumiere_db TO lumiere_user;
```

> **Lưu ý:** PostgreSQL của bạn phải cho phép kết nối từ Docker container.  
> Kiểm tra file `pg_hba.conf` — thêm dòng sau nếu chưa có:
> ```
> host  all  all  172.17.0.0/16  md5
> ```
> Sau đó restart PostgreSQL.

---

## Bước 2 — Tải code về NAS

### Cách 1: Dùng Git (SSH vào NAS)
```bash
ssh admin@NAS_IP
cd /volume1  # hoặc thư mục bạn muốn
git clone <URL_REPLIT_PROJECT> lumiere
cd lumiere
```

### Cách 2: Tải ZIP
- Vào Replit → nút **⋮** → **Download as ZIP**
- Upload lên NAS qua File Station vào thư mục `/volume1/lumiere`
- Giải nén

---

## Bước 3 — Tạo file .env

```bash
cd /volume1/lumiere
cp .env.example .env
nano .env
```

Điền thông tin thực tế:

```env
DATABASE_URL=postgresql://lumiere_user:mat_khau_cua_ban@host.docker.internal:5432/lumiere_db
JWT_SECRET=nhap-chuoi-bi-mat-bat-ky-dai-it-nhat-32-ky-tu
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_REDIRECT_URI=http://192.168.1.xxx:9001/api/auth/google/callback
```

> `host.docker.internal` là địa chỉ đặc biệt để container kết nối ra NAS host.

---

## Bước 4 — Build và chạy với Docker

```bash
cd /volume1/lumiere

# Build image (lần đầu mất ~5-10 phút)
docker compose build

# Chạy app
docker compose up -d
```

Kiểm tra app đang chạy:
```bash
docker compose logs -f
```

---

## Bước 5 — Khởi tạo database

Lần đầu chạy, cần tạo schema:

```bash
docker compose exec lumiere sh -c "cd /app && node -e \"
import { drizzle } from 'drizzle-orm/node-postgres';
\" "
```

Hoặc đơn giản hơn — chạy lệnh push từ máy tính (nếu bạn có Node.js):

```bash
# Trên máy tính của bạn, trong thư mục project
DATABASE_URL="postgresql://lumiere_user:mat_khau@NAS_IP:5432/lumiere_db" \
  pnpm --filter @workspace/db push
```

---

## Bước 6 — Tạo tài khoản Admin

Sau khi app chạy, kết nối vào PostgreSQL và tạo admin:

```bash
# SSH vào NAS
psql -U lumiere_user -d lumiere_db
```

```sql
-- Tạo admin (password hash bên dưới = "admin123" — đổi ngay sau khi đăng nhập)
INSERT INTO admin_users (id, email, password_hash)
VALUES (
  gen_random_uuid(),
  'admin@studio.com',
  '$2b$10$rBnTSMRkyNLJN5MlTqDJeOqV2zHmVfIWZlxnXgBuExhc0nTaVBYrS'
);
```

> Sau khi đăng nhập, hãy đổi mật khẩu ngay.

---

## Truy cập

| Trang | URL |
|-------|-----|
| App chính | `http://NAS_IP:9001` |
| Trang login | `http://NAS_IP:9001/login` |
| API health | `http://NAS_IP:9001/api/health` |

---

## Cập nhật app

```bash
cd /volume1/lumiere
git pull
docker compose build
docker compose up -d
```

---

## Các lệnh hữu ích

```bash
# Xem log
docker compose logs -f lumiere

# Dừng app
docker compose down

# Restart
docker compose restart lumiere

# Vào shell container
docker compose exec lumiere sh
```

---

## Mở port qua router (nếu muốn truy cập từ Internet)

Vào router → Port Forwarding → thêm rule:
- External port: `9001`  
- Internal IP: IP của NAS
- Internal port: `9001`

---

## Lưu ý về Google Drive

Khi đăng ký Google OAuth, thêm Authorized Redirect URI:
```
http://NAS_IP:9001/api/auth/google/callback
```
Hoặc nếu có domain:
```
https://domain.cua.ban/api/auth/google/callback
```
