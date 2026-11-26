"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { savePlant } from "@/app/actions/garden";
import Calendrier from "@/components/Calendrier";
import {
  CARAC_KEYS, CARACS, FIELD_KEYS, MOIS_COLS, PROVIDERS, parseMois, parseSourcesData, versTexte,
  type FieldKey, type Fiche, type ProviderId, type SourcesData,
} from "@/lib/botanique";
import { METRICS, METRIC_KEYS, STATUTS, Z2M_FIELD_HINTS, type MetricKey } from "@/lib/metrics";
import type { Carre, Plant, Zone } from "@/lib/queries";
import type { CapteurView } from "@/lib/mqtt-service";
import type { Suggestion } from "@/lib/sources";

type Props = {
  plant?: Plant;
  zones: Zone[];
  carres: (Carre & { zone_nom: string })[];
  /** Au moins une source botanique active */
  hasSources: boolean;
  /** Associations existantes : métrique -> "capteurId|champ" */
  assoc: Partial<Record<MetricKey, string>>;
  /** Dernière hauteur mesurée (cm) */
  hauteurActuelle?: number | null;
};

/** Réponse de /api/plantes (fiche fusionnée selon l'ordre de priorité des sources). */
type Collecte = {
  sci: string;
  fiche: Fiche;
  champs: Partial<Record<string, ProviderId>>;
  ids: SourcesData["ids"];
  erreurs: string[];
  opbData: unknown;
};

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function PlantForm({ plant, zones, carres, hasSources, assoc, hauteurActuelle }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [initial] = useState(() => parseSourcesData(plant?.sources_data));
  const [nom, setNom] = useState(plant?.nom ?? "");
  const [variete, setVariete] = useState(plant?.variete ?? "");
  const [photo, setPhoto] = useState(plant?.photo ?? "");
  const [opbPid, setOpbPid] = useState(plant?.opb_pid ?? "");
  const [opbData, setOpbData] = useState(plant?.opb_data ?? "");
  const [vals, setVals] = useState<Record<FieldKey, string>>(
    () => Object.fromEntries(FIELD_KEYS.map((k) => [k, versTexte(k, plant?.[k] ?? null)])) as Record<FieldKey, string>,
  );
  const [src, setSrc] = useState<SourcesData["champs"]>(initial.champs);
  const [ids, setIds] = useState<SourcesData["ids"]>(() => ({
    ...initial.ids,
    ...(plant?.opb_pid && !initial.ids.openplantbook ? { openplantbook: plant.opb_pid } : {}),
  }));
  const [verifie, setVerifie] = useState(initial.verifie);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shownPhoto = preview ?? (photo || null);

  /** Saisie manuelle : la valeur n'est plus attribuée à une source (et ne sera jamais écrasée). */
  function setVal(k: FieldKey, v: string) {
    setVals((x) => ({ ...x, [k]: v }));
    setSrc((x) => {
      const n = { ...x };
      delete n[k];
      return n;
    });
  }

  function toggleMois(col: string, m: number) {
    const cur = parseMois(vals[col as FieldKey]);
    setVal(col as FieldKey, (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]).sort((a, b) => a - b).join(","));
  }

  /** Remplit uniquement les champs vides avec la fiche fusionnée. */
  function appliquer(c: Collecte, base: Record<FieldKey, string>) {
    const nv = { ...base };
    const ns = { ...src };
    const utilisees = new Set<ProviderId>();
    let n = 0;
    for (const k of FIELD_KEYS) {
      if (nv[k] !== "") continue;
      const t = versTexte(k, c.fiche[k]);
      if (!t) continue;
      nv[k] = t;
      const p = c.champs[k];
      if (p) {
        ns[k] = p;
        utilisees.add(p);
      }
      n++;
    }
    if (!nv.nom_scientifique) nv.nom_scientifique = c.sci;
    setVals(nv);
    setSrc(ns);
    setIds((x) => ({ ...x, ...c.ids }));
    setVerifie(new Date().toISOString());
    if (!photo && !preview && typeof c.fiche.photo === "string" && c.fiche.photo) setPhoto(c.fiche.photo);
    if (!nom && typeof c.fiche.nom_commun === "string" && c.fiche.nom_commun) setNom(majuscule(c.fiche.nom_commun));
    if (c.opbData && !opbPid && c.ids.openplantbook) {
      setOpbPid(c.ids.openplantbook);
      setOpbData(JSON.stringify(c.opbData));
    }
    const sources = [...utilisees].map((p) => PROVIDERS[p]).join(", ");
    setInfo({
      ok: c.erreurs.length === 0 || n > 0,
      text:
        (n ? `${n} champ(s) complété(s)${sources ? ` (${sources})` : ""}, modifiables ci-dessous.` : "Aucun champ vide n'a pu être complété.") +
        (c.erreurs.length ? ` Sources indisponibles : ${c.erreurs.join(" ; ")}` : ""),
    });
  }

  async function interroger(params: Record<string, string>, base: Record<FieldKey, string>) {
    setBusy(true);
    setInfo(null);
    try {
      const res = await fetch(`/api/plantes?${new URLSearchParams(params)}`);
      const json = await res.json();
      if (!res.ok) setInfo({ ok: false, text: json.error ?? "Erreur" });
      else appliquer(json as Collecte, base);
    } catch {
      setInfo({ ok: false, text: "Sources injoignables (réseau)." });
    } finally {
      setBusy(false);
    }
  }

  function choisir(s: Suggestion) {
    const base = { ...vals, nom_scientifique: s.sci };
    setVals(base);
    setIds((x) => ({ ...x, ...s.ids }));
    void interroger({ sci: s.sci, ids: JSON.stringify({ ...ids, ...s.ids }) }, base);
  }

  function completer() {
    if (vals.nom_scientifique) void interroger({ sci: vals.nom_scientifique, ids: JSON.stringify(ids) }, vals);
    else if (nom) void interroger({ nom }, vals);
    else setInfo({ ok: false, text: "Renseignez d'abord le nom ou le nom scientifique." });
  }

  /** Changer d'espèce : retire les valeurs issues des sources (les saisies manuelles restent). */
  function changerEspece() {
    const nv = { ...vals, nom_scientifique: "" };
    for (const k of Object.keys(src) as FieldKey[]) nv[k] = "";
    setVals(nv);
    setSrc({});
    setIds({});
    setOpbPid("");
    setOpbData("");
    setInfo(null);
  }

  const d = (v: string | null | undefined) => v ?? "";
  const srcLabel = (k: FieldKey) => (src[k] ? PROVIDERS[src[k]] : null);
  const sourcesData: SourcesData = { champs: src, ids, ...(verifie ? { verifie } : {}) };
  return (
    <form action={savePlant} className="max-w-3xl space-y-6">
      {plant && <input type="hidden" name="id" value={plant.id} />}
      <input type="hidden" name="opb_pid" value={opbPid} />
      <input type="hidden" name="opb_data" value={opbData} />
      <input type="hidden" name="photo" value={photo} />
      <input type="hidden" name="sources_data" value={JSON.stringify(sourcesData)} />

      <section className="card space-y-4">
        <h2 className="font-semibold">1. Identité</h2>
        {!hasSources ? (
          <p className="rounded-lg bg-black/5 p-2 text-xs text-muted dark:bg-white/5">
            Aucune source botanique active : saisie manuelle. <Link href="/settings/sources" className="underline">Configurer les sources</Link> pour préremplir automatiquement.
          </p>
        ) : vals.nom_scientifique ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-100 p-3 text-sm text-green-900">
            <div className="flex items-center gap-3">
              {photo && <img src={photo} alt="" className="h-12 w-12 rounded-lg object-cover" />}
              <span>
                🌿 Espèce : <em className="font-medium">{vals.nom_scientifique}</em>
                {Object.keys(ids).length > 0 && (
                  <span className="text-xs"> · fiches : {(Object.keys(ids) as ProviderId[]).map((p) => PROVIDERS[p]).join(", ")}</span>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={completer} disabled={busy} className="btn-secondary text-xs">
                {busy ? "Interrogation…" : "Compléter depuis les sources"}
              </button>
              <button type="button" onClick={changerEspece} disabled={busy} className="btn-secondary text-xs">Changer d&apos;espèce</button>
            </div>
          </div>
        ) : (
          <PlantSearch onPick={choisir} busy={busy} />
        )}
        {info && <p className={`rounded-lg p-2 text-xs ${info.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{info.text}</p>}
        <div className="flex flex-wrap items-center gap-4">
          {shownPhoto ? <img src={shownPhoto} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-black/5 text-3xl dark:bg-white/5">🌱</div>}
          <div className="min-w-0 space-y-2">
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
              className="max-w-full text-sm"
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Nom *</label><input name="nom" value={nom} onChange={(e) => setNom(e.target.value)} required className="input" placeholder="Tomate" /></div>
          <div><label className="label">Variété</label><input name="variete" value={variete} onChange={(e) => setVariete(e.target.value)} className="input" placeholder="Cœur de bœuf" /></div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <label className="label">
              Nom scientifique{srcLabel("nom_scientifique") && <span className="font-normal text-muted"> · {srcLabel("nom_scientifique")}</span>}
            </label>
            <input name="nom_scientifique" value={vals.nom_scientifique} onChange={(e) => setVal("nom_scientifique", e.target.value)} className="input" placeholder="Solanum lycopersicum" />
          </div>
          {hasSources && !vals.nom_scientifique && (
            <button type="button" onClick={completer} disabled={busy} className="btn-secondary" title="Identifie l'espèce à partir du nom puis complète les champs vides">
              {busy ? "Interrogation…" : "Compléter depuis les sources"}
            </button>
          )}
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Date de semis</label><input type="date" name="date_semis" defaultValue={d(plant?.date_semis)} className="input" /></div>
          <div><label className="label">Date de plantation</label><input type="date" name="date_plantation" defaultValue={plant ? d(plant.date_plantation) : today} className="input" /></div>
          <div><label className="label">Récolte prévue</label><input type="date" name="date_recolte_prevue" defaultValue={d(plant?.date_recolte_prevue)} className="input" /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Stade</label>
            <select name="statut" defaultValue={plant?.statut ?? "croissance"} className="input">
              {Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Hauteur du plant (cm)</label>
            <input name="hauteur_actuelle" type="number" step="any" min="0" defaultValue={hauteurActuelle ?? ""} className="input" placeholder="mesure du jour" />
            <p className="mt-1 text-xs text-muted">Une modification est ajoutée à l&apos;historique (onglet « Hauteur »).</p>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">3. Calendrier <span className="text-xs font-normal text-muted">(cliquez sur un mois pour l&apos;ajouter ou le retirer)</span></h2>
        {MOIS_COLS.map((k) => <input key={k} type="hidden" name={k} value={vals[k]} />)}
        <Calendrier valeurs={vals} sources={src} moisCourant={new Date().getMonth() + 1} onToggle={toggleMois} />
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">4. Caractéristiques <span className="text-xs font-normal text-muted">(optionnelles)</span></h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CARAC_KEYS.map((k) => (
            <div key={k} className={CARACS[k].type === "textarea" ? "sm:col-span-2" : ""}>
              <label className="label">
                {CARACS[k].label}{srcLabel(k) && <span className="font-normal text-muted"> · {srcLabel(k)}</span>}
              </label>
              {CARACS[k].type === "textarea" ? (
                <textarea name={k} value={vals[k]} onChange={(e) => setVal(k, e.target.value)} rows={3} className="input" />
              ) : (
                <input name={k} type={CARACS[k].type} step="any" value={vals[k]} onChange={(e) => setVal(k, e.target.value)} className="input" />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">5. Seuils souhaités <span className="text-xs font-normal text-muted">(optionnels, servent aux alertes)</span></h2>
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 text-sm sm:grid-cols-[1fr_6rem_6rem_6rem]">
          <span /><span className="text-xs text-muted">Min</span><span className="text-xs text-muted">Max</span><span className="hidden sm:block" />
          {METRIC_KEYS.map((k) => (
            <div key={k} className="contents">
              <span>{METRICS[k].icone} {METRICS[k].label} ({METRICS[k].unite})</span>
              {[METRICS[k].min, METRICS[k].max].map((col) => (
                <input key={col} name={col} type="number" step="any" value={vals[col]} onChange={(e) => setVal(col, e.target.value)} className="input" />
              ))}
              <span className="hidden truncate text-xs text-muted sm:block">{srcLabel(METRICS[k].min) ?? srcLabel(METRICS[k].max) ?? ""}</span>
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

// ---------- Recherche d'espèce (OpenPlantbook + iNaturalist) ----------
function PlantSearch({ onPick, busy }: { onPick: (s: Suggestion) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
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
        const res = await fetch(`/api/plantes?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        if (id !== seq.current) return;
        if (!res.ok) setError(json.error ?? "Erreur de recherche");
        else {
          setResults(json.results);
          if (json.erreurs?.length) setError(json.erreurs.join(" ; "));
        }
      } catch {
        if (id === seq.current) setError("Recherche impossible (réseau).");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-2">
      <label className="label">🌿 Rechercher la plante <span className="font-normal text-muted">(optionnel : nom français, latin ou anglais)</span></label>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. « tomate » ou « Solanum lycopersicum »" className="input" />
      {(loading || busy) && <p className="text-xs text-muted">{busy ? "Interrogation des sources…" : "Recherche…"}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {q.trim().length >= 2 && results.length > 0 && (
        <ul className="max-h-72 divide-y divide-border overflow-auto rounded-lg border border-border">
          {results.map((r) => (
            <li key={r.sci}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onPick(r);
                  setResults([]);
                  setQ("");
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                {r.photo ? <img src={r.photo} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8" />}
                <span className="flex-1">{majuscule(r.nom)}</span>
                <em className="text-xs text-muted">{r.sci}</em>
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
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm sm:grid-cols-[11rem_1fr_auto]">
            <span className="col-span-2 sm:col-span-1">{METRICS[k].icone} {METRICS[k].label}</span>
            <div className="min-w-0">
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
