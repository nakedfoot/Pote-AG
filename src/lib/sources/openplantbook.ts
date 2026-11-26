import { getPlantDetail, OpbError, searchPlants, type OpbDetail } from "../opb";
import { hasOpbCredentials } from "../settings";
import { cached, meilleur, SourceError } from "./http";
import type { Provider } from "./types";

// Les erreurs OpenPlantbook sont converties en SourceError (messages homogènes avec les autres sources).
async function opb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OpbError) throw new SourceError(`OpenPlantbook : ${e.message}`, e.status);
    throw e;
  }
}

export const openplantbook: Provider = {
  id: "openplantbook",
  configured: hasOpbCredentials,
  async fetch(sci, id, force) {
    let pid = id;
    if (!pid) {
      const res = await cached(`opb:search:${sci.toLowerCase()}`, force, () => opb(() => searchPlants(sci)));
      pid = meilleur(res, (r) => r.display_pid || r.pid, sci)?.pid;
      if (!pid) return null;
    }
    let d: OpbDetail;
    try {
      d = await cached(`opb:detail:${pid}`, force, () => opb(() => getPlantDetail(pid)));
    } catch (e) {
      if (e instanceof SourceError && e.status === 404) return null;
      throw e;
    }
    return {
      id: pid,
      raw: d,
      fiche: {
        nom_scientifique: d.display_pid,
        nom_commun: d.alias,
        photo: d.image_url,
        temp_min: d.min_temp, temp_max: d.max_temp,
        hum_air_min: d.min_env_humid, hum_air_max: d.max_env_humid,
        hum_sol_min: d.min_soil_moist, hum_sol_max: d.max_soil_moist,
        ec_min: d.min_soil_ec, ec_max: d.max_soil_ec,
        lux_min: d.min_light_lux, lux_max: d.max_light_lux,
      },
    };
  },
};
