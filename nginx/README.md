# Nginx Reverse Proxy cho Lumière Studio

## Yêu cầu

- Nginx >= 1.18
- PM2 đang chạy API server trên cổng 8080
- React build đã có tại `artifacts/lumiere/dist/`

## Cách deploy

```bash
# 1. Copy config
sudo cp nginx/lumi.conf /etc/nginx/sites-available/lumi

# 2. Sửa server_name thành IP hoặc domain thực của máy
sudo nano /etc/nginx/sites-available/lumi

# 3. Sửa đường dẫn root nếu project không nằm tại /home/ubuntu/lumi-studio/
#    Tìm dòng: root /home/ubuntu/lumi-studio/artifacts/lumiere/dist;
#    Thay thành đường dẫn thực tế

# 4. Enable site
sudo ln -s /etc/nginx/sites-available/lumi /etc/nginx/sites-enabled/lumi

# 5. Xóa config default nếu cần
sudo rm -f /etc/nginx/sites-enabled/default

# 6. Test config và reload
sudo nginx -t
sudo systemctl reload nginx

# 7. Tự chạy khi khởi động
sudo systemctl enable nginx
```

## Build frontend trước khi deploy

```bash
pnpm --filter @workspace/lumiere run build
```

## Khởi động API với PM2

```bash
# Build API
pnpm --filter @workspace/api-server run build

# Start với PM2
pm2 start ecosystem.config.cjs --env production

# Tự khởi động khi reboot
pm2 startup
pm2 save
```

## Kiểm tra trạng thái

```bash
pm2 status          # Xem workers
pm2 logs lumi-api   # Xem logs
pm2 monit           # Monitor realtime
nginx -t            # Kiểm tra config nginx
```
