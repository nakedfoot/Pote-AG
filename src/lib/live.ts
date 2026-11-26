/** Dernières valeurs reçues par capteur (en mémoire, partagées via globalThis). */
/** `etats` : valeurs texte utiles (ex. state ON/OFF d'une vanne). */
export type Live = { values: Record<string, number>; ts: number; etats?: Record<string, string> };

const g = globalThis as unknown as { __liveStore?: Map<string, Live> };
export const liveStore: Map<string, Live> = (g.__liveStore ??= new Map());

export const getLive = (friendlyName: string): Live | undefined => liveStore.get(friendlyName);
