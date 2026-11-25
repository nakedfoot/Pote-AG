"use server";

import mqtt from "mqtt";
import { requireAdmin } from "@/lib/auth";
import { fetchToken, OpbError } from "@/lib/opb";
import { getMqttStatus, startMqtt, syncAllNow } from "@/lib/mqtt-service";
import {
  getMqttSettings,
  getOpbSettings,
  mqttUrl,
  saveMqttSettings,
  saveOpbSettings,
  type MqttSettings,
} from "@/lib/settings";

export type ActionResult = { ok: boolean; message: string };

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const topic = (v: string) => v.replace(/^\/+|\/+$/g, "");

function parseMqtt(f: FormData): MqttSettings {
  const mode = s(f, "imageMode");
  return {
    host: s(f, "host"),
    port: Number(s(f, "port")) || null,
    tls: f.get("tls") === "on",
    username: s(f, "username"),
    password: String(f.get("password") ?? ""),
    z2mBaseTopic: topic(s(f, "z2mBaseTopic")) || "zigbee2mqtt",
    publishPrefix: topic(s(f, "publishPrefix")) || "potager",
    haDiscovery: f.get("haDiscovery") === "on",
    haDiscoveryPrefix: topic(s(f, "haDiscoveryPrefix")) || "homeassistant",
    imageMode: mode === "base64" || mode === "both" ? mode : "url",
    imageMaxKb: Math.max(5, Number(s(f, "imageMaxKb")) || 50),
    publicUrl: s(f, "publicUrl").replace(/\/+$/, ""),
  };
}

export async function saveMqtt(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const next = parseMqtt(f);
  if (!next.host) return { ok: false, message: "L'adresse du serveur est obligatoire." };
  if (next.imageMode !== "base64" && !next.publicUrl) {
    return { ok: false, message: "L'URL publique de l'application est nécessaire pour publier le lien de l'image." };
  }
  saveMqttSettings(next);
  startMqtt(); // applique immédiatement les nouveaux paramètres
  return { ok: true, message: "Paramètres MQTT enregistrés." };
}

export async function testMqtt(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const form = parseMqtt(f);
  // Mot de passe non ressaisi : on teste avec celui déjà enregistré.
  const password = form.password || getMqttSettings().password;
  if (!form.host) return { ok: false, message: "Renseignez l'adresse du serveur." };
  const url = mqttUrl(form);
  const client = mqtt.connect(url, {
    username: form.username || undefined,
    password: password || undefined,
    connectTimeout: 5000,
    reconnectPeriod: 0,
    clientId: `potager-test-${Math.random().toString(16).slice(2, 8)}`,
  });
  return new Promise<ActionResult>((resolve) => {
    const done = (r: ActionResult) => {
      client.end(true);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, message: "Délai dépassé : serveur injoignable." }), 7000);
    client.on("connect", () => {
      clearTimeout(timer);
      done({ ok: true, message: `Connexion réussie à ${url}.` });
    });
    client.on("error", (e) => {
      clearTimeout(timer);
      done({ ok: false, message: `Échec : ${e.message}` });
    });
  });
}

export async function saveOpb(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const clientId = s(f, "clientId");
  if (!clientId) return { ok: false, message: "Le Client ID est obligatoire." };
  saveOpbSettings({ clientId, clientSecret: s(f, "clientSecret") });
  return { ok: true, message: "Identifiants OpenPlantbook enregistrés." };
}

export async function testOpb(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  // Secret non ressaisi : on teste avec celui déjà enregistré.
  const saved = getOpbSettings();
  const clientId = s(f, "clientId") || saved.clientId;
  const clientSecret = s(f, "clientSecret") || saved.clientSecret;
  if (!clientId || !clientSecret) return { ok: false, message: "Renseignez le Client ID et le Client Secret." };
  try {
    await fetchToken(clientId, clientSecret, true);
    return { ok: true, message: "Identifiants valides, OpenPlantbook répond." };
  } catch (e) {
    return { ok: false, message: e instanceof OpbError ? e.message : `Échec : ${(e as Error).message}` };
  }
}

export async function republishMqtt(_: ActionResult | null, __: FormData): Promise<ActionResult> {
  await requireAdmin();
  if (!getMqttStatus().connected) return { ok: false, message: "MQTT non connecté : enregistrez les paramètres puis réessayez." };
  const n = await syncAllNow();
  return { ok: true, message: `${n} plant(s) publié(s) (état, découverte Home Assistant et image).` };
}
