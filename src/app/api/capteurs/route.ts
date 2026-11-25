import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getMqttStatus, listCapteursLive } from "@/lib/mqtt-service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ status: getMqttStatus(), capteurs: listCapteursLive() });
}
