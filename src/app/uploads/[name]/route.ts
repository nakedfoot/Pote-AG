import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { UPLOAD_DIR, UPLOAD_NAME } from "@/lib/image";

export const dynamic = "force-dynamic";

// Public (sans session) : Home Assistant doit pouvoir récupérer l'image via l'URL publiée en MQTT.
export async function GET(_req: Request, ctx: RouteContext<"/uploads/[name]">) {
  const { name } = await ctx.params;
  if (!UPLOAD_NAME.test(name)) return new NextResponse("Not found", { status: 404 });
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400, immutable" },
  });
}
