import { Router } from "express";
import { db } from "@workspace/db";
import { studiosTable, albumsTable, selectionsTable, photosTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth, hashPassword, getErrorStatus } from "../lib/auth";
import { slugify } from "../lib/utils";
import { createFolder } from "../lib/google-drive";
import { logger } from "../lib/logger";

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

router.get("/studios/albums", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const albums = await db.select().from(albumsTable).where(eq(albumsTable.studioId, payload.id)).orderBy(albumsTable.createdAt);

    const albumsWithCounts = await Promise.all(
      albums.map(async (album) => {
        const [photoCountResult] = await db.select({ count: count() }).from(photosTable).where(eq(photosTable.albumId, album.id));
        const [selectionCountResult] = await db.select({ count: count() }).from(selectionsTable).where(eq(selectionsTable.albumId, album.id));
        return {
          ...album,
          photoCount: Number(photoCountResult.count),
          selectionCount: Number(selectionCountResult.count),
          createdAt: album.createdAt.toISOString(),
          updatedAt: album.updatedAt.toISOString(),
        };
      })
    );

    res.json({ albums: albumsWithCounts });
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

    res.status(201).json({ album: { ...album, photoCount: 0, selectionCount: 0, createdAt: album.createdAt.toISOString(), updatedAt: album.updatedAt.toISOString() } });
  } catch (e: unknown) {
    logger.error(e, "[CREATE ALBUM]");
    const msg = e instanceof Error ? e.message : "Lỗi server";
    res.status(500).json({ error: msg });
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
    const photos = await db.select().from(photosTable).where(eq(photosTable.albumId, id)).orderBy(photosTable.order);
    const [selectionCountResult] = await db.select({ count: count() }).from(selectionsTable).where(eq(selectionsTable.albumId, id));
    res.json({
      album: {
        ...album,
        photos: photos.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
        selectionCount: Number(selectionCountResult.count),
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
