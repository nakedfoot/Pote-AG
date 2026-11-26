import { get, run } from "../db";

export class SourceError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

/** Identifiant générique envoyé aux API (aucune donnée personnelle). */
const USER_AGENT = "Potager/1.0 (application de potager auto-hebergee)";

/** GET JSON avec délai maximal et messages d'erreur lisibles. `label` = nom de la source pour les messages. */
export async function getJson<T>(url: string, label: string, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "délai dépassé" : "service injoignable";
    throw new SourceError(`${label} : ${msg}.`);
  }
  if (res.status === 401 || res.status === 403) throw new SourceError(`${label} : accès refusé (clé ou jeton invalide ?).`, 401);
  if (res.status === 404) throw new SourceError(`${label} : introuvable.`, 404);
  if (res.status === 429) throw new SourceError(`${label} : quota d'appels atteint, réessayez plus tard.`, 429);
  if (!res.ok) throw new SourceError(`${label} : erreur HTTP ${res.status}.`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceError(`${label} : réponse illisible.`);
  }
}

export const CACHE_TTL = 30 * 86_400_000; // 30 jours : ces données botaniques évoluent peu

/**
 * Cache persistant (table source_cache) des réponses d'API : économise les quotas (Perenual notamment).
 * Les erreurs ne sont pas mises en cache. `force` ignore le cache existant.
 */
export async function cached<T>(cle: string, force: boolean, fn: () => Promise<T>, ttl = CACHE_TTL): Promise<T> {
  if (!force) {
    const row = get<{ valeur: string; ts: number }>("SELECT valeur, ts FROM source_cache WHERE cle = ?", cle);
    if (row && Date.now() - row.ts < ttl) {
      try {
        return JSON.parse(row.valeur) as T;
      } catch {
        /* entrée corrompue : on interroge à nouveau */
      }
    }
  }
  const value = await fn();
  run(
    "INSERT INTO source_cache (cle, valeur, ts) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, ts = excluded.ts",
    cle,
    JSON.stringify(value),
    Date.now(),
  );
  return value;
}

export const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/(^|\s)[×x](?=\s)/g, " ").replace(/×/g, "").replace(/\s+/g, " ").trim();

/**
 * Choisit dans les résultats d'une recherche celui qui correspond au nom scientifique :
 * correspondance exacte, puis même espèce (genre + épithète, sans auteur ni variété), puis même genre.
 * Retourne null si rien ne correspond (pour ne pas récupérer les données d'une autre plante).
 */
export function meilleur<T>(items: T[], sciOf: (t: T) => string | null | undefined, sci: string): T | null {
  const cible = norm(sci);
  const [genre, epithete] = cible.split(" ");
  const named = items.map((t) => ({ t, n: norm(sciOf(t)) })).filter((x) => x.n);
  return (
    named.find((x) => x.n === cible)?.t ??
    (epithete ? named.find((x) => x.n.split(" ").slice(0, 2).join(" ") === `${genre} ${epithete}`)?.t : undefined) ??
    (!epithete ? named.find((x) => x.n.split(" ")[0] === genre)?.t : undefined) ??
    null
  );
}

/** Texte sans balises HTML ni espaces superflus. */
export const sansHtml = (s: unknown) =>
  typeof s === "string" ? s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null : null;
