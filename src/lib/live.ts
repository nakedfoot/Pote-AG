/** Dernières valeurs reçues par capteur (en mémoire, partagées via globalThis). */
export type Live = { values: Record<string, number>; ts: number };

const g = globalThis as unknown as { __liveStore?: Map<string, Live> };
export const liveStore: Map<string, Live> = (g.__liveStore ??= new Map());

export const getLive = (friendlyName: string): Live | undefined => liveStore.get(friendlyName);
