/**
 * Tạo hoặc cập nhật tài khoản Admin.
 * Chạy bên trong container: node /app/scripts/create-admin.mjs
 * Biến môi trường cần thiết: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 */

import { createRequire } from 'node:module';
globalThis.require = createRequire(import.meta.url);

const { default: bcrypt } = await import('bcryptjs');
const { default: pg }     = await import('pg');

const { Pool } = pg;

const email    = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD?.trim();
const dbUrl    = process.env.DATABASE_URL;

if (!email || !password || !dbUrl) {
  console.error('Thiếu biến môi trường: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Mật khẩu admin phải có ít nhất 8 ký tự');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl, max: 1 });

try {
  const hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO admin_users (id, email, password_hash)
     VALUES (gen_random_uuid(), $1, $2)
     ON CONFLICT (email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
     RETURNING email`,
    [email, hash]
  );

  console.log(`✓ Tài khoản Admin đã sẵn sàng: ${rows[0].email}`);
} finally {
  await pool.end();
}
