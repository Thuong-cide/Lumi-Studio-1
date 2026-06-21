import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, studiosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPayosClient } from "../lib/payos";
import { logger } from "../lib/logger";

const router = Router();

router.post("/webhooks/payos", async (req, res): Promise<void> => {
  res.status(200).json({ success: true });

  try {
    let payos;
    try {
      payos = await getPayosClient();
    } catch {
      logger.warn("PayOS webhook received but PayOS not configured");
      return;
    }

    let webhookData;
    try {
      webhookData = await payos.webhooks.verify(req.body);
    } catch (e) {
      logger.warn({ err: e }, "PayOS webhook signature verification failed");
      return;
    }

    if (webhookData.code !== "00") return;

    const orderCode = Number(webhookData.orderCode);

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.payosOrderCode, orderCode));

    if (!payment) {
      logger.warn({ orderCode }, "PayOS webhook: payment not found");
      return;
    }

    if (payment.status === "paid") return;

    const now = new Date();

    await db
      .update(paymentsTable)
      .set({ status: "paid", paidAt: now })
      .where(eq(paymentsTable.id, payment.id));

    const [studio] = await db
      .select({
        id: studiosTable.id,
        status: studiosTable.status,
        subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
      })
      .from(studiosTable)
      .where(eq(studiosTable.id, payment.studioId));

    if (!studio) {
      logger.warn({ studioId: payment.studioId }, "PayOS webhook: studio not found");
      return;
    }

    const daysToAdd = payment.months * 30;
    let newExpiry: Date;

    if (
      studio.status === "active" &&
      studio.subscriptionExpiresAt &&
      studio.subscriptionExpiresAt > now
    ) {
      newExpiry = new Date(studio.subscriptionExpiresAt);
    } else {
      newExpiry = new Date(now);
    }
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);

    await db
      .update(studiosTable)
      .set({ status: "active", subscriptionExpiresAt: newExpiry })
      .where(eq(studiosTable.id, studio.id));

    logger.info(
      { studioId: studio.id, orderCode, newExpiry },
      "PayOS payment processed successfully",
    );
  } catch (e) {
    logger.error(e, "[PAYOS WEBHOOK]");
  }
});

export default router;
