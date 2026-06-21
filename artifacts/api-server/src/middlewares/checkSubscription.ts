import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { studiosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTokenFromRequest, verifyToken } from "../lib/auth";

export async function checkSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    next();
    return;
  }

  if (payload.role !== "STUDIO") {
    next();
    return;
  }

  try {
    const [studio] = await db
      .select({
        id: studiosTable.id,
        status: studiosTable.status,
        trialEndsAt: studiosTable.trialEndsAt,
        subscriptionExpiresAt: studiosTable.subscriptionExpiresAt,
      })
      .from(studiosTable)
      .where(eq(studiosTable.id, payload.id));

    if (!studio) {
      res.status(401).json({ error: "Không tìm thấy tài khoản" });
      return;
    }

    const now = new Date();
    let newStatus: string | null = null;

    if (studio.status === "trial" && studio.trialEndsAt && studio.trialEndsAt < now) {
      newStatus = "expired";
    } else if (studio.status === "active" && studio.subscriptionExpiresAt && studio.subscriptionExpiresAt < now) {
      newStatus = "expired";
    }

    if (newStatus) {
      await db.update(studiosTable).set({ status: newStatus }).where(eq(studiosTable.id, studio.id));
      res.status(403).json({ code: "SUBSCRIPTION_EXPIRED", error: "Tài khoản đã hết hạn sử dụng. Vui lòng gia hạn để tiếp tục." });
      return;
    }

    if (studio.status === "expired" || studio.status === "disabled" || studio.status === "DISABLED") {
      res.status(403).json({ code: "SUBSCRIPTION_EXPIRED", error: "Tài khoản đã hết hạn hoặc bị vô hiệu hóa. Vui lòng gia hạn để tiếp tục." });
      return;
    }

    next();
  } catch (e) {
    next(e);
  }
}
