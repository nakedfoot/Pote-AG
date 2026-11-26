import Link from "next/link";
import { notFound } from "next/navigation";
import { addEvenement, affecterPlant, deletePlant, dupliquerPlant } from "@/app/actions/garden";
import AutoRefresh from "@/components/AutoRefresh";
import Calendrier from "@/components/Calendrier";
import { LineChart, Sparkline } from "@/components/Charts";
import { CARAC_KEYS, CARACS, MOIS_COLS, PERIODES, PROVIDERS, estVide, parseMois, parseSourcesData, periodesDuMois } from "@/lib/botanique";
import { isRange, plantMarks, plantSeries, recentSeries, rangeWindow, RANGES, type Range } from "@/lib/history";
import { METRICS, STATUTS } from "@/lib/metrics";
import { ageJours, formatDate, getPlant, ilYa, listCarres, listEvenements, listZones, plantStatus, type Plant } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ETAT_STYLE = { ok: "bg-green-100 text-green-800", bas: "bg-amber-100 text-amber-800", haut: "bg-red-100 text-red-800", inconnu: "bg-black/5 text-muted" } as const;
const ETAT_LABEL = { ok: "OK", bas: "Trop bas", haut: "Trop haut", inconnu: "—" } as const;
const EVT: Record<string, string> = {
  arrosage: "💧 Arrosage", engrais: "🧴 Engrais", taille: "✂️ Taille",
  traitement: "🧪 Traitement", recolte: "🧺 Récolte", note: "📝 Note",
};
const TABS = { resume: "Résumé", historique: "Historique", journal: "Journal", fiche: "Fiche OpenPlantbook" } as const;
type Tab = keyof typeof TABS;

const OPB_ROWS: [string, string, string, string][] = [
  ["🌡️ Température", "min_temp", "max_temp", "°C"],
  ["💨 Humidité de l'air", "min_env_humid", "max_env_humid", "%"],
  ["💧 Humidité du sol", "min_soil_moist", "max_soil_moist", "%"],
  ["🧪 Conductivité", "min_soil_ec", "max_soil_ec", "µS/cm"],
  ["☀️ Lumière", "min_light_lux", "max_light_lux", "lx"],
  ["☀️ Lumière (PPFD)", "min_light_mmol", "max_light_mmol", "mmol"],
];

type PlantFull = NonNullable<ReturnType<typeof getPlant>>;

