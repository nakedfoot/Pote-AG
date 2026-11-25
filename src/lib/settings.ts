import { get, run } from "./db";
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
