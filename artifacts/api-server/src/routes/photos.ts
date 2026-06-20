import { Router } from "express";
import { db } from "@workspace/db";
import { photosTable, albumsTable, selectionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, getErrorStatus } from "../lib/auth";
import { uploadFileToDrive } from "../lib/google-drive";
import { studiosTable } from "@workspace/db";
import multer from "multer";
import { logger } from "../lib/logger";
import { rateLimit, getClientIp } from "../lib/rate-limit";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/albums/:id/photos", async (req, res): Promise<void> => {
  try {
    requireAuth(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const photos = await db.select().from(photosTable).where(eq(photosTable.albumId, id)).orderBy(photosTable.order);
    res.json({ photos: photos.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.delete("/albums/:id/photos/:photoId", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const photoId = Array.isArray(req.params.photoId) ? req.params.photoId[0] : req.params.photoId;

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }
    const [photo] = await db.select().from(photosTable).where(eq(photosTable.id, photoId));
    if (!photo || photo.albumId !== id) {
      res.status(404).json({ error: "Không tìm thấy ảnh" });
      return;
    }
    await db.delete(photosTable).where(eq(photosTable.id, photoId));
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/albums/:id/selections", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Không tìm thấy album" });
      return;
    }
    const selections = await db.select({
      id: selectionsTable.id,
      albumId: selectionsTable.albumId,
      photoId: selectionsTable.photoId,
      customerName: selectionsTable.customerName,
      note: selectionsTable.note,
      selected: selectionsTable.selected,
      createdAt: selectionsTable.createdAt,
      updatedAt: selectionsTable.updatedAt,
      photo: {
        id: photosTable.id,
        albumId: photosTable.albumId,
        driveFileId: photosTable.driveFileId,
        filename: photosTable.filename,
        mimeType: photosTable.mimeType,
        thumbnailUrl: photosTable.thumbnailUrl,
        width: photosTable.width,
        height: photosTable.height,
        order: photosTable.order,
        createdAt: photosTable.createdAt,
      },
    })
    .from(selectionsTable)
    .leftJoin(photosTable, eq(selectionsTable.photoId, photosTable.id))
    .where(eq(selectionsTable.albumId, id))
    .orderBy(selectionsTable.customerName, selectionsTable.createdAt);

    res.json({
      selections: selections
        .filter(s => s.selected)
        .map(s => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          photo: s.photo ? { ...s.photo, createdAt: s.photo.createdAt.toISOString() } : null,
        }))
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.post("/drive/upload", upload.single("file"), async (req, res): Promise<void> => {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`upload:${ip}`, { windowMs: 60_000, max: 30 });
    if (!limit.success) {
      res.status(429).json({ error: "Upload quá nhanh. Vui lòng chờ một chút rồi thử lại." });
      return;
    }

    const payload = requireAuth(req, "STUDIO");
    const file = req.file;
    const albumId = req.body.albumId;

    if (!file || !albumId) {
      res.status(400).json({ error: "Thiếu file hoặc albumId" });
      return;
    }
    if (!file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Chỉ chấp nhận file ảnh" });
      return;
    }

    const [album] = await db.select({
      id: albumsTable.id,
      studioId: albumsTable.studioId,
      driveFolderId: albumsTable.driveFolderId,
    }).from(albumsTable).where(eq(albumsTable.id, albumId));

    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const [studio] = await db.select({ googleDriveRefreshToken: studiosTable.googleDriveRefreshToken }).from(studiosTable).where(eq(studiosTable.id, payload.id));
    if (!studio?.googleDriveRefreshToken) {
      res.status(400).json({ error: "Vui lòng kết nối Google Drive trước khi upload ảnh" });
      return;
    }
    if (!album.driveFolderId) {
      res.status(400).json({ error: "Folder Drive chưa được tạo. Vui lòng xóa và tạo lại album." });
      return;
    }

    const { fileId, thumbnailUrl } = await uploadFileToDrive(
      studio.googleDriveRefreshToken,
      album.driveFolderId,
      file.originalname,
      file.mimetype,
      file.buffer
    );

    const [photo] = await db.insert(photosTable).values({
      albumId,
      driveFileId: fileId,
      filename: file.originalname,
      mimeType: file.mimetype,
      thumbnailUrl,
      order: sql`(SELECT COALESCE(MAX(${photosTable.order}), -1) + 1 FROM ${photosTable} WHERE ${photosTable.albumId} = ${albumId})`,
    }).returning();

    res.status(201).json({ photo: { ...photo, createdAt: photo.createdAt.toISOString() } });
  } catch (e: unknown) {
    logger.error(e, "[UPLOAD]");
    const msg = e instanceof Error ? e.message : "Lỗi upload";
    res.status(500).json({ error: msg });
  }
});

export default router;