export default async function PlantPage({ params, searchParams }: PageProps<"/plants/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const p = getPlant(Number(id));
  if (!p) notFound();

  const opb = p.opb_data ? (JSON.parse(p.opb_data) as Record<string, string | number | null>) : null;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS && (sp.tab !== "fiche" || opb) ? (sp.tab as Tab) : "resume";
  const range: Range = isRange(sp.range) ? sp.range : "7j";

  const age = ageJours(p.date_plantation);
  const status = plantStatus(p);
  const href = (t: Tab, r?: Range) => `/plants/${p.id}?tab=${t}${r ? `&range=${r}` : ""}`;

  return (
    <div className="max-w-4xl space-y-6">
      {tab === "resume" && <AutoRefresh seconds={30} />}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {p.photo && <img src={p.photo} alt="" className="h-28 w-28 shrink-0 rounded-full border-4 border-card object-cover shadow-md" />}
          <div>
            <h1 className="text-2xl font-semibold">🌱 {p.nom}{p.variete && <span className="font-normal text-muted"> · {p.variete}</span>}</h1>
            <p className="text-sm text-muted">
              {p.zone_nom ? `${p.zone_nom} › ${p.carre_nom}` : "Non affecté"} · {STATUTS[p.statut as keyof typeof STATUTS] ?? p.statut}
              {age !== null && ` · planté depuis ${age} j`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/plants/${p.id}/edit`} className="btn-secondary">Modifier</Link>
          <form action={dupliquerPlant}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn-secondary" title="Crée une copie avec les mêmes données et capteurs (journal vide)">Dupliquer</button>
          </form>
          <form action={deletePlant}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn-danger">Supprimer</button>
          </form>
        </div>
      </div>

      <form action={affecterPlant} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="plant_id" value={p.id} />
        <label htmlFor="carre_id" className="text-muted">📍 Emplacement</label>
        <select id="carre_id" name="carre_id" defaultValue={p.carre_id ?? ""} className="input w-auto">
          <option value="">— Non affecté —</option>
          {listZones().map((z) => (
            <optgroup key={z.id} label={z.nom}>
              {listCarres().filter((c) => c.zone_id === z.id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </optgroup>
          ))}
        </select>
        <button className="btn-secondary">Affecter</button>
      </form>

      <nav className="flex gap-1 border-b border-border">
        {(Object.keys(TABS) as Tab[]).filter((t) => t !== "fiche" || opb).map((t) => (
          <Link
            key={t}
            href={href(t, t === "historique" ? range : undefined)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? "border-green-700 font-medium text-green-800 dark:text-green-300" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {TABS[t]}
          </Link>
        ))}
      </nav>

      {tab === "resume" && <Resume p={p} status={status} />}
      {tab === "historique" && <Historique p={p} range={range} href={href} />}
      {tab === "journal" && <Journal p={p} />}
      {tab === "fiche" && opb && (
        <section className="card space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted">Identifiant : </span>{p.opb_pid}</div>
            {opb.category && <div><span className="text-muted">Catégorie : </span>{String(opb.category)}</div>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-normal">Besoin</th><th className="font-normal">Min</th><th className="font-normal">Max</th></tr></thead>
            <tbody className="divide-y divide-border">
              {OPB_ROWS.map(([l, a, b, u]) => (
                <tr key={a}><td className="py-2">{l}</td><td>{opb[a] ?? "—"} {u}</td><td>{opb[b] ?? "—"} {u}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">Source : OpenPlantbook. Ces valeurs ont servi à préremplir les seuils, modifiables via « Modifier ».</p>
        </section>
      )}
    </div>
  );
}

function Resume({ p, status }: { p: PlantFull; status: ReturnType<typeof plantStatus> }) {
  const series = recentSeries(p);
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 font-semibold">Mesures en direct</h2>
        {status.mesures.length === 0 ? (
          <p className="text-sm text-muted">Aucun capteur associé. <Link href={`/plants/${p.id}/edit`} className="underline">Associer des capteurs</Link></p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {status.mesures.map((m) => {
              const s = series.find((x) => x.metrique === m.metrique);
              return (
                <div key={m.metrique} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{METRICS[m.metrique].icone} {METRICS[m.metrique].label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ETAT_STYLE[m.etat]}`}>{ETAT_LABEL[m.etat]}</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between">
                    <div className="text-2xl font-semibold">{m.valeur === null ? "—" : m.valeur} <span className="text-sm font-normal text-muted">{METRICS[m.metrique].unite}</span></div>
                    {s && <Sparkline points={s.points} />}
                  </div>
                  <div className="text-xs text-muted">{m.capteur} · {ilYa(m.ts)}</div>
                </div>
              );
            })}
          </div>
        )}
        {(status.batterieBasse || status.perime) && status.mesures.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {status.batterieBasse && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">🔋 Batterie faible ({status.batterie} %)</span>}
            {status.perime && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">⏱ Données anciennes : vérifier le capteur</span>}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Dates</h2>
        <dl className="grid grid-cols-4 gap-3 text-sm">
          <div><dt className="text-muted">Semis</dt><dd>{formatDate(p.date_semis)}</dd></div>
          <div><dt className="text-muted">Plantation</dt><dd>{formatDate(p.date_plantation)}</dd></div>
          <div><dt className="text-muted">Récolte prévue</dt><dd>{formatDate(p.date_recolte_prevue)}</dd></div>
          <div><dt className="text-muted">Dernier arrosage</dt><dd>{formatDate(status.dernierArrosage)}</dd></div>
        </dl>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Seuils souhaités</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((k) => (
            <div key={k} className="flex justify-between rounded-lg bg-black/5 px-3 py-2 dark:bg-white/5">
              <span>{METRICS[k].icone} {METRICS[k].label}</span>
              <span className="text-muted">{p[METRICS[k].min as keyof Plant] ?? "—"} – {p[METRICS[k].max as keyof Plant] ?? "—"} {METRICS[k].unite}</span>
            </div>
          ))}
        </div>
      </section>

      <Botanique p={p} />

      {p.notes && <section className="card"><h2 className="mb-2 font-semibold">Notes</h2><p className="whitespace-pre-wrap text-sm">{p.notes}</p></section>}
    </div>
  );
}

