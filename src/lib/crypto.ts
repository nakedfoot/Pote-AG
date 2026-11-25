import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

// Clé AES-256 : variable APP_SECRET, sinon fichier généré dans le dossier de données.
function key(): Buffer {
  if (process.env.APP_SECRET) {
    return crypto.createHash("sha256").update(process.env.APP_SECRET).digest();
  }
  const file = path.join(DATA_DIR, ".secret");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
}

export function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function decrypt(payload: string): string {
  if (!payload) return "";
  try {
    const buf = Buffer.from(payload, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
