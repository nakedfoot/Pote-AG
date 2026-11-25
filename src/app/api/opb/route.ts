import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { getPlantDetail, OpbError, searchPlants } from "@/lib/opb";

export const dynamic = "force-dynamic";

// GET /api/opb?q=tomate  -> recherche ; GET /api/opb?pid=xxx -> détail
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const pid = req.nextUrl.searchParams.get("pid")?.trim();
  try {
    if (pid) return NextResponse.json(await getPlantDetail(pid));
    if (q && q.length >= 2) return NextResponse.json({ results: await searchPlants(q) });
    return NextResponse.json({ results: [] });
  } catch (e) {
    const status = e instanceof OpbError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
