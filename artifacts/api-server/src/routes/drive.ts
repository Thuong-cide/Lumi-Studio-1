import { Router } from "express";
import { db } from "@workspace/db";
import { photosTable, albumsTable, studiosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getFileStream } from "../lib/google-drive";
import { logger } from "../lib/logger";

const router = Router();

router.get("/drive/proxy/:fileId", async (req, res): Promise<void> => {
  try {
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;

    const [photo] = await db.select({
      id: photosTable.id,
      driveFileId: photosTable.driveFileId,
      mimeType: photosTable.mimeType,
      albumId: photosTable.albumId,
    }).from(photosTable).where(eq(photosTable.driveFileId, fileId));

    if (!photo) {
      res.status(404).json({ error: "Ảnh không tìm thấy" });
      return;
    }

    const [album] = await db.select({ studioId: albumsTable.studioId }).from(albumsTable).where(eq(albumsTable.id, photo.albumId));
    if (!album) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const [studio] = await db.select({ googleDriveRefreshToken: studiosTable.googleDriveRefreshToken }).from(studiosTable).where(eq(studiosTable.id, album.studioId));
    if (!studio?.googleDriveRefreshToken) {
      res.status(400).json({ error: "Drive chưa kết nối" });
      return;
    }

    const nodeStream = await getFileStream(studio.googleDriveRefreshToken, fileId);
    res.setHeader("Content-Type", photo.mimeType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    nodeStream.pipe(res);
  } catch (e: unknown) {
    logger.error(e, "[PROXY]");
    res.status(500).json({ error: "Không thể lấy ảnh" });
  }
});

export default router;
