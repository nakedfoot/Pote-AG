import type { ReactNode } from "react";
import type { TypePlante } from "@/lib/carres";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const FLEURS = ["#ec4899", "#f59e0b", "#a855f7", "#ef4444", "#f8fafc", "#facc15"];
/** Verts du plus clair (0) au plus sombre (5) */
const VERTS = ["#a6e06b", "#86ca4f", "#64b23c", "#489834", "#337d29", "#23631f"];
/** Feuille pointue de longueur 1, base en (0,0), pointe vers le haut */
const FEUILLE = "M0,0 C0.32,-0.18 0.34,-0.7 0,-1 C-0.34,-0.7 -0.32,-0.18 0,0Z";

/** Générateur pseudo-aléatoire déterministe (mulberry32) : une même plante garde toujours le même feuillage. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const feuille = (x: number, y: number, angle: number, taille: number, fill: string, key: number) => (
  <path key={key} d={FEUILLE} fill={fill} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(0)}) scale(${(taille * 0.62).toFixed(2)} ${taille.toFixed(2)})`} />
);

type Segment = { x1: number; y1: number; x2: number; y2: number; w: number };
/** Départ d'une branche : position, angle (rad, 0 = vertical), longueur, épaisseur, profondeur de ramification */
type Depart = [x: number, y: number, ang: number, len: number, w: number, prof: number];

/**
 * Ramure : des branches qui se divisent (récursivement, avec un peu de hasard), puis des bouquets de feuilles
 * au bout des rameaux. Le ciel reste visible entre les branches. Sert à l'arbre et à l'arbuste.
 */
function Ramure({
  rand, departs, tronc, feuillesTotal, rayonBouquet, tailleFeuille, centre, rx, ry, ecart, fruit,
}: {
  rand: () => number; departs: Depart[]; tronc?: ReactNode; feuillesTotal: number; rayonBouquet: number;
  tailleFeuille: number; centre: number; rx: number; ry: number; ecart: number; fruit?: { couleur: string; rayon: number } | null;
}) {
  const segs: Segment[] = [];
  const bouts: { x: number; y: number }[] = [];

  const pousse = (x: number, y: number, ang: number, len: number, w: number, prof: number) => {
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    segs.push({ x1: x, y1: y, x2, y2, w });
    if (prof === 0) {
      bouts.push({ x: x2, y: y2 });
      return;
    }
    const n = prof === 1 || rand() < 0.55 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const e = (k / (n - 1) - 0.5) * ecart + (rand() - 0.5) * 0.35;
      pousse(x2, y2, ang + e, len * (0.66 + rand() * 0.16), w * 0.66, prof - 1);
    }
    // rameau secondaire en cours de route
    if (prof >= 2 && rand() < 0.7) pousse((x + x2) / 2, (y + y2) / 2, ang + (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 0.4), len * 0.5, w * 0.5, prof - 2);
  };
  for (const d of departs) pousse(...d);

  const parBouquet = Math.round(clamp(feuillesTotal / Math.max(1, bouts.length), 6, 24));
  const feuilles: { x: number; y: number; angle: number; ombre: number; taille: number }[] = [];
  for (const b of bouts) {
    for (let i = 0; i < parBouquet; i++) {
      const r = Math.sqrt(rand()) * rayonBouquet;
      const th = rand() * Math.PI * 2;
      const x = b.x + Math.cos(th) * r * 1.15;
      const y = b.y + Math.sin(th) * r * 0.9 - rayonBouquet * 0.15;
      const px = clamp(x / rx, -1, 1);
      const py = clamp((y - centre) / ry, -1, 1);
      const ombre = clamp(0.5 + 0.32 * py + 0.14 * px + (rand() - 0.5) * 0.45, 0, 1);
      feuilles.push({ x, y, angle: (Math.atan2(x - b.x, -(y - b.y)) * 180) / Math.PI + (rand() - 0.5) * 120, ombre: Math.round(ombre * 5), taille: tailleFeuille * (0.8 + rand() * 0.6) });
    }
  }
  feuilles.sort((a, b) => b.ombre - a.ombre);

  // Fruits : accrochés sous quelques bouquets (tirés après les feuilles : le feuillage reste identique avec ou sans fruits)
  const fruits = fruit
    ? Array.from({ length: Math.round(clamp(bouts.length * 0.45, 5, 16)) }, () => {
        const b = bouts[Math.floor(rand() * bouts.length)];
        return { x: b.x + (rand() - 0.5) * rayonBouquet * 1.4, y: b.y + rayonBouquet * (0.15 + rand() * 0.55) };
      })
    : [];

  return (
    <>
      {tronc}
      {[...segs].sort((a, b) => b.w - a.w).map((g, i) => (
        <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#4e331c" strokeWidth={Math.max(0.6, g.w)} strokeLinecap="round" />
      ))}
      {feuilles.map((f, i) => feuille(f.x, f.y, f.angle, f.taille, VERTS[f.ombre], i))}
      {fruit && fruits.map((f, i) => (
        <g key={`fruit${i}`}>
          <circle cx={f.x} cy={f.y} r={fruit.rayon} fill={fruit.couleur} stroke="#000" strokeOpacity={0.3} strokeWidth={0.4} />
          <circle cx={f.x - fruit.rayon * 0.3} cy={f.y - fruit.rayon * 0.3} r={fruit.rayon * 0.3} fill="#fff" opacity={0.55} />
        </g>
      ))}
    </>
  );
}

