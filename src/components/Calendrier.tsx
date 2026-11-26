import { MOIS_INITIALES, MOIS_NOMS, PERIODE_KEYS, PERIODES, PROVIDERS, parseMois, type PeriodeKey, type ProviderId } from "@/lib/botanique";

const COULEUR: Record<PeriodeKey, string> = {
  plantation: "bg-green-600 text-white",
  floraison: "bg-pink-500 text-white",
  fructification: "bg-red-500 text-white",
  recolte: "bg-amber-500 text-white",
  taille: "bg-slate-500 text-white",
  dormance: "bg-sky-600 text-white",
};

type Props = {
  /** Valeurs par colonne (mois_plantation…) au format "3,4,5" */
  valeurs: Partial<Record<string, unknown>>;
  /** Source de chaque colonne (affichée à droite de la ligne) */
  sources?: Partial<Record<string, ProviderId>>;
  /** Mois mis en évidence (1-12) */
  moisCourant?: number;
  /** Mode saisie : clic sur un mois pour l'ajouter / le retirer */
  onToggle?: (col: string, mois: number) => void;
  /** Masquer les lignes vides (affichage) */
  masquerVides?: boolean;
};

/** Calendrier annuel : une ligne par période, une colonne par mois. */
export default function Calendrier({ valeurs, sources, moisCourant, onToggle, masquerVides }: Props) {
  const lignes = PERIODE_KEYS.filter((k) => !masquerVides || parseMois(valeurs[PERIODES[k].col] as string | null).length > 0);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[36rem] grid-cols-[9rem_repeat(12,minmax(1.6rem,1fr))_6rem] items-center gap-1 text-xs">
        <span />
        {MOIS_INITIALES.map((m, i) => (
          <span key={i} title={MOIS_NOMS[i]} className={`text-center ${moisCourant === i + 1 ? "font-bold text-green-700" : "text-muted"}`}>{m}</span>
        ))}
        <span />
        {lignes.map((k) => {
          const col = PERIODES[k].col;
          const mois = parseMois(valeurs[col] as string | null);
          const src = sources?.[col];
          return (
            <div key={k} className="contents">
              <span className="text-sm">{PERIODES[k].icone} {PERIODES[k].label}</span>
              {MOIS_INITIALES.map((_, i) => {
                const on = mois.includes(i + 1);
                const cls = `h-6 rounded ${on ? COULEUR[k] : "bg-black/5 dark:bg-white/5"} ${moisCourant === i + 1 ? "ring-2 ring-green-700/60" : ""}`;
                return onToggle ? (
                  <button
                    key={i}
                    type="button"
                    title={`${PERIODES[k].label} : ${MOIS_NOMS[i]}`}
                    aria-pressed={on}
                    onClick={() => onToggle(col, i + 1)}
                    className={`${cls} hover:opacity-80`}
                  />
                ) : (
                  <span key={i} title={on ? `${PERIODES[k].label} : ${MOIS_NOMS[i]}` : undefined} className={cls} />
                );
              })}
              <span className="truncate pl-1 text-muted">{src ? PROVIDERS[src] : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
