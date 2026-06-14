import { Router } from "express";
import { db } from "@workspace/db";
import { albumsTable, photosTable, studiosTable, deliverablesTable, deliverablePhotosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, getErrorStatus } from "../lib/auth";
import { createFolder, uploadFileToDrive } from "../lib/google-drive";
import { logger } from "../lib/logger";
import { sendDeliverableWebhook } from "../services/webhookNotifier";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function normalizeFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base
    .replace(/[-_\s]+(edited|final|chinhsua|retouched|edit|chinh|sua|done|output|export|retouch)$/i, "")
    .toLowerCase()
    .trim();
}

const router = Router();

interface DeliverablePhotoRow {
  id: string;
  deliverableId: string;
  originalPhotoId: string | null;
  editedImageUrl: string;
  caption: string | null;
  originalPhoto?: {
    id: string;
    albumId: string;
    driveFileId: string;
    filename: string;
    mimeType: string;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    order: number;
    createdAt: string;
  };
}

async function fetchDeliverablePhotos(albumId: string, deliverableIds: string[]): Promise<Record<string, DeliverablePhotoRow[]>> {
  if (deliverableIds.length === 0) return {};
  const rows = await db.select({
    id: deliverablePhotosTable.id,
    deliverableId: deliverablePhotosTable.deliverableId,
    originalPhotoId: deliverablePhotosTable.originalPhotoId,
    editedImageUrl: deliverablePhotosTable.editedImageUrl,
    caption: deliverablePhotosTable.caption,
    origId: photosTable.id,
    origDriveFileId: photosTable.driveFileId,
    origFilename: photosTable.filename,
    origThumbnailUrl: photosTable.thumbnailUrl,
    origOrder: photosTable.order,
    origCreatedAt: photosTable.createdAt,
    origMimeType: photosTable.mimeType,
    origWidth: photosTable.width,
    origHeight: photosTable.height,
  }).from(deliverablePhotosTable)
    .leftJoin(photosTable, eq(deliverablePhotosTable.originalPhotoId, photosTable.id))
    .where(inArray(deliverablePhotosTable.deliverableId, deliverableIds));

  return rows.reduce((acc, row) => {
    if (!acc[row.deliverableId]) acc[row.deliverableId] = [];
    acc[row.deliverableId].push({
      id: row.id,
      deliverableId: row.deliverableId,
      originalPhotoId: row.originalPhotoId,
      editedImageUrl: row.editedImageUrl,
      caption: row.caption,
      originalPhoto: row.origId ? {
        id: row.origId,
        albumId,
        driveFileId: row.origDriveFileId!,
        filename: row.origFilename!,
        mimeType: row.origMimeType!,
        thumbnailUrl: row.origThumbnailUrl,
        width: row.origWidth,
        height: row.origHeight,
        order: row.origOrder!,
        createdAt: row.origCreatedAt!.toISOString(),
      } : undefined,
    });
    return acc;
  }, {} as Record<string, DeliverablePhotoRow[]>);
}

