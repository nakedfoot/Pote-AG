import { NextResponse, type NextRequest } from "next/server";
import { parseSourcesData } from "@/lib/botanique";
import { currentUser } from "@/lib/auth";
import { collecter, identifier, rechercher } from "@/lib/sources";

export const dynamic = "force-dynamic";

/**
 * GET /api/plantes?q=tomate                      -> suggestions d'espèces (OpenPlantbook + iNaturalist)
 * GET /api/plantes?sci=Solanum%20lycopersicum&ids={...} -> fiche fusionnée selon l'ordre de priorité des sources
 * GET /api/plantes?nom=tomate                    -> idem, en identifiant d'abord l'espèce à partir du nom commun
 */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  try {
    if (q !== undefined) return NextResponse.json(q.length >= 2 ? await rechercher(q) : { results: [], erreurs: [] });

    const ids = parseSourcesData(JSON.stringify({ ids: JSON.parse(sp.get("ids") || "{}") })).ids;
    let sci = sp.get("sci")?.trim() ?? "";
    const nom = sp.get("nom")?.trim() ?? "";
    if (!sci && nom) {
      const r = await identifier(nom);
      if (r) {
        sci = r.sci;
        ids.inaturalist ??= r.id;
      }
    }
    if (!sci) return NextResponse.json({ error: "Espèce non identifiée : renseignez le nom scientifique ou recherchez la plante." }, { status: 404 });
    return NextResponse.json({ sci, ...(await collecter(sci, ids)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
