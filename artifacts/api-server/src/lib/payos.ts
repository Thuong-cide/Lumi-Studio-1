import { PayOS } from "@payos/node";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export async function getPayosClient(): Promise<PayOS> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(
      inArray(settingsTable.key, [
        "payos_client_id",
        "payos_api_key",
        "payos_checksum_key",
      ]),
    );

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const clientId = map["payos_client_id"] ?? "";
  const apiKey = map["payos_api_key"] ?? "";
  const checksumKey = map["payos_checksum_key"] ?? "";

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error("PAYOS_NOT_CONFIGURED");
  }

  return new PayOS({ clientId, apiKey, checksumKey });
}