/** Calendrier et caractéristiques (avec la source de chaque valeur). */
function Botanique({ p }: { p: PlantFull }) {
  const sd = parseSourcesData(p.sources_data);
  const mois = new Date().getMonth() + 1;
  const enCours = periodesDuMois(p, mois);
  const aCalendrier = MOIS_COLS.some((c) => parseMois(p[c]).length > 0);
  const caracs = CARAC_KEYS.filter((k) => k !== "description" && !estVide(p[k]));
  const src = (k: keyof typeof sd.champs) => (sd.champs[k] ? <span className="text-xs text-muted"> · {PROVIDERS[sd.champs[k]]}</span> : null);
  if (!aCalendrier && caracs.length === 0 && !p.description && !p.nom_scientifique) {
    return (
      <section className="card text-sm text-muted">
        Calendrier et caractéristiques non renseignés. <Link href={`/plants/${p.id}/edit`} className="underline">Les compléter</Link> (saisie ou sources botaniques).
      </section>
    );
  }
  return (
    <>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Calendrier</h2>
          <span className="text-sm text-muted">
            Ce mois-ci : {enCours.length ? enCours.map((k) => `${PERIODES[k].icone} ${PERIODES[k].label}`).join(", ") : "aucune période particulière"}
          </span>
        </div>
        {aCalendrier ? (
          <Calendrier valeurs={p} sources={sd.champs} moisCourant={mois} masquerVides />
        ) : (
          <p className="text-sm text-muted">Aucune période renseignée.</p>
        )}
      </section>
      <section className="card space-y-3">
        <h2 className="font-semibold">Caractéristiques</h2>
        {p.nom_scientifique && <p className="text-sm"><span className="text-muted">Nom scientifique : </span><em>{p.nom_scientifique}</em>{src("nom_scientifique")}</p>}
        {caracs.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {caracs.map((k) => (
              <div key={k} className="flex justify-between gap-2 border-b border-border py-1">
                <dt className="text-muted">{CARACS[k].label}</dt>
                <dd className="text-right">{String(p[k])}{src(k)}</dd>
              </div>
            ))}
          </dl>
        )}
        {p.description && <p className="whitespace-pre-wrap text-sm">{p.description}{src("description")}</p>}
        {sd.verifie && <p className="text-xs text-muted">Sources interrogées le {formatDate(sd.verifie)}.</p>}
      </section>
    </>
  );
}

function Historique({ p, range, href }: { p: PlantFull; range: Range; href: (t: Tab, r?: Range) => string }) {
  const { from, to } = rangeWindow(range, p.date_plantation);
  const series = plantSeries(p, from, to);
  const marks = plantMarks(p.id, from, to);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={href("historique", r)} className={`rounded-full border px-3 py-1 text-sm ${range === r ? "border-green-700 bg-green-700 text-white" : "border-border bg-card hover:bg-black/5 dark:hover:bg-white/5"}`}>
            {RANGES[r]}
          </Link>
        ))}
      </div>
      {series.length === 0 ? (
        <p className="card text-sm text-muted">Aucun capteur associé. <Link href={`/plants/${p.id}/edit`} className="underline">Associer des capteurs</Link></p>
      ) : (
        series.map((s) => {
          const vs = s.points.map((x) => x.v);
          const moy = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
          const f = (n: number | null) => (n === null ? "—" : Number(n.toFixed(1)));
          return (
            <section key={s.metrique} className="card space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{METRICS[s.metrique].icone} {METRICS[s.metrique].label} <span className="text-sm font-normal text-muted">({METRICS[s.metrique].unite})</span></h2>
                <span className="text-xs text-muted">min {f(vs.length ? Math.min(...vs) : null)} · moy {f(moy)} · max {f(vs.length ? Math.max(...vs) : null)}</span>
              </div>
              <LineChart points={s.points} from={from} to={to} min={s.min} max={s.max} unite={METRICS[s.metrique].unite} bucketMs={s.bucketMs} marks={marks} />
            </section>
          );
        })
      )}
      <p className="text-xs text-muted">
        La zone verte est la plage souhaitée. 💧 et 🧴 marquent les arrosages et apports d&apos;engrais du journal.
        Les mesures de plus de 30 jours sont conservées en moyennes horaires.
      </p>
    </div>
  );
}

function Journal({ p }: { p: PlantFull }) {
  const evts = listEvenements(p.id);
  return (
    <section className="card space-y-4">
      <form action={addEvenement} className="flex flex-wrap gap-2">
        <input type="hidden" name="plant_id" value={p.id} />
        <select name="type" className="input w-auto">
          {Object.entries(EVT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input w-auto" />
        <input name="commentaire" placeholder="Commentaire (optionnel)" className="input min-w-48 flex-1" />
        <button className="btn">Ajouter</button>
      </form>
      {evts.length === 0 ? (
        <p className="text-sm text-muted">Aucun événement.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {evts.map((e) => (
            <li key={e.id} className="flex gap-3 py-2">
              <span className="w-24 shrink-0 text-muted">{formatDate(e.date)}</span>
              <span className="w-28 shrink-0">{EVT[e.type] ?? e.type}</span>
              <span>{e.commentaire}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
