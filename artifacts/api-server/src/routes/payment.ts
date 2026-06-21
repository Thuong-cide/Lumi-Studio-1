import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, settingsTable, studiosTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, getErrorStatus } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

async function getPayosClient() {
  const rows = await db.select().from(settingsTable).where(
    inArray(settingsTable.key, ["payos_client_id", "payos_api_key", "payos_checksum_key"])
  );

  const settingsMap: Record<string, string> = {};
  for (const row of rows) {
    settingsMap[row.key] = row.value;
  }

  const clientId = settingsMap["payos_client_id"] ?? "";
  const apiKey = settingsMap["payos_api_key"] ?? "";
  const checksumKey = settingsMap["payos_checksum_key"] ?? "";

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error("PAYOS_NOT_CONFIGURED");
  }

  const PayOS = (await import("@payos/node")).default;
  return new PayOS(clientId, apiKey, checksumKey);
}

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? "";
}

router.post("/studio/payment/create-order", async (req, res): Promise<void> => {
  try {
    const payload = requireAuth(req, "STUDIO");

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

    const amountStr = await getSetting("monthly_price");
    const amount = parseInt(amountStr || "299000", 10);

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

    const paymentLink = await payos.createPaymentLink({
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
      months: 1,
    });

    res.json({
      qrCode: paymentLink.qrCode,
      checkoutUrl: paymentLink.checkoutUrl,
      transferContent,
      amount,
      orderCode,
    });
  } catch (e: unknown) {
    logger.error(e, "[CREATE PAYMENT ORDER]");
    const msg = e instanceof Error ? e.message : "Lỗi server";
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
