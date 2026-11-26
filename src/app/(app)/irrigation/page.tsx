import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import { BarreGlobale, CanalControles, GlobalForm, VuAlertes } from "@/components/IrrigationForms";
import { alertesNonVues, listCanauxVue, listLog, type CanalVue, type EtatCanal } from "@/lib/irrigation-service";
import { resumeMeteo } from "@/lib/meteo";
import { getIrrigationSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TABS = { canaux: "💦 Canaux", meteo: "🌦️ Météo & réglages", historique: "📜 Historique" } as const;
type Tab = keyof typeof TABS;

const ETATS: Record<EtatCanal, { icone: string; label: string; classe: string }> = {
  ouvert: { icone: "💧", label: "Vanne ouverte", classe: "bg-blue-100 text-blue-800" },
  pause: { icone: "🕒", label: "Pause entre paliers", classe: "bg-sky-100 text-sky-800" },
  attente: { icone: "⏳", label: "Attente mesure", classe: "bg-sky-100 text-sky-800" },
  bloque: { icone: "⛔", label: "Bloqué", classe: "bg-amber-100 text-amber-800" },
  inutile: { icone: "✅", label: "Sol assez humide", classe: "bg-green-100 text-green-800" },
  ok: { icone: "✅", label: "Prêt", classe: "bg-green-100 text-green-800" },
  inactif: { icone: "⚪", label: "Inactif", classe: "bg-black/5 text-muted" },
  manuel: { icone: "🖐️", label: "Mode manuel", classe: "bg-black/5 text-muted" },
  pause_globale: { icone: "⏸", label: "Pause globale", classe: "bg-amber-100 text-amber-800" },
  hors_ligne: { icone: "🔌", label: "MQTT hors ligne", classe: "bg-red-100 text-red-700" },
  inconnu: { icone: "…", label: "Calcul en cours", classe: "bg-black/5 text-muted" },
};

const LOG_ICONE: Record<string, string> = { debut: "▶️", palier: "💧", fin: "🏁", manuel: "🖐️", bloque: "⛔", alerte: "🚨", info: "ℹ️" };

const fmtHeure = (ts: number, tz: string) => new Date(ts).toLocaleString("fr-FR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const mmss = (s: number) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
const ilYaMin = (ts: number | null) => (ts === null ? "—" : `il y a ${Math.max(0, Math.round((Date.now() - ts) / 60000))} min`);
const arrondi = (v: number) => Math.round(v * 10) / 10;

function Carte({ c }: { c: CanalVue }) {
  const e = ETATS[c.etat];
  const enCours = c.etat === "ouvert" || c.etat === "pause" || c.etat === "attente";
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">🚿 {c.nom}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.classe}`}>{e.icone} {e.label}</span>
        <Link href={`/irrigation/canal/${c.id}`} className="ml-auto text-sm hover:underline">⚙ Configurer</Link>
      </div>
      <div className="text-sm text-muted">
        Vanne : {c.vanne ?? "—"}{c.vanneEtat && ` (${c.vanneEtat === "ON" ? "ouverte" : "fermée"})`} · Carrés : {c.carres.length ? c.carres.map((x) => x.nom).join(", ") : "—"}
      </div>
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          💧 Sol : <b>{c.humidite !== null ? `${arrondi(c.humidite)} %` : "—"}</b>{" "}
          <span className="text-muted">(mini des capteurs · {ilYaMin(c.humiditeTs)})</span>
        </div>
        <div className="text-muted">Seuil {c.config.seuil} % → cible {c.config.cible} %{c.temp !== null && ` · 🌡️ ${arrondi(c.temp)} °C`}</div>
      </div>
      <p className="text-sm">{c.message}{c.secondesRestantes !== null && <b> · {mmss(c.secondesRestantes)}</b>}</p>
      {c.etat === "ouvert" && (
        <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-full w-full animate-pulse bg-blue-500" />
        </div>
      )}
      <div className="text-xs text-muted">
        {c.dernier ? `Dernier évènement : ${c.dernier.message}` : "Aucun arrosage pour l'instant"}
        {c.config.auto_calibrage && c.kAppris && ` · calibrage : ${c.kAppris} min/point`}
      </div>
      <CanalControles id={c.id} enCours={enCours} actif={c.actif} auto={c.auto} />
    </div>
  );
}

export default async function IrrigationPage({ searchParams }: PageProps<"/irrigation">) {
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "canaux";
  const canalFiltre = typeof sp.canal === "string" ? Number(sp.canal) || null : null;
  const settings = getIrrigationSettings();
  const vues = listCanauxVue();
  const alertes = alertesNonVues();
  const meteo = resumeMeteo();
  const logs = tab === "historique" ? listLog(canalFiltre, 200) : [];

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={10} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">💦 Irrigation</h1>
        <BarreGlobale pause={settings.pause} pauseJusqu={settings.pauseJusqu} />
      </div>

      {settings.pause && (
        <p className="card border-amber-400 text-sm">⏸ Les arrosages automatiques sont en pause{settings.pauseJusqu ? ` jusqu'au ${settings.pauseJusqu} inclus` : " (jusqu'à reprise manuelle)"}. L&apos;arrosage manuel reste possible.</p>
      )}

      {alertes.length > 0 && (
        <section className="card space-y-2 border-red-400">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-red-700 dark:text-red-400">🚨 Alertes d&apos;irrigation · {alertes.length}</h2>
            <span className="ml-auto"><VuAlertes /></span>
          </div>
          <ul className="space-y-1 text-sm">
            {alertes.map((a) => (
              <li key={a.id}><span className="text-muted">{fmtHeure(a.ts, settings.fuseau)}</span> · <b>{a.canal_nom}</b> : {a.message}</li>
            ))}
          </ul>
        </section>
      )}

      <nav className="flex flex-wrap gap-2">
        {(Object.keys(TABS) as Tab[]).map((k) => (
          <Link
            key={k}
            href={k === "canaux" ? "/irrigation" : `/irrigation?tab=${k}`}
            className={`rounded-full border px-3 py-1 text-sm ${tab === k ? "border-green-700 bg-green-700 text-white" : "border-border bg-card hover:bg-black/5 dark:hover:bg-white/5"}`}
          >
            {TABS[k]}
          </Link>
        ))}
      </nav>

      {tab === "canaux" && (
        <>
          <p className="text-sm text-muted">
            {settings.latitude === null
              ? "🌦️ Position du jardin non renseignée : les règles météo (pluie, température) sont ignorées. Voir l'onglet « Météo & réglages »."
              : meteo.ok
                ? `🌦️ ${meteo.temp ?? "?"} °C · pluie 4 h passées : ${meteo.passee} mm · prévue 24 h : ${meteo.prevue} mm`
                : `🌦️ Météo indisponible${meteo.erreur ? ` (${meteo.erreur})` : ""}`}
          </p>
          {vues.length === 0 ? (
            <div className="card space-y-3 text-center">
              <div className="text-4xl">🚿</div>
              <p className="text-sm text-muted">Aucun canal d&apos;irrigation. Un canal associe une vanne Zigbee à un ou plusieurs carrés.</p>
              <div><Link href="/irrigation/canal/new" className="btn">➕ Créer un canal</Link></div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">{vues.map((c) => <Carte key={c.id} c={c} />)}</div>
              <Link href="/irrigation/canal/new" className="btn inline-block">➕ Nouveau canal</Link>
            </>
          )}
        </>
      )}

      {tab === "meteo" && (
        <div className="max-w-3xl space-y-4">
          <p className="text-sm text-muted">Source météo : Open-Meteo (gratuit, sans clé). La position sert à récupérer la pluie passée et prévue.</p>
          <GlobalForm v={{ latitude: settings.latitude, longitude: settings.longitude, fuseau: settings.fuseau, plages: settings.plages, mesureMaxMin: settings.mesureMaxMin, meteoIndispo: settings.meteoIndispo }} />
        </div>
      )}

      {tab === "historique" && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Canal :</span>
            <Link href="/irrigation?tab=historique" className={`rounded-full border px-2 py-0.5 ${!canalFiltre ? "border-green-700 bg-green-700 text-white" : "border-border"}`}>Tous</Link>
            {vues.map((c) => (
              <Link key={c.id} href={`/irrigation?tab=historique&canal=${c.id}`} className={`rounded-full border px-2 py-0.5 ${canalFiltre === c.id ? "border-green-700 bg-green-700 text-white" : "border-border"}`}>{c.nom}</Link>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Canal</th><th className="pr-3 font-medium">Évènement</th><th className="font-medium">Humidité</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id} className={l.niveau === "alerte" ? "bg-red-50 dark:bg-red-950/30" : ""}>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{fmtHeure(l.ts, settings.fuseau)}</td>
                    <td className="pr-3">{l.canal_nom}</td>
                    <td className="pr-3">{LOG_ICONE[l.niveau === "alerte" ? "alerte" : l.type] ?? "•"} {l.message}</td>
                    <td className="whitespace-nowrap">
                      {l.hum_avant !== null ? arrondi(l.hum_avant) : ""}{l.hum_apres !== null ? ` → ${arrondi(l.hum_apres)}` : ""}{l.hum_avant !== null || l.hum_apres !== null ? " %" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <p className="py-4 text-center text-sm text-muted">Aucun évènement pour l&apos;instant.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
