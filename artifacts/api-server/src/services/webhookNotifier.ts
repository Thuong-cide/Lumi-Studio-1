import crypto from "crypto";
import { logger } from "../lib/logger";

export interface AlbumForWebhook {
  id: string;
  slug: string;
  customerPhone: string | null;
}

export interface StudioForWebhook {
  id: string;
  n8nWebhookUrl: string | null;
  webhookSecret: string | null;
}

export interface WebhookResult {
  success: boolean;
  error?: string;
}

export async function sendAlbumWebhook(
  album: AlbumForWebhook,
  studio: StudioForWebhook
): Promise<WebhookResult> {
  if (!studio.n8nWebhookUrl) {
    return { success: false, error: "Studio chưa cấu hình n8n Webhook URL" };
  }
  if (!album.customerPhone) {
    return { success: false, error: "Album chưa có số điện thoại khách hàng" };
  }

  const payload = {
    event: "album.ready",
    albumId: album.id,
    albumSlug: album.slug,
    galleryUrl: `${process.env.PUBLIC_BASE_URL ?? ""}/album/${album.slug}`,
    customerPhone: album.customerPhone,
    studioId: studio.id,
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (studio.webhookSecret) {
    const signature = crypto
      .createHmac("sha256", studio.webhookSecret)
      .update(body)
      .digest("hex");
    headers["X-Lumiere-Signature"] = signature;
  }

  try {
    const res = await fetch(studio.n8nWebhookUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errMsg = `n8n trả về status ${res.status}`;
      logger.warn({ albumId: album.id, status: res.status }, "[WEBHOOK] Failed");
      return { success: false, error: errMsg };
    }

    logger.info({ albumId: album.id, customerPhone: album.customerPhone }, "[WEBHOOK] Sent");
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error({ albumId: album.id, err }, "[WEBHOOK] Error");
    return { success: false, error: errMsg };
  }
}
