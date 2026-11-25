"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { savePlant } from "@/app/actions/garden";
import { METRICS, METRIC_KEYS, STATUTS, Z2M_FIELD_HINTS, type MetricKey } from "@/lib/metrics";
import type { Carre, Plant, Zone } from "@/lib/queries";
import type { CapteurView } from "@/lib/mqtt-service";
import type { OpbDetail, OpbSearchResult } from "@/lib/opb";

type Props = {
  plant?: Plant;
  zones: Zone[];
  carres: (Carre & { zone_nom: string })[];
  hasOpbKey: boolean;
  /** Associations existantes : métrique -> "capteurId|champ" */
  assoc: Partial<Record<MetricKey, string>>;
};

const OPB_TO_COLS: Record<string, keyof OpbDetail> = {
  temp_min: "min_temp", temp_max: "max_temp",
  hum_air_min: "min_env_humid", hum_air_max: "max_env_humid",
  hum_sol_min: "min_soil_moist", hum_sol_max: "max_soil_moist",
  ec_min: "min_soil_ec", ec_max: "max_soil_ec",
  lux_min: "min_light_lux", lux_max: "max_light_lux",
};

export default function PlantForm({ plant, zones, carres, hasOpbKey, assoc }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [nom, setNom] = useState(plant?.nom ?? "");
  const [variete, setVariete] = useState(plant?.variete ?? "");
  const [photo, setPhoto] = useState(plant?.photo ?? "");
  const [opbPid, setOpbPid] = useState(plant?.opb_pid ?? "");
  const [opbData, setOpbData] = useState(plant?.opb_data ?? "");
  const [seuils, setSeuils] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const k of METRIC_KEYS) for (const c of [METRICS[k].min, METRICS[k].max]) o[c] = String(plant?.[c as keyof Plant] ?? "");
    return o;
  });
  const [filled, setFilled] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shownPhoto = preview ?? (photo || null);

  function applyOpb(d: OpbDetail) {
    setOpbPid(d.pid);
    setOpbData(JSON.stringify(d));
    if (!nom) setNom(d.alias ?? d.display_pid ?? d.pid);
    if (d.image_url) setPhoto(d.image_url);
    const next = { ...seuils };
    for (const [col, key] of Object.entries(OPB_TO_COLS)) {
      const v = d[key];
      next[col] = v === null || v === undefined ? "" : String(v);
    }
    setSeuils(next);
    setFilled(true);
  }

  function unlinkOpb() {
    setOpbPid("");
    setOpbData("");
    setFilled(false);
  }

  const d = (v: string | null | undefined) => v ?? "";
  return (
    <form action={savePlant} className="max-w-3xl space-y-6">
      {plant && <input type="hidden" name="id" value={plant.id} />}
      <input type="hidden" name="opb_pid" value={opbPid} />
      <input type="hidden" name="opb_data" value={opbData} />
      <input type="hidden" name="photo" value={photo} />

      <section className="card space-y-4">
        <h2 className="font-semibold">1. Identité</h2>
        {opbPid ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-green-100 p-3 text-sm text-green-900">
            <div className="flex items-center gap-3">
              {photo && <img src={photo} alt="" className="h-12 w-12 rounded-lg object-cover" />}
              <span>🌿 Lié à OpenPlantbook : <strong>{opbPid}</strong>{filled && " — champs préremplis, modifiables ci-dessous."}</span>
            </div>
            <button type="button" onClick={unlinkOpb} className="btn-secondary text-xs">Délier</button>
          </div>
        ) : hasOpbKey ? (
          <OpbSearch onPick={applyOpb} />
        ) : (
          <p className="rounded-lg bg-black/5 p-2 text-xs text-muted dark:bg-white/5">
            OpenPlantbook non configuré : saisie manuelle. <Link href="/settings/openplantbook" className="underline">Ajouter les identifiants</Link> pour préremplir automatiquement.
          </p>
        )}
        <div className="flex items-center gap-4">
          {shownPhoto ? <img src={shownPhoto} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-black/5 text-3xl dark:bg-white/5">🌱</div>}
          <div className="space-y-2">
            <label className="label">Photo <span className="font-normal text-muted">(optionnelle, envoyée dans le message MQTT)</span></label>
            <input
              ref={fileRef}
              type="file"
              name="photo_file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
              className="text-sm"
            />
            {shownPhoto && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  setPhoto("");
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Retirer la photo
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nom *</label><input name="nom" value={nom} onChange={(e) => setNom(e.target.value)} required className="input" placeholder="Tomate" /></div>
          <div><label className="label">Variété</label><input name="variete" value={variete} onChange={(e) => setVariete(e.target.value)} className="input" placeholder="Cœur de bœuf" /></div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">2. Emplacement et dates</h2>
        <div>
          <label className="label">Carré</label>
          <select name="carre_id" defaultValue={plant?.carre_id ?? ""} className="input">
            <option value="">— Non affecté —</option>
            {zones.map((z) => (
              <optgroup key={z.id} label={z.nom}>
                {carres.filter((c) => c.zone_id === z.id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Date de semis</label><input type="date" name="date_semis" defaultValue={d(plant?.date_semis)} className="input" /></div>
          <div><label className="label">Date de plantation</label><input type="date" name="date_plantation" defaultValue={plant ? d(plant.date_plantation) : today} className="input" /></div>
          <div><label className="label">Récolte prévue</label><input type="date" name="date_recolte_prevue" defaultValue={d(plant?.date_recolte_prevue)} className="input" /></div>
        </div>
        <div>
          <label className="label">Stade</label>
          <select name="statut" defaultValue={plant?.statut ?? "croissance"} className="input max-w-xs">
            {Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">3. Seuils souhaités <span className="text-xs font-normal text-muted">(optionnels, servent aux alertes)</span></h2>
        <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 text-sm">
          <span /><span className="text-xs text-muted">Min</span><span className="text-xs text-muted">Max</span>
          {METRIC_KEYS.map((k) => (
            <div key={k} className="contents">
              <span>{METRICS[k].icone} {METRICS[k].label} ({METRICS[k].unite})</span>
              {[METRICS[k].min, METRICS[k].max].map((col) => (
                <input key={col} name={col} type="number" step="any" value={seuils[col]} onChange={(e) => setSeuils({ ...seuils, [col]: e.target.value })} className="input" />
              ))}
            </div>
          ))}
        </div>
      </section>

      <CapteursPicker assoc={assoc} />

      <section className="card space-y-2">
        <h2 className="font-semibold">Notes</h2>
        <textarea name="notes" defaultValue={d(plant?.notes)} rows={3} className="input" />
      </section>

      <button className="btn">{plant ? "Enregistrer" : "Créer le plant"}</button>
    </form>
  );
}

// ---------- Recherche OpenPlantbook ----------
function OpbSearch({ onPick }: { onPick: (d: OpbDetail) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OpbSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/opb?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        if (id !== seq.current) return;
        if (!res.ok) setError(json.error ?? "Erreur de recherche");
        else setResults(json.results);
      } catch {
        if (id === seq.current) setError("Recherche impossible (réseau).");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function pick(r: OpbSearchResult) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/opb?pid=${encodeURIComponent(r.pid)}`);
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Erreur");
      else {
        onPick(json as OpbDetail);
        setResults([]);
        setQ("");
      }
    } catch {
      setError("Récupération impossible (réseau).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="label">🌿 Rechercher dans OpenPlantbook <span className="font-normal text-muted">(optionnel)</span></label>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom en latin ou en anglais, ex. « Solanum lycopersicum »" className="input" />
      {loading && <p className="text-xs text-muted">Recherche…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {q.trim().length >= 2 && results.length > 0 && (
        <ul className="max-h-60 divide-y divide-border overflow-auto rounded-lg border border-border">
          {results.map((r) => (
            <li key={r.pid}>
              <button type="button" onClick={() => pick(r)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5">
                <span>{r.alias || r.display_pid}</span>
                <span className="text-xs text-muted">{r.display_pid}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !loading && !error && results.length === 0 && (
        <p className="text-xs text-muted">Aucun résultat. Vous pouvez saisir les informations manuellement.</p>
      )}
    </div>
  );
}

// ---------- Association des capteurs Zigbee2MQTT ----------
function CapteursPicker({ assoc }: { assoc: Partial<Record<MetricKey, string>> }) {
  const [capteurs, setCapteurs] = useState<CapteurView[]>([]);
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [sel, setSel] = useState<Partial<Record<MetricKey, string>>>(assoc);
  const [watch, setWatch] = useState<{ metric: MetricKey; baseline: Record<number, number> } | null>(null);
  const watchRef = useRef(watch);
  useEffect(() => {
    watchRef.current = watch;
  }, [watch]);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch("/api/capteurs", { cache: "no-store" });
        if (!res.ok || stop) return;
        const json = (await res.json()) as { status: { configured: boolean; connected: boolean }; capteurs: CapteurView[] };
        setStatus(json.status);
        setCapteurs(json.capteurs);
        const w = watchRef.current;
        if (w) {
          for (const c of json.capteurs) {
            if (c.ts && c.ts > (w.baseline[c.id] ?? 0)) {
              const f = c.champs.find((x) => Z2M_FIELD_HINTS[w.metric].includes(x.champ) && x.valeur !== null);
              if (f) {
                setSel((s) => ({ ...s, [w.metric]: `${c.id}|${f.champ}` }));
                setWatch(null);
                break;
              }
            }
          }
        }
      } catch {
        /* réseau indisponible : on réessaiera */
      }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const options = (metric: MetricKey) => {
    const hints = Z2M_FIELD_HINTS[metric];
    const flat = capteurs.flatMap((c) => c.champs.map((f) => ({ c, f })));
    const fmt = ({ c, f }: (typeof flat)[number]) => (
      <option key={`${c.id}|${f.champ}`} value={`${c.id}|${f.champ}`}>
        {c.friendly_name} — {f.champ} ({f.valeur === null ? "—" : `${f.valeur} ${f.unite ?? ""}`.trim()})
      </option>
    );
    return (
      <>
        <option value="">— Aucun —</option>
        <optgroup label="Suggestions">{flat.filter((x) => hints.includes(x.f.champ)).map(fmt)}</optgroup>
        <optgroup label="Autres champs">{flat.filter((x) => !hints.includes(x.f.champ)).map(fmt)}</optgroup>
      </>
    );
  };

  const liveValue = (v?: string) => {
    if (!v) return null;
    const [id, champ] = v.split("|");
    const f = capteurs.find((c) => c.id === Number(id))?.champs.find((x) => x.champ === champ);
    return f && f.valeur !== null ? `${f.valeur} ${f.unite ?? ""}` : null;
  };

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">4. Capteurs Zigbee2MQTT <span className="text-xs font-normal text-muted">(optionnels)</span></h2>
      {status && !status.configured && <p className="text-xs text-muted">MQTT non configuré : <Link href="/settings/mqtt" className="underline">renseigner le serveur</Link>.</p>}
      {status?.configured && !status.connected && <p className="text-xs text-red-600">MQTT déconnecté : la liste des capteurs peut être incomplète.</p>}
      {status?.connected && capteurs.length === 0 && <p className="text-xs text-muted">Aucun capteur détecté pour l&apos;instant.</p>}
      <div className="space-y-3">
        {METRIC_KEYS.map((k) => (
          <div key={k} className="grid grid-cols-[11rem_1fr_auto] items-center gap-2 text-sm">
            <span>{METRICS[k].icone} {METRICS[k].label}</span>
            <div>
              <select name={`capteur_${k}`} value={sel[k] ?? ""} onChange={(e) => setSel({ ...sel, [k]: e.target.value })} className="input">
                {options(k)}
              </select>
              {liveValue(sel[k]) && <div className="mt-1 text-xs text-green-700">Valeur actuelle : {liveValue(sel[k])}</div>}
              {watch?.metric === k && <div className="mt-1 text-xs text-amber-600">En attente d&apos;un message du capteur… (réveillez-le, ex. appui sur le bouton)</div>}
            </div>
            {watch?.metric === k ? (
              <button type="button" className="btn-secondary text-xs" onClick={() => setWatch(null)}>Annuler</button>
            ) : (
              <button type="button" className="btn-secondary text-xs" onClick={() => setWatch({ metric: k, baseline: Object.fromEntries(capteurs.map((c) => [c.id, c.ts ?? 0])) })}>Détecter</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