/** Arbre : tronc évasé qui se divise en une flèche centrale et quatre maîtresses branches. */
function Arbre({ H, rand, uid, fruit }: { H: number; rand: () => number; uid: string; fruit: string | null }) {
  const tw = Math.max(2, H * 0.06); // largeur du tronc à la base
  const yTronc = -H * 0.36; // sommet du tronc, où partent les branches
  const tronc = (
    <polygon
      points={`${-tw * 0.95},0 ${-tw * 0.55},${-H * 0.1} ${-tw * 0.4},${yTronc} ${tw * 0.4},${yTronc} ${tw * 0.55},${-H * 0.1} ${tw * 0.95},0`}
      fill={`url(#trunk${uid})`} stroke="#2f1d0e" strokeOpacity={0.5} strokeWidth={0.5}
    />
  );
  const departs: Depart[] = [
    [0, yTronc, (rand() - 0.5) * 0.2, H * 0.2, tw * 0.5, 3],
    [0, yTronc + H * 0.02, -0.95, H * 0.17, tw * 0.42, 2],
    [0, yTronc + H * 0.02, 0.95, H * 0.17, tw * 0.42, 2],
    [0, yTronc - H * 0.07, -0.5, H * 0.17, tw * 0.38, 2],
    [0, yTronc - H * 0.07, 0.5, H * 0.17, tw * 0.38, 2],
  ];
  return (
    <Ramure
      rand={rand} departs={departs} tronc={tronc} feuillesTotal={240} rayonBouquet={H * 0.085}
      tailleFeuille={clamp(H * 0.085, 2.4, 7)} centre={-H * 0.7} rx={H * 0.4} ry={H * 0.32} ecart={1.15}
      fruit={fruit ? { couleur: fruit, rayon: clamp(H * 0.03, 1.4, 5) } : null}
    />
  );
}

/** Arbuste : plusieurs tiges qui partent du sol et se ramifient, feuillage plus touffu que l'arbre. */
function Arbuste({ H, rand, fruit }: { H: number; rand: () => number; fruit: string | null }) {
  const n = 6;
  const w = Math.max(0.9, H * 0.022);
  const departs: Depart[] = Array.from({ length: n }, (_, k) => {
    const f = k / (n - 1) - 0.5; // -0,5 … 0,5
    return [f * H * 0.16, 0, f * 1.15 + (rand() - 0.5) * 0.2, H * (0.2 + rand() * 0.06), w, 3];
  });
  return (
    <Ramure
      rand={rand} departs={departs} feuillesTotal={480} rayonBouquet={H * 0.085}
      tailleFeuille={clamp(H * 0.075, 2.2, 6.5)} centre={-H * 0.55} rx={H * 0.45} ry={H * 0.47} ecart={1.0}
      fruit={fruit ? { couleur: fruit, rayon: clamp(H * 0.026, 1.2, 4) } : null}
    />
  );
}

/**
 * Plante dessinée en SVG, vue de face, posée au point (x, y) — la base de la plante.
 * `hcm` : hauteur en cm, `s` : pixels par cm. Les proportions (largeur / hauteur) suivent la forme de la plante :
 * une plante de 15 cm reste une petite plante, jamais un arbre aplati. Les dégradés `leafL`, `leafD` et `trunk`
 * viennent du `<defs>` parent.
 */
