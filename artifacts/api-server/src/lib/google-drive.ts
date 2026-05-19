import { google } from "googleapis";
import { Readable } from "stream";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
}

export function getAuthUrl(state?: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
    ...(state ? { state } : {}),
  });
}

export async function getTokensFromCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Không nhận được refresh token. Hãy revoke quyền truy cập và thử lại.");
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
  };
}

export function getDriveClient(refreshToken: string) {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

export async function createFolder(refreshToken: string, name: string, parentId?: string): Promise<string> {
  const drive = getDriveClient(refreshToken);
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
  const drive = getDriveClient(refreshToken);
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
  const drive = getDriveClient(refreshToken);
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data as unknown as NodeJS.ReadableStream;
}
