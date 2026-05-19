import { Router } from "express";
import { db } from "@workspace/db";
import { albumsTable, photosTable, selectionsTable, studiosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/public/album/:slug", async (req, res): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.slug, slug), eq(albumsTable.isPublic, true)));
    if (!album) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const [studio] = await db.select({ name: studiosTable.name }).from(studiosTable).where(eq(studiosTable.id, album.studioId));
    const photos = await db.select().from(photosTable).where(eq(photosTable.albumId, album.id)).orderBy(photosTable.order);

    res.json({
      id: album.id,
      title: album.title,
      slug: album.slug,
      description: album.description,
      allowDownload: album.allowDownload,
      allowNotes: album.allowNotes,
      maxSelection: album.maxSelection,
      studio: { name: studio?.name ?? "" },
      photos: photos.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
    });
  } catch (e) {
    logger.error(e, "[PUBLIC ALBUM]");
    res.status(500).json({ error: "Lỗi server" });
  }
});

router.post("/public/album/:slug/select", async (req, res): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const { photoId, customerName, note, selected } = req.body;

    if (!photoId || !customerName?.trim()) {
      res.status(400).json({ error: "Thiếu thông tin" });
      return;
    }

    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.slug, slug));
    if (!album) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }
    if (!album.isPublic) {
      res.status(403).json({ error: "Album không công khai" });
      return;
    }

    const trimmedName = customerName.trim();

    if (selected && album.maxSelection > 0) {
      const currentSelections = await db.select().from(selectionsTable)
        .where(and(
          eq(selectionsTable.albumId, album.id),
          eq(selectionsTable.customerName, trimmedName),
          eq(selectionsTable.selected, true)
        ));
      const currentCount = currentSelections.filter(s => s.photoId !== photoId).length;
      if (currentCount >= album.maxSelection) {
        res.status(400).json({ error: `Bạn chỉ được chọn tối đa ${album.maxSelection} ảnh` });
        return;
      }
    }

    const [existing] = await db.select().from(selectionsTable)
      .where(and(
        eq(selectionsTable.albumId, album.id),
        eq(selectionsTable.photoId, photoId),
        eq(selectionsTable.customerName, trimmedName)
      ));

    let selection;
    if (existing) {
      const [updated] = await db.update(selectionsTable)
        .set({ selected: Boolean(selected), note: note?.trim() || null })
        .where(eq(selectionsTable.id, existing.id))
        .returning();
      selection = updated;
    } else {
      const [created] = await db.insert(selectionsTable).values({
        albumId: album.id,
        photoId,
        customerName: trimmedName,
        note: note?.trim() || null,
        selected: Boolean(selected),
      }).returning();
      selection = created;
    }

    res.json({ ...selection, createdAt: selection.createdAt.toISOString(), updatedAt: selection.updatedAt.toISOString() });
  } catch (e) {
    logger.error(e, "[SELECT]");
    const msg = e instanceof Error ? e.message : "Lỗi server";
    const status = msg.includes("tối đa") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