export default function Plante3D({
  type, x, y, hcm, esp, fruit = null, s, id, uid,
}: {
  type: TypePlante; x: number; y: number; hcm: number; esp: number | null; fruit?: string | null; s: number; id: number; uid: string;
}) {
  const H = Math.max(hcm * s, 6);
  const u = (n: string) => `url(#${n}${uid})`;
  const rand = rng(id * 7919 + type.length * 31);
  let W: number;
  let corps: ReactNode;

  if (type === "arbre") {
    // Couronne d'environ 0,8 × la hauteur
    W = H * 0.8;
    corps = <Arbre H={H} rand={rand} uid={uid} fruit={fruit} />;
  } else if (type === "arbuste") {
    // Buisson : environ 0,9 × la hauteur de large
    W = H * 0.9;
    corps = <Arbuste H={H} rand={rand} fruit={fruit} />;
  } else if (type === "fleur") {
    W = Math.max(H * 0.35, 5);
    const r = clamp(H * 0.13, 2.5, 14);
    const couleur = FLEURS[id % FLEURS.length];
    const taille = clamp(H * 0.2, 3, 12);
    corps = (
      <>
        <line x1={0} y1={0} x2={0} y2={-H * 0.86} stroke="#3f7d2b" strokeWidth={Math.max(1, H * 0.035)} strokeLinecap="round" />
        {[[-0.18, -60], [-0.34, 55], [-0.5, -50], [-0.62, 60]].map(([hy, a], i) => feuille(0, hy * H, a, taille, VERTS[2 + (i % 2)], i))}
        <g transform={`translate(0 ${-H * 0.88})`}>
          {Array.from({ length: 7 }, (_, k) => (
            <g key={k} transform={`rotate(${k * (360 / 7)})`}>
              <ellipse cx={0} cy={-r * 0.58} rx={r * 0.38} ry={r * 0.62} fill={couleur} stroke="#000" strokeOpacity={0.22} strokeWidth={0.4} />
            </g>
          ))}
          <circle r={r * 0.32} fill="#f59e0b" stroke="#92400e" strokeOpacity={0.5} strokeWidth={0.4} />
        </g>
      </>
    );
  } else if (type === "grimpante") {
    W = Math.max(H * 0.3, 8);
    const taille = clamp(H * 0.07, 2.5, 9);
    const pts = Array.from({ length: 15 }, (_, i) => [Math.sin(i * 1.15) * W * 0.32, -(H * i) / 14] as const);
    corps = (
      <>
        <line x1={0} y1={0} x2={0} y2={-H} stroke="#7a5230" strokeWidth={Math.max(1, H * 0.025)} strokeLinecap="round" />
        <polyline points={pts.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")} fill="none" stroke="#3f7d2b" strokeWidth={Math.max(0.8, H * 0.02)} strokeLinejoin="round" />
        {pts.slice(1).flatMap(([px, py], i) => [
          feuille(px, py, i % 2 ? 55 : -55, taille * (0.85 + rand() * 0.4), VERTS[1 + Math.floor(rand() * 3)], i * 2),
          feuille(px, py + taille * 0.2, i % 2 ? -110 : 110, taille * (0.7 + rand() * 0.4), VERTS[2 + Math.floor(rand() * 3)], i * 2 + 1),
        ])}
      </>
    );
  } else {
    // Légume, aromatique, herbacée : touffe de feuilles ; la largeur suit l'espacement mais reste proportionnée à la hauteur
    const wcm = clamp((esp ?? hcm * 0.9) * 0.8, hcm * 0.55, hcm * 1.3);
    W = Math.max(wcm * s, 7);
    const n = 11;
    const maxAng = clamp((Math.atan((W * 0.5) / (H * 0.7)) * 180) / Math.PI, 18, 70);
    corps = Array.from({ length: n }, (_, i) => {
      const f = i / (n - 1);
      const ang = -maxAng + 2 * maxAng * f + (rand() - 0.5) * 10;
      const len = H * (0.55 + 0.45 * Math.sin(Math.PI * f) * (0.8 + rand() * 0.3));
      return (
        <g key={i} transform={`rotate(${ang.toFixed(0)})`}>
          <path d={FEUILLE} fill={u(i % 2 ? "leafD" : "leafL")} stroke="#1f4d1a" strokeOpacity={0.3} strokeWidth={0.04} transform={`scale(${(Math.max(1.5, len * 0.3)).toFixed(2)} ${len.toFixed(2)})`} />
        </g>
      );
    });
  }

  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      <ellipse cx={0} cy={0.5} rx={W * 0.45} ry={W * 0.15} fill="#000" opacity={0.35} />
      {corps}
    </g>
  );
}
