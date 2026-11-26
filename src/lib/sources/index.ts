import {
  estVide, FIELD_KEYS, NUMBER_FIELDS, parseSourcesData, PROVIDERS, versTexte,
  type FieldKey, type Fiche, type ProviderId, type SourcesData,
} from "../botanique";
import { run } from "../db";
import { searchPlants, type OpbDetail } from "../opb";
import type { Plant } from "../queries";
import { getSourcesSettings } from "../settings";
import { norm, SourceError } from "./http";
import { inaturalist, resoudreNom, searchInat } from "./inaturalist";
import { openplantbook } from "./openplantbook";
import { perenual } from "./perenual";
import { trefle } from "./trefle";
import type { Provider } from "./types";

const ALL: Record<ProviderId, Provider> = { openplantbook, trefle, inaturalist, perenual };

/** Sources activées et configurées, dans l'ordre de priorité choisi. */
export function sourcesActives(): Provider[] {
  const s = getSourcesSettings();
  return s.order.filter((id) => s.enabled[id]).map((id) => ALL[id]).filter((p) => p.configured());
}

const messageErreur = (p: ProviderId, e: unknown) =>
  e instanceof SourceError ? e.message : `${PROVIDERS[p]} : ${(e as Error).message}`;

export type Collecte = {
  fiche: Fiche;
  champs: Partial<Record<keyof Fiche, ProviderId>>;
  ids: SourcesData["ids"];
  erreurs: string[];
  opbData: OpbDetail | null;
};

/**
 * Interroge les sources dans l'ordre de priorité : chaque champ prend la valeur de la première source qui le renseigne ;
 * une source n'est consultée que s'il reste des champs vides (parmi `besoin`, ou tous par défaut).
 * Une source en erreur est sautée (l'erreur est remontée dans `erreurs`).
 */
export async function collecter(
  sci: string,
  ids: SourcesData["ids"],
  opts: { force?: boolean; besoin?: Set<string> } = {},
): Promise<Collecte> {
  const besoin = opts.besoin ?? new Set<string>([...FIELD_KEYS, "photo", "nom_commun"]);
  const out: Collecte = { fiche: {}, champs: {}, ids: { ...ids }, erreurs: [], opbData: null };
  const reste = () => [...besoin].some((k) => estVide(out.fiche[k as keyof Fiche]));
  for (const p of sourcesActives()) {
    if (!reste()) break;
    try {
      const r = await p.fetch(sci, ids[p.id], opts.force ?? false);
      if (!r) continue;
      out.ids[p.id] = r.id;
      if (p.id === "openplantbook") out.opbData = r.raw as OpbDetail;
      for (const [k, v] of Object.entries(r.fiche) as [keyof Fiche, Fiche[keyof Fiche]][]) {
        if (besoin.has(k) && estVide(out.fiche[k]) && !estVide(v)) {
          out.fiche[k] = v;
          out.champs[k] = p.id;
        }
      }
    } catch (e) {
      out.erreurs.push(messageErreur(p.id, e));
    }
  }
  return out;
}

// ---------- Recherche d'une espèce (formulaire) ----------
export type Suggestion = { nom: string; sci: string; ids: SourcesData["ids"]; photo: string | null };

/** Recherche combinée OpenPlantbook + iNaturalist (noms français), dédoublonnée par nom scientifique. */
export async function rechercher(q: string): Promise<{ results: Suggestion[]; erreurs: string[] }> {
  const actives = sourcesActives().map((p) => p.id);
  const erreurs: string[] = [];
  const parSource = await Promise.all(
    actives.map(async (id): Promise<Suggestion[]> => {
      try {
        if (id === "inaturalist") {
          return (await searchInat(q)).map((t) => ({
            nom: t.preferred_common_name ?? t.name, sci: t.name, ids: { inaturalist: String(t.id) }, photo: t.default_photo?.square_url ?? null,
          }));
        }
        if (id === "openplantbook") {
          return (await searchPlants(q)).map((r) => ({ nom: r.alias || r.display_pid, sci: r.display_pid || r.pid, ids: { openplantbook: r.pid }, photo: null }));
        }
      } catch (e) {
        erreurs.push(messageErreur(id, e));
      }
      return [];
    }),
  );
  const merged = new Map<string, Suggestion>();
  for (const s of parSource.flat()) {
    const k = norm(s.sci);
    const prev = merged.get(k);
    // Le nom d'iNaturalist (en français) est préféré à celui d'OpenPlantbook (en anglais).
    if (prev) merged.set(k, { ...prev, nom: s.ids.inaturalist ? s.nom : prev.nom, ids: { ...prev.ids, ...s.ids }, photo: prev.photo ?? s.photo });
    else merged.set(k, s);
  }
  return { results: [...merged.values()].slice(0, 15), erreurs };
}

