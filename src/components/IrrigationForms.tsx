"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  arreterCanal, arretUrgence, arroserManuel, deleteCanal, marquerAlertesVues, saveCanal, saveIrrigationGlobal, setCanalMode, setPause,
} from "@/app/actions/irrigation";
import type { ActionResult } from "@/app/actions/settings";
import { suggererSeuils, type CanalConfig } from "@/lib/irrigation";
import type { Plage } from "@/lib/settings";

function Result({ r }: { r: ActionResult | null }) {
  if (!r || !r.message) return null;
  return <p className={`rounded-lg p-2 text-sm ${r.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{r.message}</p>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const Num = ({ name, v, min, max, step = "any" }: { name: string; v: number; min?: number; max?: number; step?: string }) => (
  <input name={name} type="number" step={step} min={min} max={max} defaultValue={v} required className="input" />
);

// ---------- Plages horaires ----------
function PlagesEditor({ initial }: { initial: Plage[] }) {
  const [rows, setRows] = useState<Plage[]>(initial.length ? initial : []);
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-xs text-muted">Aucune plage : arrosage possible à toute heure.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="time" name="plage_debut" defaultValue={r.debut} required className="input w-32" />
          <span className="text-muted">→</span>
          <input type="time" name="plage_fin" defaultValue={r.fin} required className="input w-32" />
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-sm text-red-600" aria-label="Supprimer la plage">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { debut: "06:00", fin: "09:00" }])} className="btn-secondary px-2 py-1 text-xs">➕ Ajouter une plage</button>
    </div>
  );
}

// ---------- Formulaire de canal ----------
export type VanneOption = { id: number; nom: string; modele: string | null; utilisee: boolean };
export type CarreOption = { id: number; nom: string; zone: string; nbCapteurs: number; plants: { nom: string; min: number | null; max: number | null }[] };

export function CanalForm({
  canal, vannes, carres, plagesDefaut,
}: {
  canal: { id: number; nom: string; capteurId: number | null; carres: number[]; config: CanalConfig } | null;
  vannes: VanneOption[];
  carres: CarreOption[];
  plagesDefaut: Plage[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [selection, setSelection] = useState<number[]>(canal?.carres ?? []);
  const [seuil, setSeuil] = useState(canal?.config.seuil ?? 30);
  const [cible, setCible] = useState(canal?.config.cible ?? 40);
  const c = canal?.config;
  const d = c ?? {
    temp_min: 5, pluie_passee_h: 4, pluie_passee_mm: 1, pluie_prevue_mm: 2, plages: plagesDefaut,
    min_par_point: 2, auto_calibrage: true, palier_min: 3, palier_max: 10, pause_min: 15, paliers_max: 4, duree_totale_max: 40,
    cycles_jour_max: 3, duree_jour_max: 60, delai_cycles_min: 120, on_time: false,
  };

  const suggestion = suggererSeuils(carres.filter((x) => selection.includes(x.id)).flatMap((x) => x.plants));
  const toggle = (id: number) => {
    const next = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
    setSelection(next);
    // Création : on préremplit seuil et cible d'après les plants des carrés choisis
    if (!canal) {
      const s = suggererSeuils(carres.filter((x) => next.includes(x.id)).flatMap((x) => x.plants));
      if (s) {
        setSeuil(s.seuil);
        setCible(s.cible);
      }
    }
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveCanal(null, data);
      setResult(r);
      if (r.ok) {
        router.push("/irrigation");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {canal && <input type="hidden" name="id" value={canal.id} />}
      <section className="card space-y-3">
        <h2 className="font-semibold">Canal</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <input name="nom" defaultValue={canal?.nom ?? ""} required className="input" placeholder="Potager sud" />
          </Field>
          <Field label="Vanne Zigbee" hint="Appareils Zigbee2MQTT exposant un interrupteur (state ON/OFF).">
            <select name="capteur_id" defaultValue={canal?.capteurId ?? ""} required className="input">
              <option value="" disabled>— choisir —</option>
              {vannes.map((v) => (
                <option key={v.id} value={v.id} disabled={v.utilisee && v.id !== canal?.capteurId}>
                  {v.nom}{v.modele ? ` (${v.modele})` : ""}{v.utilisee && v.id !== canal?.capteurId ? " — déjà utilisée" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {vannes.length === 0 && <p className="text-sm text-amber-700">Aucune vanne détectée. Vérifiez la connexion MQTT (Paramètres) et que la vanne est appairée dans Zigbee2MQTT.</p>}
        <Field label="Carrés arrosés" hint="Ils fournissent l'humidité du sol : on prend la mesure la plus basse de leurs capteurs.">
          <div className="grid gap-2 sm:grid-cols-2">
            {carres.map((x) => (
              <label key={x.id} className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm">
                <input type="checkbox" name="carre" value={x.id} checked={selection.includes(x.id)} onChange={() => toggle(x.id)} className="mt-1" />
                <span>
                  <span className="font-medium">{x.nom}</span> <span className="text-muted">· {x.zone}</span>
                  <span className={`block text-xs ${x.nbCapteurs ? "text-muted" : "text-amber-700"}`}>
                    {x.nbCapteurs ? `${x.nbCapteurs} capteur(s) d'humidité` : "⚠ aucun capteur d'humidité du sol"}
                    {x.plants.length > 0 && ` · ${x.plants.length} plant(s)`}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Déclenchement</h2>
          {suggestion && (
            <button type="button" onClick={() => { setSeuil(suggestion.seuil); setCible(suggestion.cible); }} className="btn-secondary px-2 py-1 text-xs">
              ↺ Préremplir d&apos;après les plants ({suggestion.seuil} % → {suggestion.cible} %)
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Seuil de déclenchement (%)" hint="On arrose quand l'humidité passe sous ce seuil.">
            <input name="seuil" type="number" step="any" min={0} max={100} value={seuil} onChange={(e) => setSeuil(Number(e.target.value))} required className="input" />
          </Field>
          <Field label="Cible (%)" hint="On arrête dès qu'elle est atteinte.">
            <input name="cible" type="number" step="any" min={0} max={100} value={cible} onChange={(e) => setCible(Number(e.target.value))} required className="input" />
          </Field>
          <Field label="Pas d'arrosage sous (°C)">
            <Num name="temp_min" v={d.temp_min} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pluie passée : sur les (h)"><Num name="pluie_passee_h" v={d.pluie_passee_h} min={1} max={24} /></Field>
          <Field label="… cumul d'au moins (mm)" hint="Pas d'arrosage s'il a plu au moins ça."><Num name="pluie_passee_mm" v={d.pluie_passee_mm} min={0} /></Field>
          <Field label="Pluie prévue d'ici 24 h (mm)" hint="Pas d'arrosage si au moins ça est prévu."><Num name="pluie_prevue_mm" v={d.pluie_prevue_mm} min={0} /></Field>
        </div>
        <Field label="Plages horaires autorisées" hint="Les arrosages automatiques ne démarrent (et ne continuent) que dans ces plages.">
          <PlagesEditor initial={d.plages} />
        </Field>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Durée et paliers</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Minutes par point d'humidité" hint="Durée = écart avec la cible × cette valeur, bornée par le palier mini/maxi.">
            <Num name="min_par_point" v={d.min_par_point} min={0.1} />
          </Field>
          <Field label="Palier mini (min)"><Num name="palier_min" v={d.palier_min} min={1} /></Field>
          <Field label="Palier maxi (min)"><Num name="palier_max" v={d.palier_max} min={1} max={60} /></Field>
          <Field label="Pause entre paliers (min)" hint="Laisse le temps aux capteurs de se mettre à jour (8-10 min).">
            <Num name="pause_min" v={d.pause_min} min={1} />
          </Field>
          <Field label="Paliers max par cycle"><Num name="paliers_max" v={d.paliers_max} min={1} step="1" /></Field>
          <Field label="Durée totale max d'un cycle (min)"><Num name="duree_totale_max" v={d.duree_totale_max} min={1} /></Field>
          <Field label="Cycles max par jour"><Num name="cycles_jour_max" v={d.cycles_jour_max} min={1} step="1" /></Field>
          <Field label="Arrosage max par jour (min)"><Num name="duree_jour_max" v={d.duree_jour_max} min={1} /></Field>
          <Field label="Repos entre deux cycles (min)"><Num name="delai_cycles_min" v={d.delai_cycles_min} min={0} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_calibrage" defaultChecked={d.auto_calibrage} />
          Auto-calibrage : affiner les minutes par point d&apos;après les gains mesurés
          {canal && c && <span className="text-xs text-muted">(à ce jour, voir la carte du canal)</span>}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="on_time" defaultChecked={d.on_time} />
          Envoyer aussi une minuterie matérielle (<code>on_time</code>) à la vanne — filet de sécurité si l&apos;application s&apos;arrête (à tester avec votre vanne)
        </label>
      </section>

      <Result r={result} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        <Link href="/irrigation" className="btn-secondary">Annuler</Link>
        {canal && (
          <button
            type="button"
            className="btn-danger ml-auto"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Supprimer le canal « ${canal.nom} » ? La vanne sera fermée.`)) return;
              start(async () => {
                await deleteCanal(canal.id);
                router.push("/irrigation");
                router.refresh();
              });
            }}
          >
            Supprimer
          </button>
        )}
      </div>
    </form>
  );
}

// ---------- Réglages globaux (météo) ----------
export function GlobalForm({ v }: { v: { latitude: number | null; longitude: number | null; fuseau: string; plages: Plage[]; mesureMaxMin: number; meteoIndispo: "ignorer" | "bloquer" } }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      setResult(await saveIrrigationGlobal(null, data));
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Latitude" hint="Ex. 47.21">
          <input name="latitude" type="number" step="any" defaultValue={v.latitude ?? ""} className="input" />
        </Field>
        <Field label="Longitude" hint="Ex. -1.55">
          <input name="longitude" type="number" step="any" defaultValue={v.longitude ?? ""} className="input" />
        </Field>
        <Field label="Fuseau horaire" hint="Pour les plages horaires et les quotas du jour.">
          <input name="fuseau" defaultValue={v.fuseau} className="input" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Âge maximal d'une mesure d'humidité (min)" hint="Au-delà, le capteur est considéré muet : pas d'arrosage et alerte.">
          <input name="mesure_max_min" type="number" min={10} max={240} defaultValue={v.mesureMaxMin} required className="input" />
        </Field>
        <Field label="Si la météo est injoignable" hint="Open-Meteo ne répond pas depuis plus de 6 h.">
          <select name="meteo_indispo" defaultValue={v.meteoIndispo} className="input">
            <option value="ignorer">Arroser quand même (règles météo ignorées)</option>
            <option value="bloquer">Ne pas arroser</option>
          </select>
        </Field>
      </div>
      <Field label="Plages horaires proposées par défaut" hint="Reprises à la création d'un canal (chaque canal a ensuite les siennes).">
        <PlagesEditor initial={v.plages} />
      </Field>
      <Result r={result} />
      <button className="btn" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer et tester la météo"}</button>
    </form>
  );
}

// ---------- Commandes ----------
export function CanalControles({ id, enCours, actif, auto }: { id: number; enCours: boolean; actif: boolean; auto: boolean }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(5);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setResult(await fn());
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {enCours ? (
          <button className="btn-danger px-3 py-1 text-sm" disabled={pending} onClick={() => go(() => arreterCanal(id))}>⏹ Arrêter</button>
        ) : (
          <>
            <input type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="input w-20" aria-label="Minutes" />
            <button className="btn-secondary px-3 py-1 text-sm" disabled={pending || !actif} onClick={() => go(() => arroserManuel(id, minutes))}>▶ Arroser {minutes} min</button>
          </>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={actif} disabled={pending} onChange={(e) => go(() => setCanalMode(id, "actif", e.target.checked))} /> Activé
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={auto} disabled={pending || !actif} onChange={(e) => go(() => setCanalMode(id, "auto", e.target.checked))} /> Auto
        </label>
      </div>
      <Result r={result} />
    </div>
  );
}

export function BarreGlobale({ pause, pauseJusqu }: { pause: boolean; pauseJusqu: string | null }) {
  const router = useRouter();
  const [jusqu, setJusqu] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setResult(await fn());
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {pause ? (
          <button className="btn px-3 py-1 text-sm" disabled={pending} onClick={() => go(() => setPause(false, null))}>▶ Reprendre les arrosages auto{pauseJusqu ? ` (pause jusqu'au ${pauseJusqu})` : ""}</button>
        ) : (
          <>
            <input type="date" value={jusqu} onChange={(e) => setJusqu(e.target.value)} className="input w-40" aria-label="Pause jusqu'au (inclus)" title="Pause jusqu'au (inclus) — vide = jusqu'à reprise" />
            <button className="btn-secondary px-3 py-1 text-sm" disabled={pending} onClick={() => go(() => setPause(true, jusqu || null))}>⏸ Pause globale</button>
          </>
        )}
        <button
          className="btn-danger px-3 py-1 text-sm"
          disabled={pending}
          onClick={() => {
            if (confirm("Fermer toutes les vannes et suspendre les arrosages automatiques ?")) go(arretUrgence);
          }}
        >
          🛑 Arrêt d&apos;urgence
        </button>
      </div>
      <Result r={result} />
    </div>
  );
}

export function VuAlertes() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-secondary px-2 py-1 text-xs"
      disabled={pending}
      onClick={() => start(async () => { await marquerAlertesVues(); router.refresh(); })}
    >
      ✔ Marquer comme vu
    </button>
  );
}
