import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Sonde de santé (sans authentification, sans donnée sensible) : vérifie que la base répond. */
export async function GET() {
  try {
    get("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
