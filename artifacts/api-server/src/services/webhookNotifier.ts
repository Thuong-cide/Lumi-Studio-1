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

async function sendWebhook(
  url: string,
  secret: string | null,
  payload: Record<string, unknown>
): Promise<WebhookResult> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (secret) {
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Lumiere-Signature"] = signature;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { success: false, error: `Webhook trả về status ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
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

  const result = await sendWebhook(studio.n8nWebhookUrl, studio.webhookSecret, {
    event: "album.ready",
    albumId: album.id,
    albumSlug: album.slug,
    galleryUrl: `${process.env.PUBLIC_BASE_URL ?? ""}/album/${album.slug}`,
    customerPhone: album.customerPhone,
    studioId: studio.id,
    timestamp: new Date().toISOString(),
  });

  if (result.success) {
    logger.info({ albumId: album.id, customerPhone: album.customerPhone }, "[WEBHOOK] album.ready sent");
  } else {
    logger.warn({ albumId: album.id, error: result.error }, "[WEBHOOK] album.ready failed");
  }
  return result;
}

export interface DeliverableForWebhook {
  albumId: string;
  albumSlug: string;
  customerPhone: string | null;
  versionLabel: string;
  versionFolderUrl: string;
  photoCount: number;
}

export async function sendDeliverableWebhook(
  deliverable: DeliverableForWebhook,
  studio: StudioForWebhook
): Promise<WebhookResult> {
  if (!studio.n8nWebhookUrl) {
    return { success: false, error: "Studio chưa cấu hình n8n Webhook URL" };
  }

  const result = await sendWebhook(studio.n8nWebhookUrl, studio.webhookSecret, {
    event: "deliverable.uploaded",
    albumId: deliverable.albumId,
    albumSlug: deliverable.albumSlug,
    galleryUrl: `${process.env.PUBLIC_BASE_URL ?? ""}/album/${deliverable.albumSlug}`,
    customerPhone: deliverable.customerPhone ?? null,
    versionLabel: deliverable.versionLabel,
    versionFolderUrl: deliverable.versionFolderUrl,
    photoCount: deliverable.photoCount,
    studioId: studio.id,
    timestamp: new Date().toISOString(),
  });

  if (result.success) {
    logger.info({ albumId: deliverable.albumId, version: deliverable.versionLabel }, "[WEBHOOK] deliverable.uploaded sent");
  } else {
    logger.warn({ albumId: deliverable.albumId, error: result.error }, "[WEBHOOK] deliverable.uploaded failed");
  }
  return result;
}
