import { google } from "googleapis";
import { Readable } from "stream";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

let _configCache: GoogleConfig | null = null;

export async function getGoogleConfig(): Promise<GoogleConfig> {
  if (_configCache) return _configCache;
  try {
    const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "google_oauth"));
    if (row) {
      const parsed = JSON.parse(row.value) as GoogleConfig;
      if (parsed.clientId && parsed.clientSecret && parsed.redirectUri) {
        _configCache = parsed;
        return _configCache;
      }
    }
  } catch {}
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  };
}

export function invalidateGoogleConfigCache() {
  _configCache = null;
}

async function getOAuthClient() {
  const config = await getGoogleConfig();
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export async function getAuthUrl(state?: string): Promise<string> {
  const oauth2 = await getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
    ...(state ? { state } : {}),
  });
}

export async function getTokensFromCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const oauth2 = await getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Không nhận được refresh token. Hãy revoke quyền truy cập và thử lại.");
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
  };
}

export async function getDriveClient(refreshToken: string) {
  const oauth2 = await getOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

export async function createFolder(refreshToken: string, name: string, parentId?: string): Promise<string> {
  const drive = await getDriveClient(refreshToken);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });
  return res.data.id!;
}

export async function uploadFileToDrive(
  refreshToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ fileId: string; thumbnailUrl: string }> {
  const drive = await getDriveClient(refreshToken);
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: "id,thumbnailLink",
  });
  return {
    fileId: res.data.id!,
    thumbnailUrl: res.data.thumbnailLink ?? "",
  };
}

export async function getFileStream(refreshToken: string, fileId: string): Promise<NodeJS.ReadableStream> {
  const drive = await getDriveClient(refreshToken);
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data as unknown as NodeJS.ReadableStream;
}
