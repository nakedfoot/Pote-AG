"use server";

import mqtt from "mqtt";
import { requireAdmin } from "@/lib/auth";
import { fetchToken, OpbError } from "@/lib/opb";
import { getMqttStatus, startMqtt, syncAllNow, syncPlantNow } from "@/lib/mqtt-service";
import { FIELD_LABELS, PROVIDER_IDS, type FieldKey, type ProviderId } from "@/lib/botanique";
import { listPlants } from "@/lib/queries";
import {
  getMqttSettings,
  getOpbSettings,
  getSourcesSettings,
  mqttUrl,
  saveMqttSettings,
  saveOpbSettings,
  saveSourcesSettings,
  type MqttSettings,
} from "@/lib/settings";
import { completerPlant } from "@/lib/sources";
import { SourceError } from "@/lib/sources/http";
import { searchInat } from "@/lib/sources/inaturalist";
import { testPerenual } from "@/lib/sources/perenual";
import { testTrefle } from "@/lib/sources/trefle";

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

/** Page « Sources botaniques » : ordre, activation et identifiants de toutes les sources. */
export async function saveSources(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const order = f.getAll("order").map(String).filter((p): p is ProviderId => (PROVIDER_IDS as string[]).includes(p));
  const enabled = Object.fromEntries(PROVIDER_IDS.map((p) => [p, f.get(`enabled_${p}`) === "on"])) as Record<ProviderId, boolean>;
  const place = Number(s(f, "inatPlaceId"));
  saveSourcesSettings({
    order,
    enabled,
    trefleToken: s(f, "trefleToken"),
    perenualKey: s(f, "perenualKey"),
    inatPlaceId: Number.isInteger(place) && place > 0 ? place : null,
  });
  saveOpbSettings({ clientId: s(f, "clientId"), clientSecret: s(f, "clientSecret") });
  return { ok: true, message: "Sources enregistrées." };
}

const echec = (e: unknown): ActionResult => ({
  ok: false,
  message: e instanceof SourceError || e instanceof OpbError ? e.message : `Échec : ${(e as Error).message}`,
});

export async function testTrefleAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const token = s(f, "trefleToken") || getSourcesSettings().trefleToken;
  if (!token) return { ok: false, message: "Renseignez le jeton Trefle." };
  try {
    await testTrefle(token);
    return { ok: true, message: "Jeton valide, Trefle répond." };
  } catch (e) {
    return echec(e);
  }
}

export async function testPerenualAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const key = s(f, "perenualKey") || getSourcesSettings().perenualKey;
  if (!key) return { ok: false, message: "Renseignez la clé Perenual." };
  try {
    await testPerenual(key);
    return { ok: true, message: "Clé valide, Perenual répond." };
  } catch (e) {
    return echec(e);
  }
}

export async function testInatAction(): Promise<ActionResult> {
  await requireAdmin();
  try {
    const r = await searchInat("tomate", true);
    return { ok: true, message: `iNaturalist répond (${r[0]?.name ?? "aucun résultat"} pour « tomate »).` };
  } catch (e) {
    return echec(e);
  }
}

/**
 * Complète tous les plants à partir des sources (champs vides uniquement, saisies manuelles jamais modifiées).
 * Option « rafraichir » : ignore le cache et met aussi à jour les valeurs déjà issues des sources.
 */
export async function completerPlants(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const rafraichir = f.get("rafraichir") === "on";
  const plants = listPlants();
  let completes = 0, champs = 0, complets = 0, inchanges = 0;
  const nonIdentifies: string[] = [];
  const erreurs = new Set<string>();
  const restants = new Map<FieldKey, number>();
  for (const p of plants) {
    const r = await completerPlant(p, rafraichir);
    r.erreurs.forEach((e) => erreurs.add(e));
    if (r.statut === "non_identifie") nonIdentifies.push(p.nom);
    if (r.statut === "complet") complets++;
    if (r.statut === "inchange") inchanges++;
    if (r.statut === "complete") {
      completes++;
      champs += r.remplis.length;
      syncPlantNow(p.id);
    }
    for (const k of r.restants) restants.set(k, (restants.get(k) ?? 0) + 1);
  }
  const parts = [`${plants.length} plant(s) examiné(s) : ${completes} complété(s) (${champs} champ(s) renseigné(s))`];
  if (complets) parts.push(`${complets} déjà complet(s)`);
  if (inchanges) parts.push(`${inchanges} sans nouvelle donnée`);
  if (nonIdentifies.length) parts.push(`espèce non identifiée pour : ${nonIdentifies.join(", ")} (renseignez le nom scientifique)`);
  let message = parts.join(" · ") + ".";
  if (restants.size) {
    const top = [...restants].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${FIELD_LABELS[k]} (${n})`);
    message += ` Champs encore vides : ${top.join(", ")}.`;
  }
  if (erreurs.size) message += ` Erreurs : ${[...erreurs].join(" ; ")}`;
  return { ok: erreurs.size === 0 || completes > 0, message };
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
