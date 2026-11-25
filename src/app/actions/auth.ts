"use server";

import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  requireAdmin,
  userCount,
  verifyPassword,
} from "@/lib/auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function setupAdmin(formData: FormData) {
  if (userCount() > 0) redirect("/login");
  const email = str(formData, "email").toLowerCase();
  const nom = str(formData, "nom") || "Admin";
  const pwd = str(formData, "password");
  if (!email || pwd.length < 8) redirect("/setup?err=1");
  const r = run("INSERT INTO users (email, nom, hash, role) VALUES (?, ?, ?, 'admin')", email, nom, hashPassword(pwd));
  await createSession(Number(r.lastInsertRowid));
  redirect("/");
}

export async function login(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const pwd = str(formData, "password");
  const u = get<{ id: number; hash: string }>("SELECT id, hash FROM users WHERE email = ?", email);
  if (!u || !verifyPassword(pwd, u.hash)) redirect("/login?err=1");
  await createSession(u.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function addUser(formData: FormData) {
  await requireAdmin();
  const email = str(formData, "email").toLowerCase();
  const nom = str(formData, "nom") || email;
  const pwd = str(formData, "password");
  const role = str(formData, "role") === "admin" ? "admin" : "user";
  if (!email || pwd.length < 8) redirect("/settings/users?err=1");
  if (get("SELECT 1 FROM users WHERE email = ?", email)) redirect("/settings/users?err=2");
  run("INSERT INTO users (email, nom, hash, role) VALUES (?, ?, ?, ?)", email, nom, hashPassword(pwd), role);
  redirect("/settings/users");
}

export async function deleteUser(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  if (id === me.id) redirect("/settings/users?err=3");
  run("DELETE FROM users WHERE id = ?", id);
  redirect("/settings/users");
}
