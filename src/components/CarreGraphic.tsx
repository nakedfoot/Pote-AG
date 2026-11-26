/** État d'un plant (couleur du point), aligné sur la vue potager. */
export type EtatPlant = "ok" | "bas" | "haut" | "inconnu";
const COULEUR: Record<EtatPlant, string> = { ok: "#16a34a", bas: "#f59e0b", haut: "#dc2626", inconnu: "#9ca3af" };

const W = 240, H = 160;
const PAD = { l: 30, r: 34, t: 10, b: 20 };
const KX = 0.5, KY = 0.32; // inclinaison de la largeur (projection oblique)
const MAX_POINTS = 48;

const cm = (n: number) => `${Number(n.toFixed(1))} cm`;

/**
 * Représentation d'un carré potager en perspective : longueur (face avant), largeur (profondeur)
 * et hauteur du cadre, à l'échelle. Les plants s'affichent en points sur la terre.
 * Composant sans état, prévu pour être réutilisé (ex. vue potager).
 */
export default function CarreGraphic({
  longueur, largeur, hauteur, plants = [], className = "w-full",
}: {
  longueur: number | null; largeur: number | null; hauteur: number | null;
  plants?: { etat: EtatPlant }[]; className?: string;
}) {
  if (!longueur || !largeur) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-black/5 text-center text-xs text-muted dark:bg-white/5 ${className}`} style={{ aspectRatio: `${W} / ${H}` }}>
        Longueur et largeur à renseigner
      </div>
    );
  }
  const h = hauteur ?? 0;
  const ext = { x: longueur + largeur * KX, y: h + largeur * KY };
  const aw = W - PAD.l - PAD.r, ah = H - PAD.t - PAD.b;
  const s = Math.min(aw / ext.x, ah / ext.y);
  const x0 = PAD.l + (aw - ext.x * s) / 2;
  const yb = PAD.t + (ah + ext.y * s) / 2; // bas de la face avant
  const L = longueur * s, D = largeur * s, Hh = h * s;
  const dx = D * KX, dy = D * KY;
  const poly = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");

  // Face avant, face droite, dessus (terre)
  const front = poly([[x0, yb], [x0 + L, yb], [x0 + L, yb - Hh], [x0, yb - Hh]]);
  const side = poly([[x0 + L, yb], [x0 + L + dx, yb - dy], [x0 + L + dx, yb - dy - Hh], [x0 + L, yb - Hh]]);
  const top = poly([[x0, yb - Hh], [x0 + L, yb - Hh], [x0 + L + dx, yb - Hh - dy], [x0 + dx, yb - Hh - dy]]);

  // Plants : grille régulière sur la face supérieure
  const shown = plants.slice(0, MAX_POINTS);
  const n = shown.length;
  const cols = n ? Math.max(1, Math.ceil(Math.sqrt((n * longueur) / largeur))) : 1;
  const rows = n ? Math.ceil(n / cols) : 1;
  const r = Math.max(2, Math.min(7, 0.35 * Math.min(L / cols, dy / rows)));
  const dots = shown
    .map((p, i) => {
      const u = ((i % cols) + 0.5) / cols;
      const v = (Math.floor(i / cols) + 0.5) / rows;
      return { u, v, x: x0 + u * L + v * dx, y: yb - Hh - v * dy, etat: p.etat };
    })
    .sort((a, b) => b.v - a.v); // le fond d'abord

  const label = "fill-muted text-[10px]";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Carré de ${cm(longueur)} sur ${cm(largeur)}${hauteur ? `, hauteur ${cm(hauteur)}` : ""}`}>
      {h > 0 && <polygon points={front} fill="#b88a58" stroke="#6b4a28" strokeWidth={1} strokeLinejoin="round" />}
      {h > 0 && <polygon points={side} fill="#9a6e3f" stroke="#6b4a28" strokeWidth={1} strokeLinejoin="round" />}
      <polygon points={top} fill="#6b4a2f" stroke="#6b4a28" strokeWidth={1.5} strokeLinejoin="round" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={r} fill={COULEUR[d.etat]} stroke="#fff" strokeWidth={0.8} />
      ))}
      {/* Cotes */}
      <text x={x0 + L / 2} y={yb + 13} textAnchor="middle" className={label}>{cm(longueur)}</text>
      <text x={x0 + L + dx + 4} y={yb - Hh - dy / 2 + 3} className={label}>{cm(largeur)}</text>
      {h > 0 && <text x={x0 - 4} y={yb - Hh / 2 + 3} textAnchor="end" className={label}>{cm(h)}</text>}
    </svg>
  );
}
