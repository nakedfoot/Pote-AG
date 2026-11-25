export const METRICS = {
  temp_air: { label: "Température de l'air", unite: "°C", icone: "🌡️", min: "temp_min", max: "temp_max" },
  hum_air: { label: "Humidité de l'air", unite: "%", icone: "💨", min: "hum_air_min", max: "hum_air_max" },
  hum_sol: { label: "Humidité du sol", unite: "%", icone: "💧", min: "hum_sol_min", max: "hum_sol_max" },
  ec: { label: "Conductivité (fertilité)", unite: "µS/cm", icone: "🧪", min: "ec_min", max: "ec_max" },
  lux: { label: "Luminosité", unite: "lx", icone: "☀️", min: "lux_min", max: "lux_max" },
} as const;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** Champs Zigbee2MQTT reconnus automatiquement pour chaque métrique. */
export const Z2M_FIELD_HINTS: Record<MetricKey, string[]> = {
  temp_air: ["temperature", "air_temperature"],
  hum_air: ["humidity", "air_humidity"],
  hum_sol: ["soil_moisture", "soil_humidity"],
  ec: ["soil_fertility", "soil_ec", "conductivity", "ec"],
  lux: ["illuminance", "illuminance_lux", "illuminance_raw"],
};

export type Etat = "ok" | "bas" | "haut" | "inconnu";

export function etatMesure(valeur: number | null, min: number | null, max: number | null): Etat {
  if (valeur === null) return "inconnu";
  if (min !== null && valeur < min) return "bas";
  if (max !== null && valeur > max) return "haut";
  return min === null && max === null ? "inconnu" : "ok";
}

export const STATUTS = {
  semis: "Semis",
  croissance: "Croissance",
  floraison: "Floraison",
  recolte: "Récolte",
  termine: "Terminé",
} as const;
