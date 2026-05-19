import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request } from "express";

const SECRET = process.env.JWT_SECRET ?? "lumiere-dev-secret-change-in-production";

export interface JWTPayload {
  id: string;
  email: string;
  role: "ADMIN" | "STUDIO";
  status?: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, SECRET) as JWTPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  const cookie = req.cookies?.["lumiere_token"];
  return cookie ?? null;
}

export function requireAuth(req: Request, role?: "ADMIN" | "STUDIO"): JWTPayload {
  const token = getTokenFromRequest(req);
  if (!token) throw new Error("Unauthorized");

  let payload: JWTPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new Error("Unauthorized");
  }

  if (role && payload.role !== role) throw new Error("Forbidden");

  if (payload.role === "STUDIO" && payload.status !== "APPROVED") {
    throw new Error("Studio chưa được phê duyệt");
  }

  return payload;
}

export function getErrorStatus(message: string): number {
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  if (message === "Studio chưa được phê duyệt") return 403;
  return 500;
}
