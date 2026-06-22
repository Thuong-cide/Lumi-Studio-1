import { Router } from "express";
import { db } from "@workspace/db";
import { studiosTable, albumsTable, photosTable, selectionsTable, appConfigTable, settingsTable, paymentsTable } from "@workspace/db";
import { eq, count, inArray } from "drizzle-orm";
import { requireAuth, getErrorStatus, hashPassword } from "../lib/auth";
import { getGoogleConfig, invalidateGoogleConfigCache } from "../lib/google-drive";

const router = Router();

const SETTINGS_KEYS = ["monthly_price", "payos_client_id", "payos_api_key", "payos_checksum_key", "trial_days", "discount_3m", "discount_6m", "discount_12m"];

async function ensureDefaultSettings() {
  const defaults: Record<string, string> = {
    monthly_price: "299000",
    payos_client_id: "",
    payos_api_key: "",
    payos_checksum_key: "",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(settingsTable)
      .values({ key, value })
      .onConflictDoNothing();
  }
}

function maskSecret(value: string): string {
  if (!value || value.length === 0) return "";
  if (value.length <= 6) return "••••••";
  return "••••••" + value.slice(-6);
}

router.get("/admin/stats", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const [totalStudios, totalAlbums, totalPhotos, totalSelections] = await Promise.all([
      db.select({ count: count() }).from(studiosTable).then(r => r[0].count),
      db.select({ count: count() }).from(albumsTable).then(r => r[0].count),
      db.select({ count: count() }).from(photosTable).then(r => r[0].count),
      db.select({ count: count() }).from(selectionsTable).where(eq(selectionsTable.selected, true)).then(r => r[0].count),
    ]);
    res.json({ totalStudios, pendingStudios: 0, approvedStudios: totalStudios, totalAlbums, totalPhotos, totalSelections });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/admin/studios", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");

    const studios = await db.select({
      id: studiosTable.id,
      name: studiosTable.name,
      email: studiosTable.email,
      phone: studiosTable.phone,
      status: studiosTable.status,
      trialEndsAt: studiosTable.trialEndsAt,
      subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
      expiresAt: studiosTable.expiresAt,
      createdAt: studiosTable.createdAt,
      updatedAt: studiosTable.updatedAt,
    }).from(studiosTable).orderBy(studiosTable.createdAt);

    if (studios.length === 0) {
      res.json({ studios: [] });
      return;
    }

    const studioIds = studios.map(s => s.id);
    const albumCounts = await db
      .select({ studioId: albumsTable.studioId, cnt: count() })
      .from(albumsTable)
      .where(inArray(albumsTable.studioId, studioIds))
      .groupBy(albumsTable.studioId);

    const albumCountMap = Object.fromEntries(albumCounts.map(r => [r.studioId, Number(r.cnt)]));

    res.json({
      studios: studios.map(studio => ({
        ...studio,
        albumCount: albumCountMap[studio.id] ?? 0,
        googleDriveConnected: false,
        trialEndsAt: studio.trialEndsAt ? studio.trialEndsAt.toISOString() : null,
        subscriptionExpiresAt: studio.subscriptionExpiresAt ? studio.subscriptionExpiresAt.toISOString() : null,
        expiresAt: studio.expiresAt ? studio.expiresAt.toISOString() : null,
        createdAt: studio.createdAt.toISOString(),
        updatedAt: studio.updatedAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.patch("/admin/studios/:id", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, expiresAt, subscriptionExpiresAt, trialEndsAt } = req.body;

    const patch: Record<string, unknown> = {};

    if (status !== undefined) {
      const validStatuses = ["trial", "active", "expired", "disabled", "PENDING", "APPROVED", "DISABLED", "restore"];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "Trạng thái không hợp lệ" });
        return;
      }
      if (status === "restore") {
        const [existing] = await db.select({
          trialEndsAt: studiosTable.trialEndsAt,
          subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
        }).from(studiosTable).where(eq(studiosTable.id, id));
        if (!existing) {
          res.status(404).json({ error: "Không tìm thấy studio" });
          return;
        }
        const now = new Date();
        if (existing.trialEndsAt && existing.trialEndsAt > now) {
          patch.status = "trial";
        } else if (existing.subscriptionExpiresAt && existing.subscriptionExpiresAt > now) {
          patch.status = "active";
        } else {
          patch.status = "expired";
        }
      } else {
        patch.status = status;
      }
    }

    if (expiresAt !== undefined) patch.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (subscriptionExpiresAt !== undefined) patch.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
    if (trialEndsAt !== undefined) patch.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Không có thông tin cần cập nhật" });
      return;
    }

    const [studio] = await db.update(studiosTable)
      .set(patch)
      .where(eq(studiosTable.id, id))
      .returning({
        id: studiosTable.id,
        name: studiosTable.name,
        email: studiosTable.email,
        status: studiosTable.status,
        trialEndsAt: studiosTable.trialEndsAt,
        subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
        expiresAt: studiosTable.expiresAt,
        createdAt: studiosTable.createdAt,
        updatedAt: studiosTable.updatedAt,
      });
    res.json({
      studio: {
        ...studio,
        albumCount: 0,
        googleDriveConnected: false,
        trialEndsAt: studio.trialEndsAt ? studio.trialEndsAt.toISOString() : null,
        subscriptionExpiresAt: studio.subscriptionExpiresAt ? studio.subscriptionExpiresAt.toISOString() : null,
        expiresAt: studio.expiresAt ? studio.expiresAt.toISOString() : null,
        createdAt: studio.createdAt.toISOString(),
        updatedAt: studio.updatedAt.toISOString(),
      },
    });
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

router.get("/admin/config", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const [googleConfig, contactRow] = await Promise.all([
      getGoogleConfig(),
      db.select().from(appConfigTable).where(eq(appConfigTable.key, "contact_info")).then(r => r[0]),
    ]);
    const contact = contactRow ? JSON.parse(contactRow.value) : { enabled: false, zalo: "", facebook: "", phone: "", telegram: "" };
    res.json({
      googleClientId: googleConfig.clientId,
      googleClientSecret: googleConfig.clientSecret ? "••••••••" : "",
      googleRedirectUri: googleConfig.redirectUri,
      isConfigured: !!(googleConfig.clientId && googleConfig.clientSecret && googleConfig.redirectUri),
      contact,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.patch("/admin/config", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const { googleClientId, googleClientSecret, googleRedirectUri, contact } = req.body;

    const updates: Promise<unknown>[] = [];

    if (googleClientId !== undefined || googleClientSecret !== undefined || googleRedirectUri !== undefined) {
      if (!googleClientId?.trim() || !googleClientSecret?.trim() || !googleRedirectUri?.trim()) {
        res.status(400).json({ error: "Vui lòng điền đầy đủ Client ID, Client Secret và Redirect URI" });
        return;
      }
      const value = JSON.stringify({
        clientId: googleClientId.trim(),
        clientSecret: googleClientSecret.trim(),
        redirectUri: googleRedirectUri.trim(),
      });
      updates.push(
        db.insert(appConfigTable)
          .values({ key: "google_oauth", value })
          .onConflictDoUpdate({ target: appConfigTable.key, set: { value } })
      );
      invalidateGoogleConfigCache();
    }

    if (contact !== undefined) {
      const contactValue = JSON.stringify({
        enabled: !!contact.enabled,
        zalo: contact.zalo?.trim() || "",
        facebook: contact.facebook?.trim() || "",
        phone: contact.phone?.trim() || "",
        telegram: contact.telegram?.trim() || "",
      });
      updates.push(
        db.insert(appConfigTable)
          .values({ key: "contact_info", value: contactValue })
          .onConflictDoUpdate({ target: appConfigTable.key, set: { value: contactValue } })
      );
    }

    await Promise.all(updates);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/admin/settings", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    await ensureDefaultSettings();

    const rows = await db.select().from(settingsTable);
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.key === "payos_api_key" || row.key === "payos_checksum_key") {
        result[row.key] = maskSecret(row.value);
      } else {
        result[row.key] = row.value;
      }
    }

    const payosConfigured = !!(
      rows.find(r => r.key === "payos_client_id")?.value &&
      rows.find(r => r.key === "payos_api_key")?.value &&
      rows.find(r => r.key === "payos_checksum_key")?.value
    );

    res.json({ settings: result, payosConfigured });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.put("/admin/settings/:key", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;

    if (!SETTINGS_KEYS.includes(key)) {
      res.status(400).json({ error: "Khóa cài đặt không hợp lệ" });
      return;
    }

    const { value } = req.body;
    if (value === undefined || value === null) {
      res.status(400).json({ error: "Giá trị không được để trống" });
      return;
    }

    await db.insert(settingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(value) } });

    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/admin/payments", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "ADMIN");
    const payments = await db.select({
      id: paymentsTable.id,
      studioId: paymentsTable.studioId,
      amount: paymentsTable.amount,
      payosOrderCode: paymentsTable.payosOrderCode,
      transferContent: paymentsTable.transferContent,
      status: paymentsTable.status,
      months: paymentsTable.months,
      createdAt: paymentsTable.createdAt,
      paidAt: paymentsTable.paidAt,
    }).from(paymentsTable).orderBy(paymentsTable.createdAt);

    res.json({
      payments: payments.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

export default router;
