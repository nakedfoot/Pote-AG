import { all, get, run } from "./db";
import { thumbnailBase64 } from "./image";
import { METRICS, METRIC_KEYS, type MetricKey } from "./metrics";
import { ageJours, getPlant, listPlants, plantStatus, type PlantRow } from "./queries";
import { listRappels } from "./rappels";
import type { MqttSettings } from "./settings";

/**
 * Publication MQTT : objet consolidé par plant + découverte Home Assistant.
 * Ce module ne connaît pas le client MQTT : il reçoit une fonction `publish`.
 */
export type Deps = {
  publish: (topic: string, payload: string, retain?: boolean) => void;
  cfg: MqttSettings;
};

const HA_DEVICE_CLASS: Record<MetricKey, string> = {
  temp_air: "temperature",
  hum_air: "humidity",
  hum_sol: "moisture",
  ec: "conductivity",
  lux: "illuminance",
};

export const statusTopic = (cfg: MqttSettings) => `${cfg.publishPrefix}/status`;
const base = (cfg: MqttSettings, id: number) => `${cfg.publishPrefix}/plant/${id}`;
export const stateTopic = (cfg: MqttSettings, id: number) => `${base(cfg, id)}/state`;
const imageUrlTopic = (cfg: MqttSettings, id: number) => `${base(cfg, id)}/image_url`;
const imageB64Topic = (cfg: MqttSettings, id: number) => `${base(cfg, id)}/image_b64`;