/** Nom scientifique à partir d'un nom commun, via iNaturalist (si la source est active). */
export async function identifier(nom: string): Promise<{ sci: string; id: string } | null> {
  if (!sourcesActives().some((p) => p.id === "inaturalist")) return null;
  return resoudreNom(nom);
}

// ---------- Complétion d'un plant enregistré ----------
export type Completion = {
  statut: "complete" | "inchange" | "complet" | "non_identifie";
  remplis: FieldKey[];
  restants: FieldKey[];
  erreurs: string[];
};

/**
 * Complète les champs vides d'un plant (jamais les saisies manuelles).
 * `rafraichir` : ignore le cache et met aussi à jour les valeurs déjà issues des sources.
 */
export async function completerPlant(p: Plant, rafraichir = false): Promise<Completion> {
  const sd = parseSourcesData(p.sources_data);
  const ids = { ...sd.ids };
  if (p.opb_pid && !ids.openplantbook) ids.openplantbook = p.opb_pid;
  const val = (k: FieldKey) => p[k] as string | number | null;
  const vides = () => FIELD_KEYS.filter((k) => estVide(val(k)));

  let sci = p.nom_scientifique?.trim() || p.opb_pid || "";
  const erreurs: string[] = [];
  if (!sci) {
    try {
      const r = await identifier(p.nom);
      if (r) {
        sci = r.sci;
        ids.inaturalist ??= r.id;
      }
    } catch (e) {
      erreurs.push(messageErreur("inaturalist", e));
    }
  }
  if (!sci) return { statut: "non_identifie", remplis: [], restants: vides(), erreurs };

  const modifiables = FIELD_KEYS.filter((k) => estVide(val(k)) || (rafraichir && sd.champs[k]));
  const besoin = new Set<string>([...modifiables, ...(p.photo ? [] : ["photo"])]);
  if (besoin.size === 0) {
    run("UPDATE plant SET sources_data = ? WHERE id = ?", JSON.stringify({ ...sd, ids, verifie: new Date().toISOString() }), p.id);
    return { statut: "complet", remplis: [], restants: [], erreurs };
  }

  const c = await collecter(sci, ids, { force: rafraichir, besoin });
  const updates: Record<string, string | number | null> = {};
  const champs = { ...sd.champs };
  const remplis: FieldKey[] = [];
  for (const k of modifiables) {
    const txt = versTexte(k, c.fiche[k]);
    if (txt === "") continue;
    champs[k] = c.champs[k];
    if (String(val(k) ?? "") === txt) continue;
    updates[k] = NUMBER_FIELDS.has(k) ? Number(txt) : txt;
    remplis.push(k);
  }
  if (estVide(val("nom_scientifique")) && !("nom_scientifique" in updates)) {
    updates.nom_scientifique = sci;
    remplis.push("nom_scientifique");
  }
  if (!p.photo && typeof c.fiche.photo === "string" && c.fiche.photo) updates.photo = c.fiche.photo;
  if (!p.opb_pid && c.opbData && c.ids.openplantbook) {
    updates.opb_pid = c.ids.openplantbook;
    updates.opb_data = JSON.stringify(c.opbData);
  }
  updates.sources_data = JSON.stringify({ champs, ids: c.ids, verifie: new Date().toISOString() } satisfies SourcesData);

  const cols = Object.keys(updates);
  run(`UPDATE plant SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...Object.values(updates), p.id);
  const restants = FIELD_KEYS.filter((k) => estVide(k in updates ? updates[k] : val(k)));
  return { statut: remplis.length || "photo" in updates ? "complete" : "inchange", remplis, restants, erreurs: [...erreurs, ...c.erreurs] };
}
