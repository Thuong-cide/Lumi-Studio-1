# Hướng dẫn tích hợp Gửi Link Album qua Zalo (via n8n)

Lumière Studio không gửi Zalo trực tiếp — thay vào đó app gửi **webhook đến n8n** của bạn, và n8n chịu trách nhiệm gửi tin nhắn Zalo cho khách.

---

## 1. Cài đặt n8n

Nếu chưa có n8n, cài trên máy Ubuntu:

```bash
npm install -g n8n
n8n start
```

Hoặc dùng Docker:

```bash
docker run -d --name n8n -p 5678:5678 n8nio/n8n
```

Truy cập: `http://localhost:5678`

---

## 2. Tạo Workflow nhận Webhook trong n8n

1. Tạo workflow mới
2. Thêm node **Webhook**:
   - Method: `POST`
   - Path: `lumiere-notify` (tùy chọn)
   - Authentication: None (hoặc Header Auth nếu dùng Webhook Secret)
3. **Copy Webhook URL** (dạng: `http://your-n8n:5678/webhook/lumiere-notify`)
4. Dán URL này vào phần **Cài đặt > Cấu hình Webhook n8n** trong Lumière Studio

---

## 3. Cấu trúc Payload từ Lumière

App sẽ gửi POST request với JSON body như sau:

```json
{
  "event": "album.ready",
  "albumId": "uuid-cua-album",
  "albumSlug": "wedding-mai-tuan-2026",
  "galleryUrl": "https://lumiere.yourdomain.com/album/wedding-mai-tuan-2026",
  "customerPhone": "0987654321",
  "studioId": "uuid-cua-studio",
  "timestamp": "2026-06-13T10:00:00.000Z"
}
```

Trong n8n, các giá trị này có thể lấy qua `{{ $json.galleryUrl }}`, `{{ $json.customerPhone }}`, v.v.

---

## 4. Verify HMAC Signature (Tuỳ chọn, khuyến nghị)

Nếu bạn điền **Webhook Secret** trong Lumière, mỗi request sẽ có header:

```
X-Lumiere-Signature: <hex string>
```

Đây là HMAC-SHA256 của body JSON, ký bằng secret của bạn. Trong n8n, dùng **Code node** để verify:

```javascript
const crypto = require('crypto');

const secret = 'webhook-secret-cua-ban';
const body = JSON.stringify($input.first().json);
const expected = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

const received = $input.first().headers['x-lumiere-signature'];

if (received !== expected) {
  throw new Error('Invalid signature');
}

return $input.all();
```

---

## 5. Gửi tin nhắn Zalo bằng node Zalo cá nhân (zca-js)

Cài **zca-js** trên máy n8n:

```bash
npm install zca-js
```

Trong n8n **Code node** (sau webhook):

```javascript
const { Zalo } = require('zca-js');

// Khởi tạo (đăng nhập bằng cookie từ Zalo Web)
const zalo = new Zalo();
await zalo.login({ cookie: /* json cookie của bạn */ });

const phone = $json.customerPhone;   // "0987654321"
const galleryUrl = $json.galleryUrl; // "https://..."

// Tìm uid từ số điện thoại
const user = await zalo.findUser(phone);
if (!user) throw new Error(`Không tìm thấy user Zalo với số ${phone}`);

// Gửi tin
await zalo.sendMessage(
  { text: `Xin chào! Album ảnh của bạn đã sẵn sàng 🎉\nXem và chọn ảnh tại: ${galleryUrl}` },
  user.uid
);

return [{ json: { sent: true, to: phone } }];
```

> **Lưu ý:** zca-js hoạt động bằng cách giả lập Zalo Web. Sử dụng tài khoản Zalo riêng cho mục đích nghiệp vụ, không dùng tài khoản cá nhân chính.

---

## 6. Luồng hoàn chỉnh trong Lumière

1. Vào **Cài đặt → Cấu hình Webhook n8n** → dán URL webhook, lưu lại
2. Mở album → điền **Số điện thoại khách hàng** → bật **Tự động gửi khi publish**
3. Khi bấm **Publish Album**, app tự gọi webhook → n8n nhận → gửi Zalo cho khách
4. Hoặc bấm nút **Gửi link cho khách ngay** để gửi thủ công bất kỳ lúc nào

---

## 7. Test webhook thủ công

```bash
curl -X POST http://your-n8n:5678/webhook/lumiere-notify \
  -H "Content-Type: application/json" \
  -d '{
    "event": "album.ready",
    "albumId": "test-123",
    "albumSlug": "test-album",
    "galleryUrl": "https://lumiere.example.com/album/test-album",
    "customerPhone": "0987654321",
    "studioId": "studio-xyz",
    "timestamp": "2026-06-13T10:00:00.000Z"
  }'
```
