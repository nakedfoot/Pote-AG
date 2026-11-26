import { get, run } from "./db";
import { DEFAULT_ORDER, PROVIDER_IDS, type ProviderId } from "./botanique";
import { decrypt, encrypt } from "./crypto";

export type MqttSettings = {
  host: string;
  port: number | null; // null = pas de port dans l'URL (géré par un reverse proxy)
  tls: boolean;
  username: string;
  password: string; // en clair côté serveur uniquement
  z2mBaseTopic: string; // topic de base Zigbee2MQTT
  publishPrefix: string; // préfixe des états publiés par l'appli
  haDiscovery: boolean; // publier la découverte Home Assistant
  haDiscoveryPrefix: string; // préfixe de découverte HA (défaut : homeassistant)
  imageMode: "url" | "base64" | "both";
  imageMaxKb: number;
  publicUrl: string; // URL publique de l'appli (pour les liens d'images)
};

export const MQTT_DEFAULTS: MqttSettings = {
  host: "",
  port: null,
  tls: false,
  username: "",
  password: "",
  z2mBaseTopic: "zigbee2mqtt",
  publishPrefix: "potager",
  haDiscovery: true,
  haDiscoveryPrefix: "homeassistant",
  imageMode: "url",
  imageMaxKb: 50,
  publicUrl: "",
};

/** URL de connexion : port ajouté seulement s'il est renseigné ; un schéma saisi dans l'adresse (ws://, wss://…) est respecté. */
export function mqttUrl(cfg: Pick<MqttSettings, "host" | "port" | "tls">): string {
  const host = cfg.host.trim();
  if (/^[a-z]+:\/\//i.test(host)) return host;
  return `${cfg.tls ? "mqtts" : "mqtt"}://${host}${cfg.port ? `:${cfg.port}` : ""}`;
}

function read<T>(cle: string, defaults: T): T {
  const row = get<{ valeur: string }>("SELECT valeur FROM settings WHERE cle = ?", cle);
  if (!row) return defaults;
  try {
    return { ...defaults, ...JSON.parse(row.valeur) };
  } catch {
    return defaults;
  }
}

function write(cle: string, value: unknown) {
  run(
    "INSERT INTO settings (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
    cle,
    JSON.stringify(value),
  );
}

export function getMqttSettings(): MqttSettings {
  const s = read<MqttSettings & { password: string }>("mqtt", MQTT_DEFAULTS);
  return { ...s, password: decrypt(s.password) };
}

/** Si password est vide, l'ancien mot de passe est conservé. */
export function saveMqttSettings(next: MqttSettings) {
  const prev = read<MqttSettings>("mqtt", MQTT_DEFAULTS);
  write("mqtt", { ...next, password: next.password ? encrypt(next.password) : prev.password });
}

export type OpbSettings = { clientId: string; clientSecret: string };

const OPB_DEFAULTS: OpbSettings = { clientId: "", clientSecret: "" };

export function getOpbSettings(): OpbSettings {
  const s = read<OpbSettings>("openplantbook", OPB_DEFAULTS);
  return { clientId: s.clientId, clientSecret: decrypt(s.clientSecret) };
}

export const hasOpbCredentials = () => {
  const s = getOpbSettings();
  return s.clientId !== "" && s.clientSecret !== "";
};

/** Si le secret est vide, l'ancien est conservé. */
export function saveOpbSettings(next: OpbSettings) {
  const prev = read<OpbSettings>("openplantbook", OPB_DEFAULTS);
  write("openplantbook", {
    clientId: next.clientId,
    clientSecret: next.clientSecret ? encrypt(next.clientSecret) : prev.clientSecret,
  });
}

// ---------- Sources botaniques (ordre de priorité, activation, clés) ----------
export type SourcesSettings = {
  order: ProviderId[];
  enabled: Record<ProviderId, boolean>;
  trefleToken: string; // en clair côté serveur uniquement
  perenualKey: string; // en clair côté serveur uniquement
  inatPlaceId: number | null; // lieu iNaturalist pour la phénologie (6753 = France)
};

export const SOURCES_DEFAULTS: SourcesSettings = {
  order: DEFAULT_ORDER,
  enabled: { openplantbook: true, trefle: true, inaturalist: true, perenual: true },
  trefleToken: "",
  perenualKey: "",
  inatPlaceId: 6753,
};

export function getSourcesSettings(): SourcesSettings {
  const s = read<SourcesSettings>("sources", SOURCES_DEFAULTS);
  // Ordre : on garde les sources connues dans l'ordre enregistré, puis on ajoute celles qui manqueraient.
  const order = [...new Set([...(s.order ?? []).filter((p) => PROVIDER_IDS.includes(p)), ...DEFAULT_ORDER])];
  return {
    ...s,
    order,
    enabled: { ...SOURCES_DEFAULTS.enabled, ...s.enabled },
    trefleToken: decrypt(s.trefleToken),
    perenualKey: decrypt(s.perenualKey),
  };
}

/** Clé vide = clé précédente conservée. */
export function saveSourcesSettings(next: SourcesSettings) {
  const prev = read<SourcesSettings>("sources", SOURCES_DEFAULTS);
  write("sources", {
    ...next,
    trefleToken: next.trefleToken ? encrypt(next.trefleToken) : prev.trefleToken,
    perenualKey: next.perenualKey ? encrypt(next.perenualKey) : prev.perenualKey,
  });
}

// ---------- Irrigation (réglages globaux) ----------
export type Plage = { debut: string; fin: string }; // "HH:MM"

export type IrrigationSettings = {
  latitude: number | null;
  longitude: number | null;
  fuseau: string; // fuseau horaire IANA : plages horaires et quotas journaliers
  plages: Plage[]; // plages horaires proposées par défaut aux nouveaux canaux
  mesureMaxMin: number; // âge maximal d'une mesure d'humidité pour lancer un arrosage
  meteoIndispo: "ignorer" | "bloquer"; // que faire des règles météo si Open-Meteo ne répond pas
  pause: boolean; // pause globale des arrosages automatiques
  pauseJusqu: string | null; // AAAA-MM-JJ (inclus) ; null = jusqu'à reprise manuelle
};

export const IRRIGATION_DEFAULTS: IrrigationSettings = {
  latitude: null,
  longitude: null,
  fuseau: "Europe/Paris",
  plages: [{ debut: "05:00", fin: "10:00" }, { debut: "19:00", fin: "22:00" }],
  mesureMaxMin: 30,
  meteoIndispo: "ignorer",
  pause: false,
  pauseJusqu: null,
};

export const getIrrigationSettings = (): IrrigationSettings => read<IrrigationSettings>("irrigation", IRRIGATION_DEFAULTS);
export const saveIrrigationSettings = (next: IrrigationSettings) => write("irrigation", next);
