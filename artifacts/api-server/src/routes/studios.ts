import { Router } from "express";
import { db } from "@workspace/db";
import { studiosTable, albumsTable, selectionsTable, photosTable, selectionConfirmationsTable } from "@workspace/db";
import { eq, count, desc, inArray } from "drizzle-orm";
import { requireAuth, hashPassword, getErrorStatus } from "../lib/auth";
import { slugify } from "../lib/utils";
import { createFolder } from "../lib/google-drive";
import { logger } from "../lib/logger";
import { sendAlbumWebhook } from "../services/webhookNotifier";

const router = Router();

router.patch("/studios/settings", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const { name, password, defaultMaxSelection } = req.body;
    const data: Record<string, unknown> = {};
    if (name?.trim()) data.name = name.trim();
    if (password) {
      if (password.length < 8) {
        res.status(400).json({ error: "Mật khẩu phải có ít nhất 8 ký tự" });
        return;
      }
      data.passwordHash = await hashPassword(password);
    }
    if (defaultMaxSelection !== undefined) {
      data.defaultMaxSelection = Math.max(0, Number(defaultMaxSelection) || 0);
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Không có thông tin cần cập nhật" });
      return;
    }
    await db.update(studiosTable).set(data).where(eq(studiosTable.id, payload.id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.patch("/studios/settings/webhook", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const { n8nWebhookUrl, webhookSecret } = req.body;
    if (!n8nWebhookUrl?.trim()) {
      res.status(400).json({ error: "Vui lòng nhập n8n Webhook URL" });
      return;
    }
    const data: Record<string, unknown> = { n8nWebhookUrl: n8nWebhookUrl.trim() };
    if (webhookSecret !== undefined) {
      data.webhookSecret = webhookSecret.trim() || null;
    }
    await db.update(studiosTable).set(data).where(eq(studiosTable.id, payload.id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

// FIX N+1: Thay vì loop N albums × 2 queries, dùng 2 batch COUNT queries
router.get("/studios/albums", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const albums = await db.select().from(albumsTable)
      .where(eq(albumsTable.studioId, payload.id))
      .orderBy(albumsTable.createdAt);

    if (albums.length === 0) {
      res.json({ albums: [] });
      return;
    }

    const albumIds = albums.map(a => a.id);

    const [photoCounts, selectionCounts] = await Promise.all([
      db.select({ albumId: photosTable.albumId, cnt: count() })
        .from(photosTable)
        .where(inArray(photosTable.albumId, albumIds))
        .groupBy(photosTable.albumId),
      db.select({ albumId: selectionsTable.albumId, cnt: count() })
        .from(selectionsTable)
        .where(inArray(selectionsTable.albumId, albumIds))
        .groupBy(selectionsTable.albumId),
    ]);

    const photoCountMap = Object.fromEntries(photoCounts.map(r => [r.albumId, Number(r.cnt)]));
    const selectionCountMap = Object.fromEntries(selectionCounts.map(r => [r.albumId, Number(r.cnt)]));

    res.json({
      albums: albums.map(album => ({
        ...album,
        photoCount: photoCountMap[album.id] ?? 0,
        selectionCount: selectionCountMap[album.id] ?? 0,
        createdAt: album.createdAt.toISOString(),
        updatedAt: album.updatedAt.toISOString(),
        webhookSentAt: album.webhookSentAt?.toISOString() ?? null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.post("/studios/albums", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const { title, description, maxSelection, allowDownload, allowNotes, isPublic } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "Tên album không được trống" });
      return;
    }

    let slug = slugify(title);
    const [existing] = await db.select().from(albumsTable).where(eq(albumsTable.slug, slug));
    if (existing) slug = `${slug}-${Date.now()}`;

    let driveFolderId: string | undefined;
    const [studio] = await db.select({ googleDriveRefreshToken: studiosTable.googleDriveRefreshToken, rootFolderId: studiosTable.rootFolderId }).from(studiosTable).where(eq(studiosTable.id, payload.id));
    if (studio?.googleDriveRefreshToken && studio.rootFolderId) {
      try {
        driveFolderId = await createFolder(studio.googleDriveRefreshToken, title.trim(), studio.rootFolderId);
      } catch (driveErr) {
        logger.error(driveErr, "[CREATE FOLDER]");
      }
    }

    const [album] = await db.insert(albumsTable).values({
      studioId: payload.id,
      title: title.trim(),
      description: description?.trim() || null,
      slug,
      driveFolderId,
      maxSelection: Number(maxSelection) || 0,
      allowDownload: Boolean(allowDownload),
      allowNotes: allowNotes !== false,
      isPublic: isPublic !== false,
    }).returning();

    res.status(201).json({ album: { ...album, photoCount: 0, selectionCount: 0, webhookSentAt: null, createdAt: album.createdAt.toISOString(), updatedAt: album.updatedAt.toISOString() } });
  } catch (e: unknown) {
    logger.error(e, "[CREATE ALBUM]");
    const msg = e instanceof Error ? e.message : "Lỗi server";
    res.status(500).json({ error: msg });
  }
});

// More specific routes first
router.patch("/studios/albums/:id/notification", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { customerPhone, autoSendEnabled } = req.body;

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (customerPhone !== undefined) {
      const phone = customerPhone?.trim() || null;
      if (phone && !/^0\d{9}$/.test(phone)) {
        res.status(400).json({ error: "Số điện thoại không hợp lệ (phải có 10 số, bắt đầu bằng 0)" });
        return;
      }
      data.customerPhone = phone;
    }
    if (autoSendEnabled !== undefined) {
      data.autoSendEnabled = Boolean(autoSendEnabled);
    }

    await db.update(albumsTable).set(data).where(eq(albumsTable.id, id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.post("/studios/albums/:id/send-notification", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [[album], [studio]] = await Promise.all([
      db.select().from(albumsTable).where(eq(albumsTable.id, id)),
      db.select({
        id: studiosTable.id,
        n8nWebhookUrl: studiosTable.n8nWebhookUrl,
        webhookSecret: studiosTable.webhookSecret,
      }).from(studiosTable).where(eq(studiosTable.id, payload.id)),
    ]);

    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }

    const result = await sendAlbumWebhook(album, studio);

    await db.update(albumsTable).set({
      webhookSentAt: new Date(),
      webhookLastStatus: result.success ? "success" : "failed",
    }).where(eq(albumsTable.id, id));

    if (!result.success) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.put("/studios/albums/:id/publish", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [[album], [studio]] = await Promise.all([
      db.select().from(albumsTable).where(eq(albumsTable.id, id)),
      db.select({
        id: studiosTable.id,
        n8nWebhookUrl: studiosTable.n8nWebhookUrl,
        webhookSecret: studiosTable.webhookSecret,
      }).from(studiosTable).where(eq(studiosTable.id, payload.id)),
    ]);

    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }

    await db.update(albumsTable).set({ isPublic: true }).where(eq(albumsTable.id, id));

    // Auto-send webhook nếu được bật, không block response nếu webhook fail
    if (album.autoSendEnabled) {
      sendAlbumWebhook(album, studio).then(async (result) => {
        await db.update(albumsTable).set({
          webhookSentAt: new Date(),
          webhookLastStatus: result.success ? "success" : "failed",
        }).where(eq(albumsTable.id, id));
      }).catch(err => {
        logger.error(err, "[PUBLISH WEBHOOK]");
      });
    }

    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/studios/albums/:id", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }

    const [photos, [selectionCountResult]] = await Promise.all([
      db.select().from(photosTable).where(eq(photosTable.albumId, id)).orderBy(photosTable.order),
      db.select({ count: count() }).from(selectionsTable).where(eq(selectionsTable.albumId, id)),
    ]);

    res.json({
      album: {
        ...album,
        photos: photos.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
        selectionCount: Number(selectionCountResult.count),
        webhookSentAt: album.webhookSentAt?.toISOString() ?? null,
        createdAt: album.createdAt.toISOString(),
        updatedAt: album.updatedAt.toISOString(),
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.patch("/studios/albums/:id", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { title, description, maxSelection, allowDownload, allowNotes, isPublic } = req.body;
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (maxSelection !== undefined) data.maxSelection = Number(maxSelection);
    if (allowDownload !== undefined) data.allowDownload = Boolean(allowDownload);
    if (allowNotes !== undefined) data.allowNotes = Boolean(allowNotes);
    if (isPublic !== undefined) data.isPublic = Boolean(isPublic);

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }
    await db.update(albumsTable).set(data).where(eq(albumsTable.id, id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/studios/albums/:id/confirmations", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }
    const confirmations = await db
      .select()
      .from(selectionConfirmationsTable)
      .where(eq(selectionConfirmationsTable.albumId, id))
      .orderBy(desc(selectionConfirmationsTable.confirmedAt));
    res.json({
      confirmations: confirmations.map(c => ({
        id: c.id,
        customerName: c.customerName,
        photoCount: c.photoCount,
        snapshot: JSON.parse(c.snapshot),
        confirmedAt: c.confirmedAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.delete("/studios/albums/:id", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }
    await db.delete(albumsTable).where(eq(albumsTable.id, id));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

export default router;
