import { Router } from "express";
import { db } from "@workspace/db";
import { albumsTable, photosTable, deliverablesTable, deliverablePhotosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, getErrorStatus } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

interface DeliverablePhotoRow {
  id: string;
  deliverableId: string;
  originalPhotoId: string;
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

export default router;
