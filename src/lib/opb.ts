import { getOpbSettings } from "./settings";

const BASE = process.env.OPB_BASE_URL ?? "https://open.plantbook.io/api/v1";

export type OpbSearchResult = { pid: string; display_pid: string; alias: string; category: string };
export type OpbDetail = {
  pid: string;
  display_pid: string;
  alias: string;
  category: string;
  image_url: string | null;
  min_temp: number | null; max_temp: number | null;
  min_env_humid: number | null; max_env_humid: number | null;
  min_soil_moist: number | null; max_soil_moist: number | null;
  min_soil_ec: number | null; max_soil_ec: number | null;
  min_light_lux: number | null; max_light_lux: number | null;
  min_light_mmol: number | null; max_light_mmol: number | null;
};

export class OpbError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Jeton OAuth2 (client_credentials), mis en cache jusqu'à expiration.
const g = globalThis as unknown as { __opbToken?: { key: string; token: string; exp: number } };

/** Obtient un jeton d'accès à partir du Client ID / Client Secret. */
export async function fetchToken(clientId: string, clientSecret: string, force = false): Promise<string> {
  const key = `${clientId}:${clientSecret}`;
  const c = g.__opbToken;
  if (!force && c && c.key === key && c.exp > Date.now() + 60_000) return c.token;
  const res = await fetch(`${BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new OpbError("Client ID ou Client Secret refusé par OpenPlantbook.", 401);
  }
  if (!res.ok) throw new OpbError(`Erreur OpenPlantbook (HTTP ${res.status}).`, 502);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new OpbError("Réponse OpenPlantbook inattendue (pas de jeton).", 502);
  g.__opbToken = { key, token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function call<T>(path: string, retry = true): Promise<T> {
  const { clientId, clientSecret } = getOpbSettings();
  if (!clientId || !clientSecret) throw new OpbError("Identifiants OpenPlantbook non configurés.", 400);
  const token = await fetchToken(clientId, clientSecret);
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 && retry) {
    await fetchToken(clientId, clientSecret, true); // jeton expiré ou révoqué
    return call<T>(path, false);
  }
  if (res.status === 401 || res.status === 403) throw new OpbError("Accès refusé par OpenPlantbook.", 401);
  if (res.status === 404) throw new OpbError("Plante introuvable.", 404);
  if (!res.ok) throw new OpbError(`Erreur OpenPlantbook (HTTP ${res.status}).`, 502);
  return (await res.json()) as T;
}

export async function searchPlants(q: string): Promise<OpbSearchResult[]> {
  const data = await call<{ results?: OpbSearchResult[] } | OpbSearchResult[]>(
    `/plant/search?alias=${encodeURIComponent(q)}&limit=10`,
  );
  return Array.isArray(data) ? data : (data.results ?? []);
}

export const getPlantDetail = (pid: string) => call<OpbDetail>(`/plant/detail/${encodeURIComponent(pid)}/`);
