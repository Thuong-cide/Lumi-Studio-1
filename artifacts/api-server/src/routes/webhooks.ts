import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, studiosTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

async function getPayosClient() {
  const rows = await db.select().from(settingsTable);
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

router.post("/webhooks/payos", async (req, res): Promise<void> => {
  try {
    let payos;
    try {
      payos = await getPayosClient();
    } catch {
      logger.warn("PayOS webhook received but PayOS not configured");
      res.status(200).json({ success: true });
      return;
    }

    let webhookData;
    try {
      webhookData = payos.verifyPaymentWebhookData(req.body);
    } catch (e) {
      logger.warn({ err: e }, "PayOS webhook signature verification failed");
      res.status(200).json({ success: true });
      return;
    }

    if (webhookData.code !== "00") {
      res.status(200).json({ success: true });
      return;
    }

    const orderCode = Number(webhookData.orderCode);

    const [payment] = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.payosOrderCode, orderCode));

    if (!payment) {
      logger.warn({ orderCode }, "PayOS webhook: payment not found");
      res.status(200).json({ success: true });
      return;
    }

    if (payment.status === "paid") {
      res.status(200).json({ success: true });
      return;
    }

    const now = new Date();

    await db.update(paymentsTable)
      .set({ status: "paid", paidAt: now })
      .where(eq(paymentsTable.id, payment.id));

    const [studio] = await db.select({
      id: studiosTable.id,
      status: studiosTable.status,
      subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
    }).from(studiosTable).where(eq(studiosTable.id, payment.studioId));

    if (!studio) {
      logger.warn({ studioId: payment.studioId }, "PayOS webhook: studio not found");
      res.status(200).json({ success: true });
      return;
    }

    const daysToAdd = payment.months * 30;
    let newExpiry: Date;

    if (studio.status === "active" && studio.subscriptionExpiresAt && studio.subscriptionExpiresAt > now) {
      newExpiry = new Date(studio.subscriptionExpiresAt);
    } else {
      newExpiry = new Date(now);
    }
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);

    await db.update(studiosTable)
      .set({ status: "active", subscriptionExpiresAt: newExpiry })
      .where(eq(studiosTable.id, studio.id));

    logger.info({ studioId: studio.id, orderCode, newExpiry }, "PayOS payment processed successfully");
    res.status(200).json({ success: true });
  } catch (e) {
    logger.error(e, "[PAYOS WEBHOOK]");
    res.status(200).json({ success: true });
  }
});

export default router;
