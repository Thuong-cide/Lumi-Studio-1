import { Router } from "express";
import { db } from "@workspace/db";
import { photosTable, albumsTable, studiosTable, deliverablesTable, deliverablePhotosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getFileStream } from "../lib/google-drive";
import { logger } from "../lib/logger";

const router = Router();

router.get("/drive/proxy/:fileId", async (req, res): Promise<void> => {
  try {
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;

    // 1. Check original photos table
    const [photo] = await db.select({
      id: photosTable.id,
      driveFileId: photosTable.driveFileId,
      mimeType: photosTable.mimeType,
      albumId: photosTable.albumId,
    }).from(photosTable).where(eq(photosTable.driveFileId, fileId));

    let refreshToken: string | null = null;
    let mimeType = "image/jpeg";

    if (photo) {
      const [album] = await db.select({ studioId: albumsTable.studioId }).from(albumsTable).where(eq(albumsTable.id, photo.albumId));
      if (!album) { res.status(404).json({ error: "Album không tìm thấy" }); return; }
      const [studio] = await db.select({ googleDriveRefreshToken: studiosTable.googleDriveRefreshToken }).from(studiosTable).where(eq(studiosTable.id, album.studioId));
      if (!studio?.googleDriveRefreshToken) { res.status(400).json({ error: "Drive chưa kết nối" }); return; }
      refreshToken = studio.googleDriveRefreshToken;
      mimeType = photo.mimeType || "image/jpeg";
    } else {
      // 2. Fallback: deliverable edited photos (uploaded directly)
      const [dp] = await db
        .select({ refreshToken: studiosTable.googleDriveRefreshToken })
        .from(deliverablePhotosTable)
        .innerJoin(deliverablesTable, eq(deliverablePhotosTable.deliverableId, deliverablesTable.id))
        .innerJoin(albumsTable, eq(deliverablesTable.albumId, albumsTable.id))
        .innerJoin(studiosTable, eq(albumsTable.studioId, studiosTable.id))
        .where(eq(deliverablePhotosTable.editedImageUrl, fileId));

      if (!dp?.refreshToken) { res.status(404).json({ error: "Ảnh không tìm thấy" }); return; }
      refreshToken = dp.refreshToken;
    }

    const nodeStream = await getFileStream(refreshToken, fileId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("ETag", `"${fileId}"`);
    nodeStream.pipe(res);
  } catch (e: unknown) {
    logger.error(e, "[PROXY]");
    res.status(500).json({ error: "Không thể lấy ảnh" });
  }
});

export default router;
