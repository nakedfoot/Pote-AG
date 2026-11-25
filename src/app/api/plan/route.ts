import fs from "node:fs";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { PLAN_FILE } from "@/lib/image";

export const dynamic = "force-dynamic";

// Image du plan : réservée aux utilisateurs connectés (contrairement aux photos de plants).
export async function GET() {
  if (!(await currentUser())) return new NextResponse("Unauthorized", { status: 401 });
  if (!fs.existsSync(PLAN_FILE)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(PLAN_FILE)), {
    // Le client ajoute ?v=<date de modification> : le cache peut être long.
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" },
  });
}
