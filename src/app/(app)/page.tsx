import Link from "next/link";
import { arroser } from "@/app/actions/garden";
import AutoRefresh from "@/components/AutoRefresh";
import { Gauge, Sparkline } from "@/components/Charts";
import { recentSeries } from "@/lib/history";
import { METRICS, STATUTS } from "@/lib/metrics";
import { rappelIcone, rappelsDuPlant } from "@/lib/rappels";
import { ageJours, ilYa, listPlants, plantStatus, type Plant, type PlantRow, type PlantStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DOT = { ok: "bg-green-500", bas: "bg-amber-500", haut: "bg-red-500", inconnu: "bg-gray-400" } as const;
const FILTRES = { tout: "Tout", surveiller: "À surveiller", arroser: "À arroser" } as const;
type Filtre = keyof typeof FILTRES;

type Item = { p: PlantRow; s: PlantStatus; surveiller: boolean };

function Vignette({ p, s }: { p: PlantRow; s: PlantStatus }) {
  const age = ageJours(p.date_plantation);
  const sol = s.mesures.find((m) => m.metrique === "hum_sol");
  const temp = s.mesures.find((m) => m.metrique === "temp_air");
  const autres = s.mesures.filter((m) => m.metrique !== "hum_sol" && m.metrique !== "temp_air");
  const spark = (temp ?? sol) ? recentSeries(p as Plant).find((x) => x.metrique === (temp ? "temp_air" : "hum_sol")) : undefined;
  const dernier = s.dernierArrosage ? ageJours(s.dernierArrosage) : null;

  return (
    <div className="card relative flex flex-col gap-2 transition hover:shadow-md">
      <Link href={`/plants/${p.id}`} className="absolute inset-0 rounded-xl" aria-label={`Ouvrir ${p.nom}`} />
      {/* Photo ronde, en haut à gauche, qui déborde du cadre */}
      <div className="pointer-events-none absolute -left-6 -top-8 z-10 h-32 w-32 overflow-hidden rounded-full border-4 border-card bg-green-100 shadow-md dark:bg-green-900/40">
        {p.photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-5xl">🌱</span>
        )}
      </div>
      <div className="flex min-h-20 items-start gap-2 pl-28">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{p.nom}</div>
          <div className="truncate text-xs text-muted">
            {p.variete ? `${p.variete} · ` : ""}{STATUTS[p.statut as keyof typeof STATUTS] ?? p.statut}{age !== null && ` · ${age} j`}
          </div>
        </div>
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${DOT[s.pire]}`} title={s.mesures.length ? "État global selon les seuils" : "Pas de capteur associé"} />
      </div>

      {s.mesures.length === 0 ? (
        <div className="text-xs text-muted">Pas de capteur associé</div>
      ) : (
        <>
          {sol && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{METRICS.hum_sol.icone} Sol</span>
                <span className={sol.etat === "bas" ? "font-semibold text-amber-600" : sol.etat === "haut" ? "font-semibold text-red-600" : ""}>
                  {sol.valeur ?? "—"} {METRICS.hum_sol.unite}
                </span>
              </div>
              <Gauge value={sol.valeur} min={p.hum_sol_min} max={p.hum_sol_max} />
            </div>
          )}
          {temp && (
            <div className="flex items-center justify-between text-sm">
              <span>{METRICS.temp_air.icone} {temp.valeur ?? "—"} {METRICS.temp_air.unite}</span>
              {spark && <Sparkline points={spark.points} />}
            </div>
          )}
          {autres.length > 0 && (
            <div className="flex flex-wrap gap-x-3 text-xs text-muted">
              {autres.map((m) => (
                <span key={m.metrique} title={METRICS[m.metrique].label}>{METRICS[m.metrique].icone} {m.valeur ?? "—"} {METRICS[m.metrique].unite}</span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
        <span>💧 {dernier === null ? "jamais arrosé" : dernier === 0 ? "arrosé aujourd'hui" : `arrosé il y a ${dernier} j`}</span>
        {s.batterieBasse && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700" title={`Batterie ${s.batterie} %`}>🔋 faible</span>}
        {s.perime && s.mesures.length > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800" title={`Dernière mesure ${ilYa(Math.max(...s.mesures.map((m) => m.ts ?? 0)) || null)}`}>⏱ donnée ancienne</span>
        )}
      </div>
      <form action={arroser} className="relative z-10">
        <input type="hidden" name="plant_id" value={p.id} />
        <button className="btn-secondary w-full py-1 text-xs">💧 J&apos;ai arrosé</button>
      </form>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const filtre: Filtre = typeof sp.f === "string" && sp.f in FILTRES ? (sp.f as Filtre) : "tout";
  const plants = listPlants();

  if (plants.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pt-16 text-center">
        <div className="text-5xl">🌱</div>
        <h1 className="text-2xl font-semibold">Votre potager est vide</h1>
        <p className="text-sm text-muted">Créez une zone et un carré, puis ajoutez votre premier plant.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/zones" className="btn-secondary">📍 Créer une zone</Link>
          <Link href="/plants/new" className="btn">➕ Nouveau plant</Link>
        </div>
      </div>
    );
  }

  const items: Item[] = plants.map((p) => {
    const s = plantStatus(p);
    return { p, s, surveiller: s.pire === "bas" || s.pire === "haut" || s.batterieBasse || (s.perime && s.mesures.length > 0) };
  });
  const counts: Record<Filtre, number> = {
    tout: items.length,
    surveiller: items.filter((i) => i.surveiller).length,
    arroser: items.filter((i) => i.s.aArroser).length,
  };
  const rappels = items
    .flatMap(({ p, s }) => rappelsDuPlant(p, s))
    .sort((a, b) => b.urgence - a.urgence || a.nom.localeCompare(b.nom));
  const shown = items.filter((i) => (filtre === "surveiller" ? i.surveiller : filtre === "arroser" ? i.s.aArroser : true));

  // Regroupement Zone > Carré
  const groups = new Map<string, Map<string, Item[]>>();
  for (const it of shown) {
    const z = it.p.zone_nom ?? "Non affectés";
    const c = it.p.carre_nom ?? "—";
    if (!groups.has(z)) groups.set(z, new Map());
    const cm = groups.get(z)!;
    if (!cm.has(c)) cm.set(c, []);
    cm.get(c)!.push(it);
  }

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">🏠 Accueil</h1>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTRES) as Filtre[]).map((k) => (
            <Link
              key={k}
              href={k === "tout" ? "/" : `/?f=${k}`}
              className={`rounded-full border px-3 py-1 text-sm ${filtre === k ? "border-green-700 bg-green-700 text-white" : "border-border bg-card hover:bg-black/5 dark:hover:bg-white/5"}`}
            >
              {FILTRES[k]} <span className="opacity-70">{counts[k]}</span>
            </Link>
          ))}
        </div>
      </div>

      {filtre === "tout" && rappels.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">📋 À faire <span className="font-normal text-muted">· {rappels.length}</span></h2>
          <ul className="divide-y divide-border text-sm">
            {rappels.map((r, i) => (
              <li key={`${r.plant_id}-${r.type}-${i}`}>
                <Link href={`/plants/${r.plant_id}`} className="flex flex-wrap items-center gap-x-2 py-1.5 hover:underline">
                  <span>{rappelIcone(r.type)}</span>
                  <span className="font-medium">{r.nom}</span>
                  <span className="text-muted">· {r.message}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 && (
        <p className="card text-sm text-muted">
          {filtre === "arroser" ? "Aucun plant n'a soif pour l'instant 🎉" : "Rien à surveiller pour l'instant 🎉"}
        </p>
      )}

      {[...groups].map(([zone, carres]) => (
        <section key={zone} className="space-y-4">
          <h2 className="border-b border-border pb-1 text-lg font-semibold">📍 {zone}</h2>
          {[...carres].map(([carre, its]) => {
            const alertes = its.filter((i) => i.surveiller).length;
            return (
              <div key={carre} className="space-y-2">
                <h3 className="text-sm font-medium text-muted">
                  🟩 {carre} · {its.length} plant(s)
                  {alertes > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{alertes} à surveiller</span>}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-x-6 gap-y-12 pl-6 pt-8">
                  {its.map(({ p, s }) => <Vignette key={p.id} p={p} s={s} />)}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
