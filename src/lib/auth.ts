import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get, run } from "./db";

export const SESSION_COOKIE = "potager_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type User = { id: number; email: string; nom: string; role: "admin" | "user" };

export function hashPassword(pwd: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pwd, salt, 64);
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

export function verifyPassword(pwd: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pwd, Buffer.from(salt, "hex"), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, "hex"));
}

export function userCount(): number {
  return (get<{ n: number }>("SELECT COUNT(*) n FROM users")?.n) ?? 0;
}

export async function createSession(userId: number) {
  const id = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_TTL_MS;
  run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", id, userId, expires);
  (await cookies()).set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: new Date(expires),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) run("DELETE FROM sessions WHERE id = ?", id);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return (
    get<User>(
      `SELECT u.id, u.email, u.nom, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
      id,
      Date.now(),
    ) ?? null
  );
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

export function listUsers(): User[] {
  return all<User>("SELECT id, email, nom, role FROM users ORDER BY id");
}