router.get("/studios/albums/:id/deliverables", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const albumId = req.params.id;

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const deliverables = await db.select().from(deliverablesTable)
      .where(eq(deliverablesTable.albumId, albumId))
      .orderBy(deliverablesTable.version);

    const photosMap = await fetchDeliverablePhotos(albumId, deliverables.map(d => d.id));

    res.json({
      deliverables: deliverables.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        photos: photosMap[d.id] || [],
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi server";
    logger.error(e, "[LIST DELIVERABLES]");
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.post("/studios/albums/:id/deliverables", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const albumId = req.params.id;

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const { versionFolderUrl, deliverableRootFolderUrl, note, photos } = req.body;
    if (!versionFolderUrl?.trim()) {
      res.status(400).json({ error: "Thiếu URL thư mục Drive" });
      return;
    }
    if (!Array.isArray(photos) || photos.length === 0) {
      res.status(400).json({ error: "Cần ít nhất 1 ảnh" });
      return;
    }

    if (deliverableRootFolderUrl?.trim() && !album.deliverableRootFolderUrl) {
      await db.update(albumsTable)
        .set({ deliverableRootFolderUrl: deliverableRootFolderUrl.trim() })
        .where(eq(albumsTable.id, albumId));
    }

    const existing = await db.select({ version: deliverablesTable.version })
      .from(deliverablesTable)
      .where(eq(deliverablesTable.albumId, albumId));
    const nextVersion = existing.length + 1;

    const [deliverable] = await db.insert(deliverablesTable).values({
      albumId,
      version: nextVersion,
      versionLabel: `v${nextVersion}`,
      driveFolderUrl: versionFolderUrl.trim(),
      note: note?.trim() || null,
    }).returning();

    const photoIds: string[] = photos.map((p: { originalPhotoId: string }) => p.originalPhotoId);
    const validPhotos = await db.select({ id: photosTable.id }).from(photosTable)
      .where(inArray(photosTable.id, photoIds));
    const validIds = new Set(validPhotos.map(p => p.id));

    const photoValues = (photos as { originalPhotoId: string; editedImageUrl: string; caption?: string }[])
      .filter(p => validIds.has(p.originalPhotoId) && p.editedImageUrl?.trim())
      .map(p => ({
        deliverableId: deliverable.id,
        originalPhotoId: p.originalPhotoId,
        editedImageUrl: p.editedImageUrl.trim(),
        caption: p.caption?.trim() || null,
      }));

    if (photoValues.length === 0) {
      res.status(400).json({ error: "Không có ảnh hợp lệ" });
      return;
    }

    const insertedPhotos = await db.insert(deliverablePhotosTable).values(photoValues).returning();

    logger.info({ albumId, version: nextVersion, photoCount: insertedPhotos.length }, "[CREATE DELIVERABLE]");

    // Fire deliverable webhook async (non-blocking)
    db.select({
      n8nWebhookUrl: studiosTable.n8nWebhookUrl,
      webhookSecret: studiosTable.webhookSecret,
      deliverableNotifyEnabled: studiosTable.deliverableNotifyEnabled,
    }).from(studiosTable).where(eq(studiosTable.id, payload.id)).then(([studio]) => {
      if (studio?.deliverableNotifyEnabled && studio.n8nWebhookUrl) {
        sendDeliverableWebhook(
          {
            albumId,
            albumSlug: album.slug,
            customerPhone: album.customerPhone,
            versionLabel: deliverable.versionLabel,
            versionFolderUrl: deliverable.driveFolderUrl,
            photoCount: insertedPhotos.length,
          },
          { id: payload.id, n8nWebhookUrl: studio.n8nWebhookUrl, webhookSecret: studio.webhookSecret ?? null }
        ).catch(err => logger.error(err, "[WEBHOOK] deliverable.uploaded error"));
      }
    }).catch(err => logger.error(err, "[WEBHOOK] fetch studio error"));

    res.status(201).json({
      deliverable: {
        ...deliverable,
        createdAt: deliverable.createdAt.toISOString(),
        updatedAt: deliverable.updatedAt.toISOString(),
        photos: insertedPhotos,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi server";
    logger.error(e, "[CREATE DELIVERABLE]");
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/public/album/:slug/deliverables", async (req, res): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.slug, slug));
    if (!album || !album.isPublic) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const deliverables = await db.select().from(deliverablesTable)
      .where(eq(deliverablesTable.albumId, album.id))
      .orderBy(deliverablesTable.version);

    if (deliverables.length === 0) {
      res.json({ deliverables: [] });
      return;
    }

    const photosMap = await fetchDeliverablePhotos(album.id, deliverables.map(d => d.id));

    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json({
      deliverables: deliverables.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        photos: photosMap[d.id] || [],
      })),
    });
  } catch (e) {
    logger.error(e, "[PUBLIC DELIVERABLES]");
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Upload edited photos directly — auto-creates Drive folders and matches by filename
router.post("/studios/albums/:id/deliverables/upload", upload.array("files", 100), async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const albumId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId));
    if (!album || album.studioId !== payload.id) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }
    if (!album.driveFolderId) {
      res.status(400).json({ error: "Album chưa có thư mục Drive. Vui lòng tạo lại album." });
      return;
    }

    const [studio] = await db
      .select({ googleDriveRefreshToken: studiosTable.googleDriveRefreshToken })
      .from(studiosTable)
      .where(eq(studiosTable.id, payload.id));
    if (!studio?.googleDriveRefreshToken) {
      res.status(400).json({ error: "Vui lòng kết nối Google Drive trước khi tải lên ảnh" });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "Không có file nào được gửi lên" });
      return;
    }
    const imageFiles = files.filter(f => f.mimetype.startsWith("image/"));
    if (imageFiles.length === 0) {
      res.status(400).json({ error: "Chỉ chấp nhận file ảnh" });
      return;
    }

    const note = typeof req.body.note === "string" ? req.body.note.trim() || null : null;
    const refreshToken = studio.googleDriveRefreshToken;

    // 1. Get or create "Ảnh chỉnh sửa" root folder
    let rootFolderId = album.deliverableRootFolderId;
    if (!rootFolderId) {
      rootFolderId = await createFolder(refreshToken, "Ảnh chỉnh sửa", album.driveFolderId);
      await db.update(albumsTable).set({
        deliverableRootFolderId: rootFolderId,
        deliverableRootFolderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`,
      }).where(eq(albumsTable.id, albumId));
    }

    // 2. Determine next version number
    const existingVersions = await db
      .select({ version: deliverablesTable.version })
      .from(deliverablesTable)
      .where(eq(deliverablesTable.albumId, albumId));
    const nextVersion = existingVersions.length + 1;

    // 3. Create version folder inside root
    const versionFolderId = await createFolder(refreshToken, `v${nextVersion}`, rootFolderId);

    // 4. Get original photos for filename matching
    const originalPhotos = await db
      .select({ id: photosTable.id, filename: photosTable.filename })
      .from(photosTable)
      .where(eq(photosTable.albumId, albumId));
    const photoMap = new Map(originalPhotos.map(p => [normalizeFilename(p.filename), p.id]));

    // 5. Upload all files to Drive in parallel
    const uploadResults = await Promise.allSettled(
      imageFiles.map(async (file) => {
        const { fileId } = await uploadFileToDrive(
          refreshToken,
          versionFolderId,
          file.originalname,
          file.mimetype,
          file.buffer
        );
        return { fileId, filename: file.originalname };
      })
    );

    // 6. Build photo records with filename matching
    type PhotoInsert = { deliverableId: string; originalPhotoId: string | null; editedImageUrl: string; caption: null };
    const photoValues: Omit<PhotoInsert, "deliverableId">[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const result of uploadResults) {
      if (result.status !== "fulfilled") {
        logger.warn(result.reason, "[UPLOAD DELIVERABLE] File upload failed");
        continue;
      }
      const { fileId, filename } = result.value;
      const originalPhotoId = photoMap.get(normalizeFilename(filename)) ?? null;
      if (originalPhotoId) matchedCount++;
      else unmatchedCount++;
      photoValues.push({ originalPhotoId, editedImageUrl: fileId, caption: null });
    }

    if (photoValues.length === 0) {
      res.status(500).json({ error: "Không có file nào tải lên thành công" });
      return;
    }

    // 7. Create deliverable record
    const [deliverable] = await db.insert(deliverablesTable).values({
      albumId,
      version: nextVersion,
      versionLabel: `v${nextVersion}`,
      driveFolderUrl: `https://drive.google.com/drive/folders/${versionFolderId}`,
      note,
    }).returning();

    // 8. Insert deliverable photos
    const insertedPhotos = await db.insert(deliverablePhotosTable).values(
      photoValues.map(p => ({ ...p, deliverableId: deliverable.id }))
    ).returning();

    logger.info({ albumId, version: nextVersion, matchedCount, unmatchedCount }, "[UPLOAD DELIVERABLE]");

    res.status(201).json({
      deliverable: {
        ...deliverable,
        createdAt: deliverable.createdAt.toISOString(),
        updatedAt: deliverable.updatedAt.toISOString(),
        photos: insertedPhotos,
        matchedCount,
        unmatchedCount,
      },
    });
  } catch (e: unknown) {
    logger.error(e, "[UPLOAD DELIVERABLE]");
    const msg = e instanceof Error ? e.message : "Lỗi server";
    res.status(500).json({ error: msg });
  }
});

export default router;
