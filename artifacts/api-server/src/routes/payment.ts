import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, settingsTable, studiosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, getErrorStatus } from "../lib/auth";
import { getPayosClient } from "../lib/payos";
import { logger } from "../lib/logger";

const router = Router();

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? "";
}

async function getPricingConfig() {
  const allRows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of allRows) map[r.key] = r.value ?? "";
  return {
    monthlyPrice: parseInt(map["monthly_price"] || "299000", 10),
    discount3m: parseInt(map["discount_3m"] || "0", 10),
    discount6m: parseInt(map["discount_6m"] || "0", 10),
    discount12m: parseInt(map["discount_12m"] || "0", 10),
  };
}

function calcAmount(monthlyPrice: number, months: number, discountPct: number): number {
  const raw = monthlyPrice * months;
  return Math.round(raw * (1 - discountPct / 100));
}

router.get("/studio/pricing", async (req, res): Promise<void> => {
  try {
    requireAuth(req, "STUDIO");
    const cfg = await getPricingConfig();
    res.json({
      monthlyPrice: cfg.monthlyPrice,
      plans: [
        { months: 1, label: "1 tháng", discountPct: 0, amount: calcAmount(cfg.monthlyPrice, 1, 0) },
        { months: 3, label: "3 tháng", discountPct: cfg.discount3m, amount: calcAmount(cfg.monthlyPrice, 3, cfg.discount3m) },
        { months: 6, label: "6 tháng", discountPct: cfg.discount6m, amount: calcAmount(cfg.monthlyPrice, 6, cfg.discount6m) },
        { months: 12, label: "1 năm", discountPct: cfg.discount12m, amount: calcAmount(cfg.monthlyPrice, 12, cfg.discount12m) },
      ],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.post("/studio/payment/create-order", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");

    const months = Number(req.body?.months) || 1;
    if (![1, 3, 6, 12].includes(months)) {
      res.status(400).json({ error: "Gói không hợp lệ" });
      return;
    }

    let payos;
    try {
      payos = await getPayosClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "PAYOS_NOT_CONFIGURED") {
        res.status(503).json({ code: "PAYOS_NOT_CONFIGURED", error: "Hệ thống thanh toán chưa sẵn sàng, vui lòng liên hệ quản trị viên" });
        return;
      }
      throw e;
    }

    const cfg = await getPricingConfig();
    const discountMap: Record<number, number> = { 1: 0, 3: cfg.discount3m, 6: cfg.discount6m, 12: cfg.discount12m };
    const amount = calcAmount(cfg.monthlyPrice, months, discountMap[months]);

    let orderCode: number;
    let isUnique = false;
    do {
      orderCode = Math.floor(10000000 + Math.random() * 90000000);
      const [existing] = await db.select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(eq(paymentsTable.payosOrderCode, orderCode));
      isUnique = !existing;
    } while (!isUnique);

    const transferContent = `LUMIERE${orderCode}`;
    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_BASE_URL ?? "";

    const paymentLink = await payos.paymentRequests.create({
      orderCode,
      amount,
      description: transferContent,
      returnUrl: `${BASE_URL}/dashboard?payment=success`,
      cancelUrl: `${BASE_URL}/dashboard?payment=cancelled`,
    });

    await db.insert(paymentsTable).values({
      studioId: payload.id,
      amount,
      payosOrderCode: orderCode,
      transferContent,
      status: "pending",
      months,
    });

    // Fetch QR image server-side → return as base64 data URL (avoids browser CORS)
    let qrCode = paymentLink.qrCode ?? "";
    if (qrCode.startsWith("http")) {
      try {
        const qrRes = await fetch(qrCode, { signal: AbortSignal.timeout(5000) });
        if (qrRes.ok) {
          const buf = await qrRes.arrayBuffer();
          const ct = qrRes.headers.get("content-type") || "image/png";
          qrCode = `data:${ct};base64,${Buffer.from(buf).toString("base64")}`;
        }
      } catch {
        // keep original URL as fallback
      }
    }

    res.json({
      qrCode,
      checkoutUrl: paymentLink.checkoutUrl,
      accountNumber: paymentLink.accountNumber,
      accountName: paymentLink.accountName,
      transferContent,
      amount,
      orderCode,
      months,
    });
  } catch (e: unknown) {
    logger.error(e, "[CREATE PAYMENT ORDER]");
    res.status(500).json({ error: "Không thể tạo đơn thanh toán. Vui lòng thử lại." });
  }
});

router.get("/studio/payment/status/:orderCode", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");
    const orderCode = parseInt(req.params.orderCode as string, 10);

    if (isNaN(orderCode)) {
      res.status(400).json({ error: "orderCode không hợp lệ" });
      return;
    }

    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.payosOrderCode, orderCode), eq(paymentsTable.studioId, payload.id)));

    if (!payment) {
      res.status(404).json({ error: "Không tìm thấy đơn thanh toán" });
      return;
    }

    res.json({ status: payment.status, paidAt: payment.paidAt?.toISOString() ?? null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

router.get("/studio/subscription-info", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");

    const [studio] = await db.select({
      status: studiosTable.status,
      trialEndsAt: studiosTable.trialEndsAt,
      subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
    }).from(studiosTable).where(eq(studiosTable.id, payload.id));

    if (!studio) {
      res.status(404).json({ error: "Không tìm thấy tài khoản" });
      return;
    }

    const now = new Date();
    let daysRemaining: number | null = null;

    if (studio.status === "trial" && studio.trialEndsAt) {
      daysRemaining = Math.max(0, Math.ceil((studio.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (studio.status === "active" && studio.subscriptionExpiresAt) {
      daysRemaining = Math.max(0, Math.ceil((studio.subscriptionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    res.json({
      status: studio.status,
      trialEndsAt: studio.trialEndsAt?.toISOString() ?? null,
      subscriptionExpiresAt: studio.subscriptionExpiresAt?.toISOString() ?? null,
      daysRemaining,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    res.status(getErrorStatus(msg)).json({ error: msg });
  }
});

export default router;
