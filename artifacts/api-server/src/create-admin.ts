import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/auth";

const email    = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD?.trim();

if (!email || !password) {
  console.error("Thiếu biến môi trường: ADMIN_EMAIL, ADMIN_PASSWORD");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Mật khẩu admin phải có ít nhất 8 ký tự");
  process.exit(1);
}

const hash = await hashPassword(password);

await db.insert(adminUsersTable)
  .values({ email, passwordHash: hash })
  .onConflictDoUpdate({
    target: adminUsersTable.email,
    set: { passwordHash: hash },
  });

console.log(`✓ Tài khoản Admin đã sẵn sàng: ${email}`);
process.exit(0);