function absoluteImageUrl(cfg: MqttSettings, photo: string | null): string | null {
  if (!photo) return null;
  if (/^https?:\/\//.test(photo)) return photo;
  return cfg.publicUrl ? `${cfg.publicUrl}${photo}` : null;
}

// ---------- Objet consolidé ----------
export async function buildState(cfg: MqttSettings, p: PlantRow) {
  const s = plantStatus(p);
  const mesures: Record<string, unknown> = {};
  const alertes: string[] = [];
  for (const m of s.mesures) {
    const k = METRICS[m.metrique];
    mesures[m.metrique] = {
      valeur: m.valeur,
      unite: k.unite,
      min: p[k.min as keyof PlantRow] ?? null,
      max: p[k.max as keyof PlantRow] ?? null,
      etat: m.etat,
      capteur: m.capteur,
      date: m.ts ? new Date(m.ts).toISOString() : null,
    };
    if (m.etat === "bas" || m.etat === "haut") alertes.push(`${m.metrique}_${m.etat}`);
  }
  if (s.batterieBasse) alertes.push("batterie_faible");
  if (s.perime && s.mesures.length > 0) alertes.push("donnee_ancienne");

  const wantUrl = cfg.imageMode === "url" || cfg.imageMode === "both";
  const wantB64 = cfg.imageMode === "base64" || cfg.imageMode === "both";
  return {
    plant_id: p.id,
    nom: p.nom,
    variete: p.variete,
    zone: p.zone_nom,
    carre: p.carre_nom,
    date: new Date().toISOString(),
    statut: p.statut,
    etat_global: s.mesures.length ? s.pire : "inconnu",
    date_semis: p.date_semis,
    date_plantation: p.date_plantation,
    date_recolte_prevue: p.date_recolte_prevue,
    age_jours: ageJours(p.date_plantation),
    dernier_arrosage: s.dernierArrosage,
    batterie: s.batterie,
    openplantbook: p.opb_pid,
    mesures,
    alertes,
    image: {
      url: wantUrl ? absoluteImageUrl(cfg, p.photo) : null,
      base64: wantB64 && p.photo ? await thumbnailBase64(p.photo, cfg.imageMaxKb) : null,
    },
  };
}

export async function publishState(d: Deps, plantId: number) {
  const p = getPlant(plantId);
  if (!p) return;
  d.publish(stateTopic(d.cfg, plantId), JSON.stringify(await buildState(d.cfg, p)), true);
}

// ---------- Découverte Home Assistant ----------
function discoveryConfigs(cfg: MqttSettings, p: PlantRow, metriques: MetricKey[]) {
  const id = p.id;
  const st = stateTopic(cfg, id);
  const device = {
    identifiers: [`potager_${id}`],
    name: p.variete ? `${p.nom} (${p.variete})` : p.nom,
    manufacturer: "Potager",
    model: p.opb_pid ?? "Plant",
    ...(p.zone_nom ? { suggested_area: p.zone_nom } : {}),
  };
  const common = { availability: [{ topic: statusTopic(cfg) }], device };
  const out: { topic: string; payload: Record<string, unknown> }[] = [];
  const t = (component: string, object: string) => `${cfg.haDiscoveryPrefix}/${component}/potager_${id}/${object}/config`;

  for (const m of metriques) {
    out.push({
      topic: t("sensor", m),
      payload: {
        ...common,
        name: METRICS[m].label,
        unique_id: `potager_${id}_${m}`,
        state_topic: st,
        value_template: `{{ value_json.mesures.${m}.valeur }}`,
        unit_of_measurement: METRICS[m].unite,
        device_class: HA_DEVICE_CLASS[m],
        state_class: "measurement",
        json_attributes_topic: st,
        json_attributes_template: `{{ value_json.mesures.${m} | tojson }}`,
      },
    });
  }
  if (metriques.length > 0) {
    out.push({
      topic: t("binary_sensor", "alerte"),
      payload: {
        ...common,
        name: "Alerte",
        unique_id: `potager_${id}_alerte`,
        state_topic: st,
        value_template: "{{ 'ON' if value_json.alertes | length > 0 else 'OFF' }}",
        device_class: "problem",
        json_attributes_topic: st,
        json_attributes_template: "{{ {'alertes': value_json.alertes} | tojson }}",
      },
    });
    out.push({
      topic: t("sensor", "etat"),
      payload: { ...common, name: "État", unique_id: `potager_${id}_etat`, state_topic: st, value_template: "{{ value_json.etat_global }}", icon: "mdi:sprout" },
    });
  }
  out.push({
    topic: t("sensor", "age"),
    payload: { ...common, name: "Âge depuis la plantation", unique_id: `potager_${id}_age`, state_topic: st, value_template: "{{ value_json.age_jours }}", unit_of_measurement: "j", icon: "mdi:calendar-clock" },
  });
  out.push({
    topic: t("sensor", "dernier_arrosage"),
    payload: { ...common, name: "Dernier arrosage", unique_id: `potager_${id}_arrosage`, state_topic: st, value_template: "{{ value_json.dernier_arrosage if value_json.dernier_arrosage else none }}", device_class: "date" },
  });

  const wantUrl = cfg.imageMode === "url" || cfg.imageMode === "both";
  if (p.photo && (wantUrl ? absoluteImageUrl(cfg, p.photo) : true)) {
    out.push({
      topic: t("image", "photo"),
      payload: {
        ...common,
        name: "Photo",
        unique_id: `potager_${id}_photo`,
        ...(wantUrl ? { url_topic: imageUrlTopic(cfg, id) } : { image_topic: imageB64Topic(cfg, id), image_encoding: "b64", content_type: "image/jpeg" }),
      },
    });
  }
  return out;
}

const storedTopics = () => all<{ topic: string }>("SELECT topic FROM mqtt_discovery").map((r) => r.topic);

function removeTopics(d: Deps, topics: string[]) {
  for (const topic of topics) {
    d.publish(topic, "", true); // payload vide retenu = suppression de l'entité dans HA
    run("DELETE FROM mqtt_discovery WHERE topic = ?", topic);
  }
}

function recordTopic(topic: string) {
  run("INSERT OR IGNORE INTO mqtt_discovery (topic) VALUES (?)", topic);
}

/** Publie état + découverte + image pour un plant, et retire les entités devenues inutiles. */
export async function syncPlant(d: Deps, plantId: number) {
  const p = getPlant(plantId);
  if (!p) return removePlant(d, plantId);

  if (d.cfg.haDiscovery) {
    const metriques = METRIC_KEYS.filter((m) =>
      get("SELECT 1 FROM plant_capteur WHERE plant_id = ? AND metrique = ?", plantId, m),
    );
    const desired = discoveryConfigs(d.cfg, p, metriques);
    const desiredSet = new Set(desired.map((x) => x.topic));
    const mine = storedTopics().filter((t) => t.includes(`/potager_${plantId}/`));
    removeTopics(d, mine.filter((t) => !desiredSet.has(t)));
    for (const x of desired) {
      d.publish(x.topic, JSON.stringify(x.payload), true);
      recordTopic(x.topic);
    }
  } else {
    removeTopics(d, storedTopics().filter((t) => t.includes(`/potager_${plantId}/`)));
  }

  // Topics d'image (consommés par l'entité image de HA)
  const url = absoluteImageUrl(d.cfg, p.photo);
  d.publish(imageUrlTopic(d.cfg, plantId), p.photo && url ? url : "", true);
  const b64 = p.photo && d.cfg.imageMode !== "url" ? await thumbnailBase64(p.photo, d.cfg.imageMaxKb) : null;
  d.publish(imageB64Topic(d.cfg, plantId), b64 ?? "", true);

  await publishState(d, plantId);
}

// ---------- Rappels « à faire » (pour les notifications Home Assistant) ----------
const rappelsTopic = (cfg: MqttSettings) => `${cfg.publishPrefix}/rappels`;
const rappelsDiscoveryTopic = (cfg: MqttSettings) => `${cfg.haDiscoveryPrefix}/sensor/potager_hub/rappels/config`;

/**
 * Publie la liste des rappels sur `<préfixe>/rappels` et un capteur HA « Rappels potager »
 * (état = nombre de rappels, attributs = détail) : de quoi déclencher une notification par automatisation.
 */
export function publishRappels(d: Deps) {
  const items = listRappels();
  const resume = items.map((r) => `${r.nom} : ${r.message}`).join(" · ");
  d.publish(rappelsTopic(d.cfg), JSON.stringify({ date: new Date().toISOString(), total: items.length, resume, items }), true);
  d.publish(
    rappelsDiscoveryTopic(d.cfg),
    d.cfg.haDiscovery
      ? JSON.stringify({
          name: "Rappels",
          unique_id: "potager_hub_rappels",
          state_topic: rappelsTopic(d.cfg),
          value_template: "{{ value_json.total }}",
          json_attributes_topic: rappelsTopic(d.cfg),
          json_attributes_template: "{{ {'resume': value_json.resume, 'rappels': value_json['items']} | tojson }}",
          availability: [{ topic: statusTopic(d.cfg) }],
          icon: "mdi:clipboard-check-outline",
          device: { identifiers: ["potager_hub"], name: "Potager", manufacturer: "Potager", model: "Application" },
        })
      : "", // découverte désactivée : retire l'entité de Home Assistant
    true,
  );
}

/** Plant supprimé : on efface tout ce qui a été publié (retained). */
export function removePlant(d: Deps, plantId: number) {
  removeTopics(d, storedTopics().filter((t) => t.includes(`/potager_${plantId}/`)));
  for (const t of [stateTopic(d.cfg, plantId), imageUrlTopic(d.cfg, plantId), imageB64Topic(d.cfg, plantId)]) d.publish(t, "", true);
}

/** Synchronisation complète (à la connexion, après modification de zone/carré, ou à la demande). */
export async function syncAll(d: Deps): Promise<number> {
  const plants = listPlants();
  for (const p of plants) await syncPlant(d, p.id);
  // Entités de plants qui n'existent plus
  const alive = new Set(plants.map((p) => `/potager_${p.id}/`));
  const orphans = storedTopics().filter((t) => ![...alive].some((a) => t.includes(a)));
  removeTopics(d, orphans);
  publishRappels(d);
  return plants.length;
}
