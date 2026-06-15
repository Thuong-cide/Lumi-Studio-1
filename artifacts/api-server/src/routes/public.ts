import { Router } from "express";
import { db } from "@workspace/db";
import { albumsTable, photosTable, selectionsTable, studiosTable, selectionConfirmationsTable, appConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { rateLimit, getClientIp } from "../lib/rate-limit";

const router = Router();

// OPT: studio + photos fetched in parallel after album lookup (was 3 sequential queries)
router.get("/public/album/:slug", async (req, res): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.slug, slug), eq(albumsTable.isPublic, true)));
    if (!album) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const [studioResult, photos] = await Promise.all([
      db.select({ name: studiosTable.name }).from(studiosTable).where(eq(studiosTable.id, album.studioId)),
      db.select().from(photosTable).where(eq(photosTable.albumId, album.id)).orderBy(photosTable.order),
    ]);

    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json({
      id: album.id,
      title: album.title,
      slug: album.slug,
      description: album.description,
      allowDownload: album.allowDownload,
      allowNotes: album.allowNotes,
      maxSelection: album.maxSelection,
      showBeforeAfter: album.showBeforeAfter ?? true,
      studio: { name: studioResult[0]?.name ?? "" },
      photos: photos.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
    });
  } catch (e) {
    logger.error(e, "[PUBLIC ALBUM]");
    res.status(500).json({ error: "Lỗi server" });
  }
});

router.get("/public/album/:slug/my-selections", async (req, res): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Thiếu tên khách hàng" });
      return;
    }
    const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.slug, slug), eq(albumsTable.isPublic, true)));
    if (!album) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }
    const rows = await db.select().from(selectionsTable).where(and(
      eq(selectionsTable.albumId, album.id),
      eq(selectionsTable.customerName, name)
    ));
    res.json({ selections: rows.map(r => ({ photoId: r.photoId, selected: r.selected, note: r.note })) });
  } catch (e) {
    logger.error(e, "[MY-SELECTIONS]");
    res.status(500).json({ error: "Lỗi server" });
  }
});

router.post("/public/album/:slug/select", async (req, res): Promise<void> => {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`select:${ip}`, { windowMs: 60_000, max: 60 });
    if (!limit.success) {
      res.status(429).set("Retry-After", String(Math.ceil((limit.resetTime - Date.now()) / 1000))).json({ error: "Quá nhiều yêu cầu. Vui lòng chờ một chút rồi thử lại." });
      return;
    }

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

router.post("/public/album/:slug/confirm", async (req, res): Promise<void> => {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`confirm:${ip}`, { windowMs: 60_000, max: 10 });
    if (!limit.success) {
      res.status(429).set("Retry-After", String(Math.ceil((limit.resetTime - Date.now()) / 1000))).json({ error: "Quá nhiều yêu cầu. Vui lòng chờ một chút rồi thử lại." });
      return;
    }

    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const { customerName } = req.body;
    if (!customerName?.trim()) {
      res.status(400).json({ error: "Thiếu tên khách hàng" });
      return;
    }

    const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.slug, slug), eq(albumsTable.isPublic, true)));
    if (!album) {
      res.status(404).json({ error: "Album không tìm thấy" });
      return;
    }

    const trimmedName = customerName.trim();

    const selectedRows = await db
      .select({ photoId: selectionsTable.photoId, note: selectionsTable.note, filename: photosTable.filename })
      .from(selectionsTable)
      .leftJoin(photosTable, eq(selectionsTable.photoId, photosTable.id))
      .where(and(
        eq(selectionsTable.albumId, album.id),
        eq(selectionsTable.customerName, trimmedName),
        eq(selectionsTable.selected, true)
      ));

    if (selectedRows.length === 0) {
      res.status(400).json({ error: "Bạn chưa chọn ảnh nào" });
      return;
    }

    const snapshot = JSON.stringify(selectedRows.map(r => ({
      photoId: r.photoId,
      filename: r.filename || r.photoId,
      note: r.note || null,
    })));

    const [confirmation] = await db.insert(selectionConfirmationsTable).values({
      albumId: album.id,
      customerName: trimmedName,
      photoCount: selectedRows.length,
      snapshot,
    }).returning();

    logger.info({ albumId: album.id, customerName: trimmedName, photoCount: selectedRows.length }, "[CONFIRM SELECTION]");

    res.json({
      id: confirmation.id,
      photoCount: confirmation.photoCount,
      confirmedAt: confirmation.confirmedAt.toISOString(),
    });
  } catch (e) {
    logger.error(e, "[CONFIRM]");
    res.status(500).json({ error: "Lỗi server" });
  }
});

router.get("/public/contact", async (_req, res): Promise<void> => {
  try {
    const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "contact_info"));
    if (!row) {
      res.json({ enabled: false, zalo: "", facebook: "", phone: "", telegram: "" });
      return;
    }
    const data = JSON.parse(row.value);
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json(data);
  } catch {
    res.json({ enabled: false, zalo: "", facebook: "", phone: "", telegram: "" });
  }
});

export default router;
