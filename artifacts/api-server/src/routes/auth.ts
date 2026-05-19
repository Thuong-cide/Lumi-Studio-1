import { Router } from "express";
import { db } from "@workspace/db";
import { studiosTable, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, comparePassword, hashPassword, requireAuth, getTokenFromRequest, verifyToken } from "../lib/auth";
import { getAuthUrl, getTokensFromCode, createFolder } from "../lib/google-drive";
import { logger } from "../lib/logger";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
      return;
    }

    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
    if (admin && (await comparePassword(password, admin.passwordHash))) {
      const token = signToken({ id: admin.id, email: admin.email, role: "ADMIN" });
      res.cookie("lumiere_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7 * 1000,
        path: "/",
      });
      res.json({ success: true, role: "ADMIN" });
      return;
    }

    const [studio] = await db.select().from(studiosTable).where(eq(studiosTable.email, email));
    if (!studio || !(await comparePassword(password, studio.passwordHash))) {
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
      return;
    }
    if (studio.status === "PENDING") {
      res.status(403).json({ error: "Tài khoản đang chờ phê duyệt từ Admin" });
      return;
    }
    if (studio.status === "DISABLED") {
      res.status(403).json({ error: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ Admin." });
      return;
    }

    const token = signToken({ id: studio.id, email: studio.email, role: "STUDIO", status: studio.status });
    res.cookie("lumiere_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7 * 1000,
      path: "/",
    });
    res.json({ success: true, role: "STUDIO", studio: { id: studio.id, name: studio.name } });
  } catch (e) {
    req.log.error(e, "[LOGIN]");
    res.status(500).json({ error: "Lỗi server. Vui lòng thử lại." });
  }
});

router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Mật khẩu phải có ít nhất 8 ký tự" });
      return;
    }
    const [existing] = await db.select().from(studiosTable).where(eq(studiosTable.email, email.toLowerCase().trim()));
    if (existing) {
      res.status(409).json({ error: "Email đã được sử dụng" });
      return;
    }
    await db.insert(studiosTable).values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      status: "PENDING",
    });
    res.status(201).json({ success: true, message: "Đăng ký thành công! Vui lòng chờ Admin phê duyệt." });
  } catch (e) {
    req.log.error(e, "[REGISTER]");
    res.status(500).json({ error: "Lỗi server. Vui lòng thử lại." });
  }
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.clearCookie("lumiere_token", { path: "/" });
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      res.status(401).json({ error: "Token không hợp lệ" });
      return;
    }

    if (payload.role === "ADMIN") {
      const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, payload.id));
      if (!admin) {
        res.status(404).json({ error: "Không tìm thấy tài khoản" });
        return;
      }
      res.json({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      return;
    }

    const [studio] = await db.select({
      id: studiosTable.id,
      name: studiosTable.name,
      email: studiosTable.email,
      status: studiosTable.status,
      googleDriveRefreshToken: studiosTable.googleDriveRefreshToken,
      rootFolderId: studiosTable.rootFolderId,
    }).from(studiosTable).where(eq(studiosTable.id, payload.id));

    if (!studio) {
      res.status(404).json({ error: "Không tìm thấy tài khoản" });
      return;
    }
    res.json({
      user: { id: studio.id, email: studio.email, role: "STUDIO", status: studio.status },
      studio: {
        id: studio.id,
        name: studio.name,
        email: studio.email,
        googleDriveConnected: !!studio.googleDriveRefreshToken,
        rootFolderId: studio.rootFolderId,
      },
    });
  } catch (e) {
    req.log.error(e, "[ME]");
    res.status(500).json({ error: "Lỗi server" });
  }
});

router.get("/auth/google", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const url = getAuthUrl(payload.id);
    res.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    res.status(401).json({ error: msg });
  }
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state: studioId, error } = req.query as Record<string, string>;
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (error) {
    res.redirect(`${BASE_URL}/dashboard/settings/drive?error=access_denied`);
    return;
  }
  if (!code || !studioId) {
    res.redirect(`${BASE_URL}/dashboard/settings/drive?error=invalid_request`);
    return;
  }

  try {
    const [studio] = await db.select().from(studiosTable).where(eq(studiosTable.id, studioId));
    if (!studio) {
      res.redirect(`${BASE_URL}/login`);
      return;
    }

    const { refreshToken } = await getTokensFromCode(code);

    let rootFolderId = studio.rootFolderId;
    if (!rootFolderId) {
      rootFolderId = await createFolder(refreshToken, `Lumière — ${studio.name}`);
    }

    await db.update(studiosTable).set({ googleDriveRefreshToken: refreshToken, rootFolderId }).where(eq(studiosTable.id, studioId));
    res.redirect(`${BASE_URL}/dashboard/settings/drive?success=1`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    logger.error(e, "[GOOGLE CALLBACK]");
    res.redirect(`${BASE_URL}/dashboard/settings/drive?error=${encodeURIComponent(msg)}`);
  }
});

export default router;
