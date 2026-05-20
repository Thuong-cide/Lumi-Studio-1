import { Router } from "express";
import { db } from "@workspace/db";
import { studiosTable, albumsTable, photosTable, selectionsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth, getErrorStatus, hashPassword } from "../lib/auth";

const router = Router();

router.get("/admin/stats", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const [totalStudios, pendingStudios, approvedStudios, totalAlbums, totalPhotos, totalSelections] = await Promise.all([
      db.select({ count: count() }).from(studiosTable).then(r => r[0].count),
      db.select({ count: count() }).from(studiosTable).where(eq(studiosTable.status, "PENDING")).then(r => r[0].count),
      db.select({ count: count() }).from(studiosTable).where(eq(studiosTable.status, "APPROVED")).then(r => r[0].count),
      db.select({ count: count() }).from(albumsTable).then(r => r[0].count),
      db.select({ count: count() }).from(photosTable).then(r => r[0].count),
      db.select({ count: count() }).from(selectionsTable).where(eq(selectionsTable.selected, true)).then(r => r[0].count),
    ]);
    res.json({ totalStudios, pendingStudios, approvedStudios, totalAlbums, totalPhotos, totalSelections });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/admin/studios", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const statusParam = req.query.status as string | undefined;

    let query = db.select({
      id: studiosTable.id,
      name: studiosTable.name,
      email: studiosTable.email,
      phone: studiosTable.phone,
      status: studiosTable.status,
      createdAt: studiosTable.createdAt,
      updatedAt: studiosTable.updatedAt,
    }).from(studiosTable).$dynamic();

    if (statusParam && ["PENDING", "APPROVED", "DISABLED"].includes(statusParam)) {
      query = query.where(eq(studiosTable.status, statusParam as "PENDING" | "APPROVED" | "DISABLED"));
    }

    const studios = await query.orderBy(studiosTable.createdAt);

    const studiosWithCount = await Promise.all(
      studios.map(async (studio) => {
        const [albumCountResult] = await db.select({ count: count() }).from(albumsTable).where(eq(albumsTable.studioId, studio.id));
        return {
          ...studio,
          albumCount: Number(albumCountResult.count),
          googleDriveConnected: false,
          createdAt: studio.createdAt.toISOString(),
          updatedAt: studio.updatedAt.toISOString(),
        };
      })
    );

    res.json({ studios: studiosWithCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.patch("/admin/studios/:id", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;
    if (!["PENDING", "APPROVED", "DISABLED"].includes(status)) {
      res.status(400).json({ error: "Trạng thái không hợp lệ" });
      return;
    }
    const [studio] = await db.update(studiosTable)
      .set({ status })
      .where(eq(studiosTable.id, id))
      .returning({ id: studiosTable.id, name: studiosTable.name, email: studiosTable.email, status: studiosTable.status, createdAt: studiosTable.createdAt, updatedAt: studiosTable.updatedAt });
    res.json({ studio: { ...studio, albumCount: 0, googleDriveConnected: false, createdAt: studio.createdAt.toISOString(), updatedAt: studio.updatedAt.toISOString() } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.post("/admin/studios/:id/reset-password", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 8 ký tự" });
      return;
    }
    const [studio] = await db.select({ id: studiosTable.id }).from(studiosTable).where(eq(studiosTable.id, id));
    if (!studio) {
      res.status(404).json({ error: "Không tìm thấy studio" });
      return;
    }
    await db.update(studiosTable)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(studiosTable.id, id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.delete("/admin/studios/:id", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await db.delete(studiosTable).where(eq(studiosTable.id, id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

export default router;
