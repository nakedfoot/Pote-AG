import type { Fiche, ProviderId } from "../botanique";

/** Résultat d'une source pour une espèce. `id` = identifiant de l'espèce dans la source (réutilisé ensuite). */
export type Resultat = { id: string; fiche: Fiche; raw?: unknown };

export type Provider = {
  id: ProviderId;
  /** Identifiants renseignés (toujours vrai pour les sources sans clé). */
  configured: () => boolean;
  /** Données de l'espèce `sci` (ou de l'identifiant connu `id`) ; null si la source ne la connaît pas. */
  fetch: (sci: string, id: string | undefined, force: boolean) => Promise<Resultat | null>;
};
